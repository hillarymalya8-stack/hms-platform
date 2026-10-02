import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InventoryMovementStatus, InventoryMovementType, Prisma } from "@prisma/client";
import { UserContext } from "../../common/auth/user-context";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateInventoryItemDto } from "./dto/create-inventory-item.dto";
import { PostInventoryMovementDto } from "./dto/post-inventory-movement.dto";
import { ReceiveInventoryDto } from "./dto/receive-inventory.dto";

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getWorkspace(user: UserContext) {
    const propertyId = this.requireProperty(user);
    await this.ensureDefaultLocations(propertyId);

    const [items, locations, balances, movements] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: { propertyId, active: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.inventoryLocation.findMany({
        where: { propertyId, active: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.inventoryBalance.findMany({
        where: {
          item: {
            propertyId,
            active: true
          },
          location: {
            active: true
          }
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
        where: { propertyId },
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

    const item = await this.prisma.inventoryItem.create({
      data: {
        propertyId,
        sku,
        name,
        unitOfMeasure,
        reorderLevel
      }
    });

    return mapItem(item);
  }

  async receiveStock(user: UserContext, dto: ReceiveInventoryDto) {
    const propertyId = this.requireProperty(user);
    const quantity = new Prisma.Decimal(dto.quantity);
    const unitCost = new Prisma.Decimal(dto.unitCost);

    if (quantity.lte(0) || unitCost.lt(0)) {
      throw new BadRequestException("Receipt quantity must be greater than zero and cost cannot be negative.");
    }

    return this.prisma.$transaction(async (tx) => {
      const { item, location } = await this.getItemAndLocation(tx, propertyId, dto.itemId, dto.locationId);
      const existingBalance = await tx.inventoryBalance.findUnique({
        where: {
          itemId_locationId: {
            itemId: item.id,
            locationId: location.id
          }
        }
      });
      const currentQuantity = existingBalance?.quantityOnHand ?? new Prisma.Decimal(0);
      const currentValue = currentQuantity.mul(existingBalance?.averageCost ?? 0);
      const receiptValue = quantity.mul(unitCost);
      const nextQuantity = currentQuantity.plus(quantity);
      const averageCost = nextQuantity.gt(0) ? currentValue.plus(receiptValue).div(nextQuantity) : unitCost;

      const balance = await tx.inventoryBalance.upsert({
        where: {
          itemId_locationId: {
            itemId: item.id,
            locationId: location.id
          }
        },
        update: {
          quantityOnHand: nextQuantity,
          averageCost
        },
        create: {
          itemId: item.id,
          locationId: location.id,
          quantityOnHand: quantity,
          averageCost: unitCost
        },
        include: {
          item: true,
          location: true
        }
      });

      const movement = await tx.inventoryMovement.create({
        data: {
          propertyId,
          itemId: item.id,
          toLocationId: location.id,
          movementType: InventoryMovementType.RECEIPT,
          status: InventoryMovementStatus.POSTED,
          sourceType: dto.supplierDoc?.trim() ? "SUPPLIER_DOC" : "MANUAL_RECEIPT",
          quantity,
          unitCost,
          totalCost: receiptValue,
          businessDate: todayDateOnly(),
          postedAt: new Date()
        },
        include: {
          item: true,
          fromLocation: true,
          toLocation: true
        }
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

      const item = await tx.inventoryItem.findFirst({
        where: { id: dto.itemId, propertyId, active: true }
      });

      if (!item) {
        throw new NotFoundException("Material was not found.");
      }

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
      let target = null;

      if (dto.movementType === "TRANSFER") {
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

      await tx.inventoryBalance.update({
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
      if (target) {
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
          movementType: dto.movementType === "TRANSFER" ? InventoryMovementType.TRANSFER : InventoryMovementType.ISSUE,
          status: InventoryMovementStatus.POSTED,
          sourceType: dto.destination?.trim() || "MANUAL_MOVEMENT",
          quantity,
          unitCost,
          totalCost,
          businessDate: todayDateOnly(),
          postedAt: new Date()
        },
        include: {
          item: true,
          fromLocation: true,
          toLocation: true
        }
      });

      return {
        movement: mapMovement(movement),
        targetBalance: targetBalance ? mapBalance(targetBalance) : null
      };
    });
  }

  private async getItemAndLocation(tx: Prisma.TransactionClient, propertyId: string, itemId: string, locationId: string) {
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
    for (const location of [
      ["MAIN", "Main Store", "STORE"],
      ["KITCHEN", "Kitchen Store", "KITCHEN"],
      ["BAR", "Bar Store", "BAR"]
    ] as const) {
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

type InventoryItemRecord = {
  id: string;
  sku: string;
  name: string;
  unitOfMeasure: string;
  reorderLevel: Prisma.Decimal;
};

type InventoryLocationRecord = {
  id: string;
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
    type: location.locationType
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

function mapMovement(movement: {
  id: string;
  movementType: InventoryMovementType;
  quantity: Prisma.Decimal;
  totalCost: Prisma.Decimal;
  createdAt: Date;
  item: { name: string };
  fromLocation?: { name: string } | null;
  toLocation?: { name: string } | null;
}) {
  const isTransfer = movement.movementType === InventoryMovementType.TRANSFER;
  const isReceipt = movement.movementType === InventoryMovementType.RECEIPT;
  const locationName = isReceipt
    ? movement.toLocation?.name ?? "Receiving"
    : isTransfer
      ? `${movement.fromLocation?.name ?? "Source"} to ${movement.toLocation?.name ?? "Target"}`
      : movement.fromLocation?.name ?? "Issue";

  return {
    id: movement.id,
    type: movement.movementType,
    reference: `${movement.movementType.slice(0, 3)}-${movement.createdAt.getUTCFullYear()}-${movement.id.slice(0, 8)}`,
    itemName: movement.item.name,
    locationName,
    quantity: Number(movement.quantity),
    value: Number(movement.totalCost),
    posting: isReceipt
      ? "Dr Inventory, Cr Supplier accrual"
      : isTransfer
        ? "No P&L impact, stock moved between locations"
        : "Dr Cost of sales/expense, Cr Inventory"
  };
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
