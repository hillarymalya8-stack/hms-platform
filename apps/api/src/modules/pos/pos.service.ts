import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { canUseOutlet } from "@hms/shared";
import {
  FolioItemType,
  FolioStatus,
  InventoryMovementStatus,
  InventoryMovementType,
  PaymentMethod,
  PaymentStatus,
  PosOrderStatus,
  PosOutletType,
  PosServiceType,
  Prisma,
  ReservationStatus,
  RoomOccupancyStatus
} from "@prisma/client";
import { UserContext } from "../../common/auth/user-context";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreatePosOrderDto } from "./dto/create-pos-order.dto";
import { PayPosOrderDto } from "./dto/pay-pos-order.dto";
import { assertPaymentReferencePolicy } from "./pos-payment-policy";
import { calculatePosOrderTotals } from "./pos-totals";

// Bar stock below this many pieces triggers a restock alert on the bar terminal.
const BAR_RESTOCK_THRESHOLD = 3;

@Injectable()
export class PosService {
  constructor(private readonly prisma: PrismaService) {}

  listOutlets(user: UserContext) {
    const propertyId = this.requireProperty(user);
    return this.prisma.posOutlet.findMany({
      where: { propertyId, active: true, outletType: { in: allowedOutletTypes(user) } },
      include: {
        terminals: true,
        tables: {
          orderBy: { tableNumber: "asc" }
        }
      },
      orderBy: { name: "asc" }
    });
  }

  listCatalog(user: UserContext, outletId: string) {
    const propertyId = this.requireProperty(user);
    return this.prisma.outletProduct.findMany({
      where: {
        outletId,
        available: true,
        productVariant: { active: true, product: { active: true } },
        outlet: {
          propertyId,
          outletType: { in: allowedOutletTypes(user) }
        }
      },
      include: {
        productVariant: {
          include: {
            product: {
              include: {
                category: true
              }
            }
          }
        }
      },
      orderBy: {
        productVariant: {
          product: {
            name: "asc"
          }
        }
      }
    });
  }

  listOrders(user: UserContext) {
    const propertyId = this.requireProperty(user);
    return this.prisma.posOrder.findMany({
      where: { propertyId, outlet: { outletType: { in: allowedOutletTypes(user) } } },
      include: {
        items: {
          include: {
            productVariant: {
              include: {
                product: true
              }
            }
          }
        },
        outlet: true,
        payments: true,
        table: true
      },
      orderBy: { createdAt: "desc" },
      take: 50
    });
  }

  async listPrepNotifications(user: UserContext, stationFilter?: string) {
    const propertyId = this.requireProperty(user);
    const normalizedFilter = stationFilter?.trim().toLowerCase();
    const orders = await this.prisma.posOrder.findMany({
      where: { propertyId, outlet: { outletType: { in: allowedOutletTypes(user) } } },
      include: {
        items: {
          include: {
            productVariant: {
              include: {
                product: {
                  include: {
                    category: true
                  }
                }
              }
            }
          }
        },
        outlet: true,
        table: true,
        terminal: true
      },
      orderBy: { createdAt: "desc" },
      take: 60
    });

    const tickets = orders.flatMap((order) => {
      const stationLines = new Map<string, Array<{ name: string; quantity: string; category: string }>>();

      for (const item of order.items) {
        const category = item.productVariant.product.category.name;
        const station = prepStationFor(category, order.outlet.outletType);
        const current = stationLines.get(station) ?? [];
        current.push({
          name: item.productVariant.product.name,
          quantity: item.quantity.toFixed(2),
          category
        });
        stationLines.set(station, current);
      }

      return Array.from(stationLines.entries()).map(([station, lines], index) => ({
        id: `${order.id}-${station.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        ticketNumber: `${order.orderNumber}-${String(index + 1).padStart(2, "0")}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderStatus: order.status,
        station,
        outletName: order.outlet.name,
        outletType: order.outlet.outletType,
        terminalName: order.terminal?.name ?? order.terminal?.deviceIdentifier ?? "POS terminal",
        tableNumber: order.table?.tableNumber ?? null,
        serviceType: order.serviceType,
        createdAt: order.createdAt,
        lines
      }));
    });

    const filteredTickets = normalizedFilter
      ? tickets.filter((ticket) => ticket.station.toLowerCase().includes(normalizedFilter))
      : tickets;

    return {
      generatedAt: new Date(),
      tickets: filteredTickets,
      totals: {
        restaurant: tickets.filter((ticket) => ticket.station === "Restaurant Kitchen").length,
        bar: tickets.filter((ticket) => ticket.station === "Bar Printer").length,
        service: tickets.filter((ticket) => ticket.station === "Service Desk").length
      }
    };
  }

  async listChargeableRooms(user: UserContext) {
    const propertyId = this.requireProperty(user);
    const assignedRooms = await this.prisma.reservationRoom.findMany({
      where: {
        roomId: { not: null },
        status: ReservationStatus.CHECKED_IN,
        room: {
          propertyId,
          active: true,
          occupancyStatus: RoomOccupancyStatus.OCCUPIED
        },
        reservation: {
          propertyId,
          status: ReservationStatus.CHECKED_IN
        }
      },
      include: {
        room: {
          include: {
            roomType: true
          }
        },
        reservation: {
          include: {
            primaryGuest: true,
            folios: {
              where: {
                status: FolioStatus.OPEN
              },
              orderBy: {
                openedAt: "desc"
              },
              take: 1
            }
          }
        }
      }
    });

    return assignedRooms
      .map((assignedRoom) => {
        const room = assignedRoom.room;
        const folio = assignedRoom.reservation.folios[0];

        if (!room || !folio) return null;

        return {
          roomId: room.id,
          roomNumber: room.roomNumber,
          roomType: room.roomType.name,
          reservationId: assignedRoom.reservation.id,
          reservationNumber: assignedRoom.reservation.reservationNumber,
          guest: {
            id: assignedRoom.reservation.primaryGuest.id,
            firstName: assignedRoom.reservation.primaryGuest.firstName,
            lastName: assignedRoom.reservation.primaryGuest.lastName
          },
          folio: {
            id: folio.id,
            folioNumber: folio.folioNumber,
            balance: money(folio.balance),
            currencyCode: assignedRoom.currencyCode
          }
        };
      })
      .filter((room): room is NonNullable<typeof room> => Boolean(room))
      .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
  }

  async listBarLowStock(user: UserContext) {
    const propertyId = this.requireProperty(user);

    if (!canUseOutlet(user.permissions, PosOutletType.BAR)) {
      return { threshold: BAR_RESTOCK_THRESHOLD, items: [] };
    }
    const balances = await this.prisma.inventoryBalance.findMany({
      where: {
        quantityOnHand: { lt: BAR_RESTOCK_THRESHOLD },
        item: { propertyId, active: true },
        location: { propertyId, code: "BAR", active: true }
      },
      include: { item: true },
      orderBy: { quantityOnHand: "asc" }
    });

    return {
      threshold: BAR_RESTOCK_THRESHOLD,
      items: balances.map((balance) => ({
        itemId: balance.itemId,
        sku: balance.item.sku,
        name: balance.item.name,
        unit: balance.item.unitOfMeasure,
        quantity: Number(balance.quantityOnHand)
      }))
    };
  }

  async createOrder(user: UserContext, dto: CreatePosOrderDto) {
    const propertyId = this.requireProperty(user);

    const currencyCode = dto.currencyCode ?? "TZS";

    return this.prisma.$transaction(async (tx) => {
      const outlet = await tx.posOutlet.findFirst({
        where: {
          id: dto.outletId,
          propertyId,
          active: true
        }
      });

      if (!outlet) {
        throw new NotFoundException("POS outlet was not found.");
      }

      assertOutletAccess(user, outlet);

      if (dto.idempotencyKey) {
        const existingOrder = await tx.posOrder.findFirst({
          where: {
            propertyId,
            idempotencyKey: dto.idempotencyKey
          },
          include: {
            items: {
              include: {
                productVariant: {
                  include: {
                    product: true
                  }
                }
              }
            },
            outlet: true,
            payments: true,
            table: true
          }
        });

        if (existingOrder) {
          return existingOrder;
        }
      }

      if (dto.tableId) {
        const table = await tx.diningTable.findFirst({
          where: {
            id: dto.tableId,
            outletId: outlet.id
          }
        });

        if (!table) {
          throw new NotFoundException("Dining table was not found.");
        }
      }

      if (dto.folioId) {
        const folio = await tx.folio.findFirst({
          where: {
            id: dto.folioId,
            propertyId,
            status: FolioStatus.OPEN,
            reservation: {
              status: ReservationStatus.CHECKED_IN,
              reservationRooms: {
                some: {
                  roomId: { not: null },
                  status: ReservationStatus.CHECKED_IN
                }
              }
            }
          }
        });

        if (!folio) {
          throw new BadRequestException("Choose an occupied room with an open folio before charging to room.");
        }

        const stay = await tx.reservationRoom.findFirst({
          where: { reservationId: folio.reservationId, status: ReservationStatus.CHECKED_IN }
        });
        if (stay && stay.currencyCode !== currencyCode) {
          const label = currencyLabel(stay.currencyCode);
          throw new BadRequestException(`This room's folio is in ${label}. Sell in ${label} to charge it to the room.`);
        }
      }

      const variants = dto.items.map((item) => item.productVariantId);
      const outletProducts = await tx.outletProduct.findMany({
        where: {
          outletId: outlet.id,
          productVariantId: { in: variants },
          available: true,
          productVariant: { active: true, product: { active: true } }
        },
        include: {
          productVariant: {
            include: {
              product: true
            }
          }
        }
      });

      const catalogByVariant = new Map(outletProducts.map((item) => [item.productVariantId, item]));
      const missingItem = dto.items.find((item) => !catalogByVariant.has(item.productVariantId));
      if (missingItem) {
        throw new BadRequestException("One or more products are not available in this outlet.");
      }

      const unitPriceFor = (catalogItem: (typeof outletProducts)[number]) => {
        if (currencyCode === "TZS") return catalogItem.price;
        if (!catalogItem.priceUsd) {
          throw new BadRequestException(`${catalogItem.productVariant.product.name} has no USD price. Add one in Menu management or sell in TSh.`);
        }
        return catalogItem.priceUsd;
      };

      const totals = calculatePosOrderTotals(
        dto.items.map((item) => {
          const catalogItem = catalogByVariant.get(item.productVariantId);
          if (!catalogItem) {
            throw new BadRequestException("Product is not available in this outlet.");
          }

          return {
            quantity: item.quantity,
            unitPrice: unitPriceFor(catalogItem).toString(),
            taxRate: catalogItem.taxRate.toString()
          };
        })
      );

      const orderNumber = await this.nextOrderNumber(tx, propertyId, new Date());
      const order = await tx.posOrder.create({
        data: {
          propertyId,
          outletId: outlet.id,
          terminalId: dto.terminalId,
          shiftId: dto.shiftId,
          tableId: dto.tableId,
          folioId: dto.folioId,
          orderNumber,
          serviceType: dto.serviceType ? PosServiceType[dto.serviceType] : PosServiceType.DINE_IN,
          currencyCode,
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          taxTotal: totals.taxTotal,
          grandTotal: totals.grandTotal,
          idempotencyKey: dto.idempotencyKey,
          items: {
            create: dto.items.map((item, index) => {
              const catalogItem = catalogByVariant.get(item.productVariantId);
              const itemTotal = totals.itemTotals[index];
              if (!catalogItem) {
                throw new BadRequestException("Product is not available in this outlet.");
              }

              return {
                productVariantId: item.productVariantId,
                quantity: itemTotal.quantity,
                unitPrice: unitPriceFor(catalogItem),
                discountAmount: itemTotal.discountAmount,
                taxAmount: itemTotal.taxAmount,
                totalAmount: itemTotal.totalAmount
              };
            })
          }
        },
        include: {
          items: {
            include: {
              productVariant: {
                include: {
                  product: true
                }
              }
            }
          },
          outlet: true,
          table: true
        }
      });

      if (dto.tableId) {
        await tx.diningTable.update({
          where: { id: dto.tableId },
          data: { status: "ORDER_OPEN" }
        });
      }

      if (outlet.outletType === PosOutletType.BAR) {
        await this.deductBarStock(tx, propertyId, order);
      }

      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          propertyId,
          userId: user.userId,
          module: "pos",
          action: "create_order",
          recordType: "pos_order",
          recordId: order.id,
          newValue: {
            orderNumber: order.orderNumber,
            outletId: order.outletId,
            grandTotal: order.grandTotal.toString(),
            currencyCode: order.currencyCode
          }
        }
      });

      return order;
    });
  }

  async payOrder(user: UserContext, orderId: string, dto: PayPosOrderDto) {
    const propertyId = this.requireProperty(user);

    try {
      assertPaymentReferencePolicy(dto);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.idempotencyKey) {
        const existingPayment = await tx.payment.findFirst({
          where: {
            propertyId,
            idempotencyKey: dto.idempotencyKey
          },
          include: {
            order: {
              include: {
                items: {
                  include: {
                    productVariant: {
                      include: {
                        product: true
                      }
                    }
                  }
                },
                outlet: true,
                payments: true,
                table: true
              }
            }
          }
        });

        if (existingPayment?.order) {
          return existingPayment.order;
        }
      }

      const order = await tx.posOrder.findFirst({
        where: {
          id: orderId,
          propertyId
        },
        include: {
          outlet: true,
          payments: true
        }
      });

      if (!order) {
        throw new NotFoundException("POS order was not found.");
      }

      assertOutletAccess(user, order.outlet);

      if (order.status !== PosOrderStatus.OPEN && order.status !== PosOrderStatus.HELD) {
        throw new ConflictException("Only open POS orders can receive payment.");
      }

      if (dto.paymentMethod === PaymentMethod.ROOM_CHARGE && !order.folioId) {
        throw new BadRequestException("Room charge payments require a linked guest folio.");
      }

      if (dto.externalReceiptNumber) {
        const duplicate = await tx.payment.findFirst({
          where: {
            propertyId,
            paymentMethod: dto.paymentMethod,
            externalReceiptNumber: dto.externalReceiptNumber,
            status: PaymentStatus.COMPLETED
          }
        });

        if (duplicate) {
          throw new ConflictException("This external receipt ID has already been used for this payment method.");
        }
      }

      const amount = new Prisma.Decimal(dto.amount);
      const paidTotal = order.payments
        .filter((payment) => payment.status === PaymentStatus.COMPLETED)
        .reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
      const remaining = order.grandTotal.minus(paidTotal);

      if (amount.lte(0)) {
        throw new BadRequestException("Payment amount must be greater than zero.");
      }

      if (amount.gt(remaining)) {
        throw new BadRequestException("Payment amount cannot exceed the order balance.");
      }

      const systemReceiptNumber = await this.nextReceiptNumber(tx, propertyId, new Date());
      const payment = await tx.payment.create({
        data: {
          propertyId,
          orderId: order.id,
          shiftId: order.shiftId,
          sourceType: "POS_ORDER",
          sourceId: order.id,
          paymentMethod: dto.paymentMethod,
          amount,
          currencyCode: order.currencyCode,
          systemReceiptNumber,
          externalReceiptNumber: dto.externalReceiptNumber,
          authorizationCode: dto.authorizationCode,
          externalReference: dto.externalReference,
          idempotencyKey: dto.idempotencyKey
        }
      });

      if (dto.paymentMethod === PaymentMethod.ROOM_CHARGE && order.folioId) {
        await tx.folioItem.create({
          data: {
            folioId: order.folioId,
            itemType: FolioItemType.POS_CHARGE,
            sourceType: "POS_ORDER",
            sourceId: order.id,
            description: `POS order ${order.orderNumber}`,
            quantity: new Prisma.Decimal(1),
            unitPrice: amount,
            totalAmount: amount
          }
        });

        await tx.folio.update({
          where: { id: order.folioId },
          data: {
            balance: {
              increment: amount
            }
          }
        });
      }

      const orderPaid = paidTotal.plus(amount).eq(order.grandTotal);
      const updatedOrder = await tx.posOrder.update({
        where: { id: order.id },
        data: {
          status: orderPaid ? PosOrderStatus.PAID : PosOrderStatus.OPEN
        },
        include: {
          items: {
            include: {
              productVariant: {
                include: {
                  product: true
                }
              }
            }
          },
          outlet: true,
          payments: true,
          table: true
        }
      });

      if (orderPaid && order.tableId) {
        await tx.diningTable.update({
          where: { id: order.tableId },
          data: { status: "AVAILABLE" }
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          propertyId,
          userId: user.userId,
          module: "pos",
          action: "take_payment",
          recordType: "payment",
          recordId: payment.id,
          newValue: {
            systemReceiptNumber: payment.systemReceiptNumber,
            externalReceiptNumber: payment.externalReceiptNumber,
            paymentMethod: payment.paymentMethod,
            amount: payment.amount.toString()
          }
        }
      });

      return updatedOrder;
    });
  }

  // Bar sales relieve the Bar Store. Menu items are matched to inventory materials by
  // variant SKU, then product SKU, then name; unmatched items (e.g. cocktails) are skipped.
  private async deductBarStock(
    tx: Prisma.TransactionClient,
    propertyId: string,
    order: {
      id: string;
      orderNumber: string;
      items: Array<{ quantity: Prisma.Decimal; productVariant: { sku: string; product: { sku: string; name: string } } }>;
    }
  ) {
    const barStore = await tx.inventoryLocation.findFirst({
      where: { propertyId, code: "BAR", active: true }
    });

    if (!barStore) {
      return;
    }

    const items = await tx.inventoryItem.findMany({
      where: { propertyId, active: true }
    });
    const bySku = new Map(items.map((item) => [item.sku.toUpperCase(), item]));
    const byName = new Map(items.map((item) => [item.name.trim().toLowerCase(), item]));
    const now = new Date();
    const businessDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    for (const line of order.items) {
      const variant = line.productVariant;
      const item =
        bySku.get(variant.sku.toUpperCase()) ??
        bySku.get(variant.product.sku.toUpperCase()) ??
        byName.get(variant.product.name.trim().toLowerCase());

      if (!item) {
        continue;
      }

      const balance = await tx.inventoryBalance.findUnique({
        where: {
          itemId_locationId: {
            itemId: item.id,
            locationId: barStore.id
          }
        }
      });
      const unitCost = balance?.averageCost ?? new Prisma.Decimal(0);

      await tx.inventoryBalance.upsert({
        where: {
          itemId_locationId: {
            itemId: item.id,
            locationId: barStore.id
          }
        },
        update: {
          quantityOnHand: {
            decrement: line.quantity
          }
        },
        create: {
          itemId: item.id,
          locationId: barStore.id,
          quantityOnHand: line.quantity.negated(),
          averageCost: unitCost
        }
      });

      await tx.inventoryMovement.create({
        data: {
          propertyId,
          itemId: item.id,
          fromLocationId: barStore.id,
          movementType: InventoryMovementType.ISSUE,
          status: InventoryMovementStatus.POSTED,
          sourceType: `Bar sale ${order.orderNumber}`,
          sourceId: order.id,
          quantity: line.quantity,
          unitCost,
          totalCost: line.quantity.mul(unitCost),
          businessDate,
          postedAt: now
        }
      });
    }
  }

  private async nextOrderNumber(tx: Prisma.TransactionClient, propertyId: string, date: Date) {
    const year = date.getUTCFullYear();
    const count = await tx.posOrder.count({
      where: {
        propertyId,
        orderNumber: {
          startsWith: `POS-${year}-`
        }
      }
    });

    return `POS-${year}-${String(count + 1).padStart(5, "0")}`;
  }

  private async nextReceiptNumber(tx: Prisma.TransactionClient, propertyId: string, date: Date) {
    const year = date.getUTCFullYear();
    const count = await tx.payment.count({
      where: {
        propertyId,
        systemReceiptNumber: {
          startsWith: `RCT-${year}-`
        }
      }
    });

    return `RCT-${year}-${String(count + 1).padStart(5, "0")}`;
  }

  private requireProperty(user: UserContext) {
    if (!user.propertyId) {
      throw new BadRequestException("A property context is required.");
    }

    return user.propertyId;
  }
}

function money(value: Prisma.Decimal | number | string) {
  return new Prisma.Decimal(value).toFixed(2);
}

function allowedOutletTypes(user: UserContext) {
  return Object.values(PosOutletType).filter((outletType) => canUseOutlet(user.permissions, outletType));
}

function assertOutletAccess(user: UserContext, outlet: { name: string; outletType: PosOutletType }) {
  if (!canUseOutlet(user.permissions, outlet.outletType)) {
    throw new ForbiddenException(`You do not have access to the ${outlet.name} outlet.`);
  }
}

function prepStationFor(category: string, outletType: string) {
  if (outletType === "BAR") {
    return "Bar Printer";
  }

  const normalized = category.toLowerCase();
  if (normalized.includes("drink") || normalized.includes("bar") || normalized.includes("beverage")) {
    return "Bar Printer";
  }

  if (normalized.includes("service")) {
    return "Service Desk";
  }

  return "Restaurant Kitchen";
}

function currencyLabel(code: string) {
  return code === "USD" ? "USD" : "TSh";
}
