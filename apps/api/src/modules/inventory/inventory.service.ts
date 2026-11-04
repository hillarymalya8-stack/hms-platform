import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { canRecordUsageAt, canUseStore, storeAccess } from "@hms/shared";
import { InventoryMovementStatus, InventoryMovementType, Prisma } from "@prisma/client";
import { UserContext } from "../../common/auth/user-context";
import { PrismaService } from "../../common/prisma/prisma.service";
import { auditData, parseDateBoundary } from "../audit/audit.service";
import { AdjustInventoryDto } from "./dto/adjust-inventory.dto";
import { CreateInventoryItemDto } from "./dto/create-inventory-item.dto";
import { InventoryHistoryQueryDto } from "./dto/inventory-history-query.dto";
import { UpdateInventoryItemDto } from "./dto/update-inventory-item.dto";
import { PostInventoryMovementDto } from "./dto/post-inventory-movement.dto";
import { RecordDailyUsageDto } from "./dto/record-daily-usage.dto";
import { ReceiveInventoryDto } from "./dto/receive-inventory.dto";
import { lockBalance, recordStockMovementAudit, stockActor } from "./stock-ledger";
import { applyStockReceipt } from "./stock-receipt";

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getWorkspace(user: UserContext) {
    const propertyId = this.requireProperty(user);
    await this.ensureDefaultLocations(propertyId);

    const allLocations = await this.prisma.inventoryLocation.findMany({
      where: { propertyId, active: true },
      orderBy: { name: "asc" }
    });
    const locations = allLocations.filter((location) => canUseStore(user.permissions, location.code));
    const locationIds = locations.map((location) => location.id);

    const [items, balances, movements] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: { propertyId, active: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.inventoryBalance.findMany({
        where: {
          item: {
            propertyId,
            active: true
          },
          locationId: { in: locationIds }
        },
        include: {
          item: true,
          location: true
        },
        orderBy: {
          updatedAt: "desc"
        }
      }),
      this.prisma.inventoryMovement.findMany({
        where: {
          propertyId,
          OR: [{ fromLocationId: { in: locationIds } }, { toLocationId: { in: locationIds } }]
        },
        include: {
          item: true,
          fromLocation: true,
          toLocation: true
        },
        orderBy: { createdAt: "desc" },
        take: 20
      })
    ]);

    return {
      items: items.map(mapItem),
      locations: locations.map(mapLocation),
      // Stock can be sent to any store (e.g. Main Store to Bar), but only taken from your own.
      transferTargets: allLocations.map(mapLocation),
      stock: balances.map(mapBalance),
      movements: movements.map(mapMovement)
    };
  }

  async createItem(user: UserContext, dto: CreateInventoryItemDto) {
    const propertyId = this.requireProperty(user);
    const sku = dto.sku.trim().toUpperCase();
    const name = dto.name.trim();
    const unitOfMeasure = dto.unitOfMeasure.trim().toUpperCase();
    const reorderLevel = new Prisma.Decimal(dto.reorderLevel || "0");

    if (!sku || !name || !unitOfMeasure) {
      throw new BadRequestException("SKU, material name, and unit are required.");
    }

    if (reorderLevel.lt(0)) {
      throw new BadRequestException("Reorder level cannot be negative.");
    }

    const existing = await this.prisma.inventoryItem.findFirst({
      where: { propertyId, sku }
    });

    if (existing) {
      throw new ConflictException(`Material SKU ${sku} already exists.`);
    }

    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.inventoryItem.create({
        data: {
          propertyId,
          sku,
          name,
          unitOfMeasure,
          reorderLevel
        }
      });

      await tx.auditLog.create({
        data: auditData({
          organizationId: user.organizationId,
          propertyId,
          userId: user.userId,
          actorName: user.fullName,
          module: "inventory",
          action: "item_created",
          recordType: "inventory_item",
          recordId: created.id,
          itemId: created.id,
          itemName: created.name,
          summary: `Created ${created.name} (${created.sku}), unit ${created.unitOfMeasure}, reorder level ${created.reorderLevel.toFixed(2)}.`,
          newValue: itemSnapshot(created)
        })
      });

      return created;
    });

    return mapItem(item);
  }

  // Edits an item's name, unit or reorder level. The SKU is fixed because POS sales are matched to it.
  async updateItem(user: UserContext, itemId: string, dto: UpdateInventoryItemDto) {
    const propertyId = this.requireProperty(user);

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.inventoryItem.findFirst({ where: { id: itemId, propertyId } });
      if (!before) {
        throw new NotFoundException("Material was not found.");
      }

      const data: Prisma.InventoryItemUpdateInput = {};
      if (dto.name !== undefined) {
        const name = dto.name.trim();
        if (!name) throw new BadRequestException("Item name cannot be empty.");
        data.name = name;
      }
      if (dto.unitOfMeasure !== undefined) {
        const unit = dto.unitOfMeasure.trim().toUpperCase();
        if (!unit) throw new BadRequestException("Unit cannot be empty.");
        data.unitOfMeasure = unit;
      }
      if (dto.reorderLevel !== undefined) {
        const reorderLevel = new Prisma.Decimal(dto.reorderLevel || "0");
        if (reorderLevel.lt(0)) throw new BadRequestException("Reorder level cannot be negative.");
        data.reorderLevel = reorderLevel;
      }

      const after = await tx.inventoryItem.update({ where: { id: before.id }, data });
      const changes = describeItemChanges(before, after);
      if (changes.length === 0) {
        return mapItem(after);
      }

      await tx.auditLog.create({
        data: auditData({
          organizationId: user.organizationId,
          propertyId,
          userId: user.userId,
          actorName: user.fullName,
          module: "inventory",
          action: "item_updated",
          recordType: "inventory_item",
          recordId: after.id,
          itemId: after.id,
          itemName: after.name,
          summary: `${changes.join("; ")}.${dto.reason?.trim() ? ` Reason: ${dto.reason.trim()}.` : ""}`,
          previousValue: itemSnapshot(before),
          newValue: { ...itemSnapshot(after), reason: dto.reason?.trim() || null }
        })
      });

      return mapItem(after);
    });
  }

  async receiveStock(user: UserContext, dto: ReceiveInventoryDto) {
    const propertyId = this.requireProperty(user);
    const quantity = new Prisma.Decimal(dto.quantity);
    const unitCost = new Prisma.Decimal(dto.unitCost);

    if (quantity.lte(0) || unitCost.lt(0)) {
      throw new BadRequestException("Receipt quantity must be greater than zero and cost cannot be negative.");
    }

    const supplierDoc = dto.supplierDoc?.trim();

    return this.prisma.$transaction(async (tx) => {
      const { item, location } = await this.getItemAndLocation(tx, propertyId, dto.itemId, dto.locationId);
      assertStoreAccess(user, location);

      // Same weighted-average calculation as before, now shared with purchase-order receiving.
      const { balance, movement } = await applyStockReceipt(tx, {
        propertyId,
        itemId: item.id,
        locationId: location.id,
        quantity,
        unitCost,
        businessDate: todayDateOnly(),
        sourceType: supplierDoc ? "SUPPLIER_DOC" : "MANUAL_RECEIPT",
        actor: stockActor(user),
        reason: supplierDoc ? `Supplier document ${supplierDoc}` : dto.reason?.trim() || null
      });

      return {
        item: mapItem(item),
        balance: mapBalance(balance),
        movement: mapMovement(movement)
      };
    });
  }

  async postMovement(user: UserContext, dto: PostInventoryMovementDto) {
    const propertyId = this.requireProperty(user);
    const quantity = new Prisma.Decimal(dto.quantity);
    const isTransfer = dto.movementType === "TRANSFER";
    const destination = dto.destination?.trim() || null;
    const reason = dto.reason?.trim() || (isTransfer ? null : destination);

    if (quantity.lte(0)) {
      throw new BadRequestException("Movement quantity must be greater than zero.");
    }

    return this.prisma.$transaction(async (tx) => {
      const source = await tx.inventoryLocation.findFirst({
        where: { id: dto.sourceLocationId, propertyId, active: true }
      });

      if (!source) {
        throw new NotFoundException("Source location was not found.");
      }

      assertStoreAccess(user, source);

      const item = await tx.inventoryItem.findFirst({
        where: { id: dto.itemId, propertyId, active: true }
      });

      if (!item) {
        throw new NotFoundException("Material was not found.");
      }

      let target = null;

      if (isTransfer) {
        if (!dto.targetLocationId) {
          throw new BadRequestException("Choose the target location for a transfer.");
        }

        target = await tx.inventoryLocation.findFirst({
          where: { id: dto.targetLocationId, propertyId, active: true }
        });

        if (!target) {
          throw new NotFoundException("Target location was not found.");
        }

        if (target.id === source.id) {
          throw new BadRequestException("Transfer target must be different from the source location.");
        }
      }

      await lockBalance(tx, item.id, source.id);
      if (target) await lockBalance(tx, item.id, target.id);

      const sourceBalance = await tx.inventoryBalance.findUnique({
        where: {
          itemId_locationId: {
            itemId: item.id,
            locationId: source.id
          }
        }
      });

      if (!sourceBalance || sourceBalance.quantityOnHand.lt(quantity)) {
        throw new ConflictException(`Only ${sourceBalance?.quantityOnHand?.toFixed(2) ?? "0.00"} ${item.unitOfMeasure} available in ${source.name}.`);
      }

      const unitCost = sourceBalance.averageCost;
      const totalCost = quantity.mul(unitCost);

      const updatedSource = await tx.inventoryBalance.update({
        where: {
          itemId_locationId: {
            itemId: item.id,
            locationId: source.id
          }
        },
        data: {
          quantityOnHand: sourceBalance.quantityOnHand.minus(quantity)
        }
      });

      let targetBalance = null;
      let targetBefore: Prisma.Decimal | null = null;
      if (target) {
        const existingTarget = await tx.inventoryBalance.findUnique({
          where: { itemId_locationId: { itemId: item.id, locationId: target.id } }
        });
        targetBefore = existingTarget?.quantityOnHand ?? new Prisma.Decimal(0);
        targetBalance = await tx.inventoryBalance.upsert({
          where: {
            itemId_locationId: {
              itemId: item.id,
              locationId: target.id
            }
          },
          update: {
            quantityOnHand: {
              increment: quantity
            },
            averageCost: unitCost
          },
          create: {
            itemId: item.id,
            locationId: target.id,
            quantityOnHand: quantity,
            averageCost: unitCost
          },
          include: {
            item: true,
            location: true
          }
        });
      }

      const movement = await tx.inventoryMovement.create({
        data: {
          propertyId,
          itemId: item.id,
          fromLocationId: source.id,
          toLocationId: target?.id,
          movementType: isTransfer ? InventoryMovementType.TRANSFER : InventoryMovementType.ISSUE,
          status: InventoryMovementStatus.POSTED,
          sourceType: destination || "MANUAL_MOVEMENT",
          quantity,
          unitCost,
          totalCost,
          businessDate: todayDateOnly(),
          postedAt: new Date(),
          performedByUserId: user.userId,
          performedByName: user.fullName,
          reason,
          fromQuantityBefore: sourceBalance.quantityOnHand,
          fromQuantityAfter: updatedSource.quantityOnHand,
          toQuantityBefore: targetBefore,
          toQuantityAfter: targetBalance?.quantityOnHand ?? null
        },
        include: {
          item: true,
          fromLocation: true,
          toLocation: true
        }
      });

      await recordStockMovementAudit(tx, stockActor(user), {
        action: isTransfer ? "stock_transfer" : "stock_issue",
        propertyId,
        movement,
        item,
        from: source,
        to: target
      });

      return {
        movement: mapMovement(movement),
        targetBalance: targetBalance ? mapBalance(targetBalance) : null
      };
    });
  }

  // Manual correction of a store balance (breakage, count difference, found stock). A reason is required.
  async adjustStock(user: UserContext, dto: AdjustInventoryDto) {
    const propertyId = this.requireProperty(user);
    const quantity = new Prisma.Decimal(dto.quantity);
    const reason = dto.reason?.trim() ?? "";
    const increase = dto.direction === "INCREASE";

    if (quantity.lte(0)) {
      throw new BadRequestException("Adjustment quantity must be greater than zero.");
    }

    if (reason.length < 3) {
      throw new BadRequestException("Give a reason for this stock adjustment.");
    }

    return this.prisma.$transaction(async (tx) => {
      const { item, location } = await this.getItemAndLocation(tx, propertyId, dto.itemId, dto.locationId);
      assertStoreAccess(user, location);

      await lockBalance(tx, item.id, location.id);
      const existing = await tx.inventoryBalance.findUnique({
        where: { itemId_locationId: { itemId: item.id, locationId: location.id } }
      });
      const before = existing?.quantityOnHand ?? new Prisma.Decimal(0);

      if (!increase && before.lt(quantity)) {
        throw new ConflictException(`Only ${before.toFixed(2)} ${item.unitOfMeasure} recorded in ${location.name}.`);
      }

      const unitCost = existing?.averageCost ?? new Prisma.Decimal(0);
      const after = increase ? before.plus(quantity) : before.minus(quantity);

      const balance = await tx.inventoryBalance.upsert({
        where: { itemId_locationId: { itemId: item.id, locationId: location.id } },
        update: { quantityOnHand: after },
        create: { itemId: item.id, locationId: location.id, quantityOnHand: after, averageCost: unitCost },
        include: { item: true, location: true }
      });

      const movement = await tx.inventoryMovement.create({
        data: {
          propertyId,
          itemId: item.id,
          fromLocationId: increase ? null : location.id,
          toLocationId: increase ? location.id : null,
          movementType: InventoryMovementType.ADJUSTMENT,
          status: InventoryMovementStatus.POSTED,
          sourceType: increase ? "MANUAL_ADJUSTMENT_IN" : "MANUAL_ADJUSTMENT_OUT",
          quantity,
          unitCost,
          totalCost: quantity.mul(unitCost),
          businessDate: todayDateOnly(),
          postedAt: new Date(),
          performedByUserId: user.userId,
          performedByName: user.fullName,
          reason,
          fromQuantityBefore: increase ? null : before,
          fromQuantityAfter: increase ? null : balance.quantityOnHand,
          toQuantityBefore: increase ? before : null,
          toQuantityAfter: increase ? balance.quantityOnHand : null
        },
        include: { item: true, fromLocation: true, toLocation: true }
      });

      await recordStockMovementAudit(tx, stockActor(user), {
        action: "stock_adjustment",
        propertyId,
        movement,
        item,
        from: increase ? null : location,
        to: increase ? location : null
      });

      return {
        balance: mapBalance(balance),
        movement: mapMovement(movement)
      };
    });
  }

  // Full stock history for the stores this user can open, newest first, with filters and pages.
  async listHistory(user: UserContext, query: InventoryHistoryQueryDto) {
    const propertyId = this.requireProperty(user);
    const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize ?? "25", 10) || 25));

    const allLocations = await this.prisma.inventoryLocation.findMany({ where: { propertyId } });
    const locationIds = allLocations.filter((location) => canUseStore(user.permissions, location.code)).map((location) => location.id);

    if (query.locationId && !locationIds.includes(query.locationId)) {
      throw new ForbiddenException("You do not have access to that store.");
    }

    const scopedLocations = query.locationId ? [query.locationId] : locationIds;
    const and: Prisma.InventoryMovementWhereInput[] = [
      { propertyId },
      { OR: [{ fromLocationId: { in: scopedLocations } }, { toLocationId: { in: scopedLocations } }] }
    ];
    if (query.itemId) and.push({ itemId: query.itemId });
    if (query.type) and.push({ movementType: query.type });
    if (query.userId) and.push({ performedByUserId: query.userId });
    const from = parseDateBoundary(query.from, "start");
    const to = parseDateBoundary(query.to, "end");
    if (from || to) and.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } });
    const where: Prisma.InventoryMovementWhereInput = { AND: and };

    const [total, movements, performers] = await Promise.all([
      this.prisma.inventoryMovement.count({ where }),
      this.prisma.inventoryMovement.findMany({
        where,
        include: { item: true, fromLocation: true, toLocation: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.inventoryMovement.groupBy({
        by: ["performedByUserId", "performedByName"],
        where: { propertyId, performedByUserId: { not: null } },
        orderBy: { performedByName: "asc" }
      })
    ]);

    const staff = new Map<string, string>();
    for (const entry of performers) {
      if (entry.performedByUserId && !staff.has(entry.performedByUserId)) {
        staff.set(entry.performedByUserId, entry.performedByName ?? "Unnamed staff");
      }
    }

    return {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      staff: [...staff.entries()].map(([id, name]) => ({ id, name })),
      movements: movements.map(mapMovement)
    };
  }

  async listDailyUsage(user: UserContext, date?: string) {
    const propertyId = this.requireProperty(user);
    const businessDate = parseBusinessDate(date);

    const locations = await this.prisma.inventoryLocation.findMany({
      where: { propertyId, active: true }
    });
    const locationIds = locations
      .filter((location) => canUseStore(user.permissions, location.code) && canRecordUsageAt(location.code))
      .map((location) => location.id);

    const records = await this.prisma.dailyUsageRecord.findMany({
      where: { propertyId, businessDate, locationId: { in: locationIds } },
      include: {
        item: true,
        location: true
      },
      orderBy: { createdAt: "desc" }
    });

    return {
      businessDate: businessDate.toISOString().slice(0, 10),
      records: records.map(mapUsageRecord)
    };
  }

  // Usage notes are a log only: they never touch inventory balances or movements.
  async recordDailyUsage(user: UserContext, dto: RecordDailyUsageDto) {
    const propertyId = this.requireProperty(user);
    const quantity = new Prisma.Decimal(dto.quantity);

    if (quantity.lte(0)) {
      throw new BadRequestException("Used quantity must be greater than zero.");
    }

    const { item, location } = await this.getItemAndLocation(this.prisma, propertyId, dto.itemId, dto.locationId);
    assertStoreAccess(user, location);

    if (!canRecordUsageAt(location.code)) {
      throw new BadRequestException(`Goods used are recorded in the Bar or Restaurant outlet, not in ${location.name}.`);
    }

    const balance = await this.prisma.inventoryBalance.findUnique({
      where: {
        itemId_locationId: {
          itemId: item.id,
          locationId: location.id
        }
      }
    });
    const unitCost = balance?.averageCost ?? new Prisma.Decimal(0);

    const record = await this.prisma.dailyUsageRecord.create({
      data: {
        propertyId,
        itemId: item.id,
        locationId: location.id,
        businessDate: parseBusinessDate(dto.businessDate),
        quantity,
        unitCost,
        totalCost: quantity.mul(unitCost),
        purpose: dto.purpose?.trim() || null,
        notes: dto.notes?.trim() || null,
        recordedByUserId: user.userId,
        recordedByName: user.fullName
      },
      include: {
        item: true,
        location: true
      }
    });

    return mapUsageRecord(record);
  }

  private async getItemAndLocation(tx: Prisma.TransactionClient | PrismaService, propertyId: string, itemId: string, locationId: string) {
    const [item, location] = await Promise.all([
      tx.inventoryItem.findFirst({
        where: { id: itemId, propertyId, active: true }
      }),
      tx.inventoryLocation.findFirst({
        where: { id: locationId, propertyId, active: true }
      })
    ]);

    if (!item) {
      throw new NotFoundException("Material was not found.");
    }

    if (!location) {
      throw new NotFoundException("Inventory location was not found.");
    }

    return { item, location };
  }

  private async ensureDefaultLocations(propertyId: string) {
    const locationTypes = { MAIN: "STORE", BAR: "BAR", KITCHEN: "KITCHEN" } as const;
    for (const location of storeAccess.map((store) => [store.locationCode, store.label, locationTypes[store.locationCode]] as const)) {
      await this.prisma.inventoryLocation.upsert({
        where: {
          propertyId_code: {
            propertyId,
            code: location[0]
          }
        },
        update: {
          name: location[1],
          locationType: location[2],
          active: true
        },
        create: {
          propertyId,
          code: location[0],
          name: location[1],
          locationType: location[2]
        }
      });
    }
  }

  private requireProperty(user: UserContext) {
    if (!user.propertyId) {
      throw new BadRequestException("A property context is required.");
    }

    return user.propertyId;
  }
}

function assertStoreAccess(user: UserContext, location: { code: string; name: string }) {
  if (!canUseStore(user.permissions, location.code)) {
    throw new ForbiddenException(`You do not have access to ${location.name}.`);
  }
}

type InventoryItemRecord = {
  id: string;
  sku: string;
  name: string;
  unitOfMeasure: string;
  reorderLevel: Prisma.Decimal;
};

type InventoryLocationRecord = {
  id: string;
  code: string;
  name: string;
  locationType: string;
};

type InventoryBalanceRecord = {
  itemId: string;
  locationId: string;
  quantityOnHand: Prisma.Decimal;
  averageCost: Prisma.Decimal;
  item: InventoryItemRecord;
  location: InventoryLocationRecord;
};

function mapItem(item: InventoryItemRecord) {
  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    category: materialCategory(item.sku),
    unit: item.unitOfMeasure,
    reorderLevel: Number(item.reorderLevel)
  };
}

function mapLocation(location: InventoryLocationRecord) {
  return {
    id: location.id,
    name: location.name,
    type: location.locationType,
    code: location.code,
    usageAllowed: canRecordUsageAt(location.code)
  };
}

function mapBalance(balance: InventoryBalanceRecord) {
  return {
    itemId: balance.itemId,
    locationId: balance.locationId,
    quantity: Number(balance.quantityOnHand),
    averageCost: Number(balance.averageCost),
    reorderLevel: Number(balance.item.reorderLevel)
  };
}

type MovementRecord = {
  id: string;
  movementType: InventoryMovementType;
  quantity: Prisma.Decimal;
  totalCost: Prisma.Decimal;
  createdAt: Date;
  sourceType: string | null;
  sourceId: string | null;
  reason: string | null;
  performedByUserId: string | null;
  performedByName: string | null;
  fromQuantityBefore: Prisma.Decimal | null;
  fromQuantityAfter: Prisma.Decimal | null;
  toQuantityBefore: Prisma.Decimal | null;
  toQuantityAfter: Prisma.Decimal | null;
  item: { id?: string; name: string; sku?: string; unitOfMeasure?: string };
  fromLocation?: { id?: string; name: string } | null;
  toLocation?: { id?: string; name: string } | null;
};

function mapMovement(movement: MovementRecord) {
  const isTransfer = movement.movementType === InventoryMovementType.TRANSFER;
  const isReceipt = movement.movementType === InventoryMovementType.RECEIPT;
  const isAdjustment = movement.movementType === InventoryMovementType.ADJUSTMENT;
  const locationName = isReceipt
    ? movement.toLocation?.name ?? "Receiving"
    : isTransfer
      ? `${movement.fromLocation?.name ?? "Source"} to ${movement.toLocation?.name ?? "Target"}`
      : isAdjustment
        ? movement.toLocation?.name ?? movement.fromLocation?.name ?? "Adjustment"
        : movement.fromLocation?.name ?? "Issue";
  const decimal = (value: Prisma.Decimal | null) => (value === null ? null : Number(value));

  return {
    id: movement.id,
    type: movement.movementType,
    action: movementActionLabel(movement),
    reference: `${movement.movementType.slice(0, 3)}-${movement.createdAt.getUTCFullYear()}-${movement.id.slice(0, 8)}`,
    itemId: movement.item.id ?? null,
    itemName: movement.item.name,
    sku: movement.item.sku ?? null,
    unit: movement.item.unitOfMeasure ?? null,
    locationName,
    quantity: Number(movement.quantity),
    value: Number(movement.totalCost),
    // null = older movement posted before staff tracking ("Not recorded").
    staffName: movement.performedByName,
    staffUserId: movement.performedByUserId,
    reason: movement.reason,
    source: movement.sourceType,
    createdAt: movement.createdAt.toISOString(),
    from: movement.fromLocation
      ? {
          name: movement.fromLocation.name,
          quantityBefore: decimal(movement.fromQuantityBefore),
          quantityAfter: decimal(movement.fromQuantityAfter)
        }
      : null,
    to: movement.toLocation
      ? {
          name: movement.toLocation.name,
          quantityBefore: decimal(movement.toQuantityBefore),
          quantityAfter: decimal(movement.toQuantityAfter)
        }
      : null,
    posting: isReceipt
      ? "Dr Inventory, Cr Supplier accrual"
      : isTransfer
        ? "No P&L impact, stock moved between locations"
        : isAdjustment
          ? "Stock count correction"
          : "Dr Cost of sales/expense, Cr Inventory"
  };
}

function movementActionLabel(movement: { movementType: InventoryMovementType; sourceType: string | null; toLocation?: unknown }) {
  const source = movement.sourceType ?? "";
  switch (movement.movementType) {
    case InventoryMovementType.RECEIPT:
      return source === "PURCHASE_ORDER" ? "Received (purchase order)" : "Received";
    case InventoryMovementType.TRANSFER:
      return "Transferred";
    case InventoryMovementType.ISSUE:
      return source.startsWith("Bar sale") ? "Sold (POS deduction)" : "Issued";
    case InventoryMovementType.ADJUSTMENT:
      if (source.startsWith("Bar order")) return "Returned (POS edit/void)";
      return movement.toLocation ? "Adjusted up" : "Adjusted down";
    default:
      return "Count variance";
  }
}

function itemSnapshot(item: { sku: string; name: string; unitOfMeasure: string; reorderLevel: Prisma.Decimal; active: boolean }) {
  return {
    sku: item.sku,
    name: item.name,
    unitOfMeasure: item.unitOfMeasure,
    reorderLevel: item.reorderLevel.toString(),
    active: item.active
  };
}

function describeItemChanges(
  before: { name: string; unitOfMeasure: string; reorderLevel: Prisma.Decimal },
  after: { name: string; unitOfMeasure: string; reorderLevel: Prisma.Decimal }
) {
  const changes: string[] = [];
  if (before.name !== after.name) changes.push(`Name "${before.name}" to "${after.name}"`);
  if (before.unitOfMeasure !== after.unitOfMeasure) changes.push(`Unit ${before.unitOfMeasure} to ${after.unitOfMeasure}`);
  if (!before.reorderLevel.eq(after.reorderLevel)) {
    changes.push(`Reorder level ${before.reorderLevel.toFixed(2)} to ${after.reorderLevel.toFixed(2)}`);
  }
  return changes;
}

function mapUsageRecord(record: {
  id: string;
  businessDate: Date;
  quantity: Prisma.Decimal;
  totalCost: Prisma.Decimal;
  purpose: string | null;
  notes: string | null;
  recordedByName: string | null;
  createdAt: Date;
  item: InventoryItemRecord;
  location: InventoryLocationRecord;
}) {
  return {
    id: record.id,
    businessDate: record.businessDate.toISOString().slice(0, 10),
    itemId: record.item.id,
    itemName: record.item.name,
    unit: record.item.unitOfMeasure,
    locationId: record.location.id,
    locationName: record.location.name,
    locationType: record.location.locationType,
    quantity: Number(record.quantity),
    value: Number(record.totalCost),
    purpose: record.purpose,
    notes: record.notes,
    recordedBy: record.recordedByName,
    recordedAt: record.createdAt.toISOString()
  };
}

function parseBusinessDate(value?: string) {
  if (!value) {
    return todayDateOnly();
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    throw new BadRequestException("Business date must be in YYYY-MM-DD format.");
  }

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function materialCategory(sku: string) {
  if (sku.startsWith("FOOD")) return "Food";
  if (sku.startsWith("BAR") || sku.startsWith("BEV")) return "Beverage";
  if (sku.startsWith("HK")) return "Housekeeping";
  return "Materials";
}

function todayDateOnly() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
