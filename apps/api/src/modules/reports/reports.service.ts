import { BadRequestException, Injectable } from "@nestjs/common";
import { FolioStatus, PaymentStatus, Prisma, ReservationStatus } from "@prisma/client";
import { UserContext } from "../../common/auth/user-context";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async dailyReports(user: UserContext, date?: string) {
    const propertyId = this.requireProperty(user);
    const reportDate = parseReportDate(date);
    const nextDate = new Date(reportDate);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);

    const [roomChart, posOrders] = await Promise.all([
      this.roomChartReport(propertyId),
      this.posReport(propertyId, reportDate, nextDate)
    ]);

    return {
      date: reportDate.toISOString().slice(0, 10),
      generatedAt: new Date().toISOString(),
      roomChart,
      pos: posOrders
    };
  }

  private async roomChartReport(propertyId: string) {
    const rooms = await this.prisma.room.findMany({
      where: { propertyId, active: true },
      include: {
        floor: true,
        roomType: true,
        reservationRooms: {
          where: {
            status: {
              in: [ReservationStatus.CONFIRMED, ReservationStatus.CHECKED_IN]
            },
            reservation: {
              status: {
                in: [ReservationStatus.CONFIRMED, ReservationStatus.CHECKED_IN]
              }
            }
          },
          include: {
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
          },
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: { roomNumber: "asc" }
    });

    const rows = rooms.map((room) => {
      const assignedRoom =
        room.reservationRooms.find((entry) => entry.reservation.status === ReservationStatus.CHECKED_IN) ??
        room.reservationRooms.find((entry) => entry.reservation.status === ReservationStatus.CONFIRMED) ??
        null;
      const reservation = assignedRoom?.reservation ?? null;
      const folio = reservation?.folios[0] ?? null;

      return {
        roomNumber: room.roomNumber,
        roomType: room.roomType.name,
        floor: room.floor?.name ?? "",
        occupancyStatus: room.occupancyStatus,
        housekeepingStatus: room.housekeepingStatus,
        maintenanceStatus: room.maintenanceStatus,
        guestName: reservation ? `${reservation.primaryGuest.firstName} ${reservation.primaryGuest.lastName}` : "",
        reservationNumber: reservation?.reservationNumber ?? "",
        arrivalDate: reservation?.arrivalDate ?? null,
        departureDate: reservation?.departureDate ?? null,
        folioNumber: folio?.folioNumber ?? "",
        balance: folio ? money(folio.balance) : "0.00"
      };
    });

    const occupied = rows.filter((room) => room.occupancyStatus === "OCCUPIED").length;
    const reserved = rows.filter((room) => room.occupancyStatus === "RESERVED").length;
    const available = rows.filter((room) => room.occupancyStatus === "AVAILABLE").length;
    const dirty = rows.filter((room) => room.housekeepingStatus === "DIRTY").length;
    const outOfService = rows.filter((room) => room.maintenanceStatus !== "AVAILABLE").length;
    const balance = rows.reduce((sum, room) => sum.plus(room.balance), new Prisma.Decimal(0));

    return {
      summary: {
        totalRooms: rows.length,
        occupied,
        reserved,
        available,
        dirty,
        outOfService,
        occupancyPercent: rows.length ? Math.round((occupied / rows.length) * 100) : 0,
        openBalance: money(balance)
      },
      rows
    };
  }

  private async posReport(propertyId: string, reportDate: Date, nextDate: Date) {
    const orders = await this.prisma.posOrder.findMany({
      where: {
        propertyId,
        createdAt: {
          gte: reportDate,
          lt: nextDate
        }
      },
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
        payments: true,
        table: true,
        terminal: true
      },
      orderBy: { createdAt: "asc" }
    });

    const outletTotals = new Map<string, Prisma.Decimal>();
    const paymentTotals = new Map<string, Prisma.Decimal>();
    let grossSales = new Prisma.Decimal(0);
    let paidSales = new Prisma.Decimal(0);
    let taxTotal = new Prisma.Decimal(0);

    const rows = orders.map((order) => {
      const paidTotal = order.payments
        .filter((payment) => payment.status === PaymentStatus.COMPLETED)
        .reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
      const itemCount = order.items.reduce((sum, item) => sum + Number(item.quantity), 0);

      grossSales = grossSales.plus(order.grandTotal);
      paidSales = paidSales.plus(paidTotal);
      taxTotal = taxTotal.plus(order.taxTotal);
      outletTotals.set(order.outlet.name, (outletTotals.get(order.outlet.name) ?? new Prisma.Decimal(0)).plus(order.grandTotal));

      for (const payment of order.payments) {
        if (payment.status !== PaymentStatus.COMPLETED) continue;
        paymentTotals.set(
          payment.paymentMethod,
          (paymentTotals.get(payment.paymentMethod) ?? new Prisma.Decimal(0)).plus(payment.amount)
        );
      }

      return {
        orderNumber: order.orderNumber,
        outletName: order.outlet.name,
        terminalName: order.terminal?.name ?? "",
        tableNumber: order.table?.tableNumber ?? "",
        serviceType: order.serviceType,
        status: order.status,
        itemCount,
        subtotal: money(order.subtotal),
        taxTotal: money(order.taxTotal),
        grandTotal: money(order.grandTotal),
        paidTotal: money(paidTotal),
        createdAt: order.createdAt,
        payments: order.payments
          .filter((payment) => payment.status === PaymentStatus.COMPLETED)
          .map((payment) => ({
            method: payment.paymentMethod,
            amount: money(payment.amount),
            receiptNumber: payment.systemReceiptNumber,
            externalReceiptNumber: payment.externalReceiptNumber,
            externalReference: payment.externalReference
          })),
        items: order.items.map((item) => ({
          name: item.productVariant.product.name,
          variant: item.productVariant.name,
          category: item.productVariant.product.category?.name ?? "",
          quantity: item.quantity.toString(),
          totalAmount: money(item.totalAmount)
        }))
      };
    });

    return {
      summary: {
        orderCount: orders.length,
        grossSales: money(grossSales),
        paidSales: money(paidSales),
        taxTotal: money(taxTotal),
        averageOrder: orders.length ? money(grossSales.div(orders.length)) : "0.00"
      },
      outletTotals: [...outletTotals.entries()].map(([name, amount]) => ({ name, amount: money(amount) })),
      paymentTotals: [...paymentTotals.entries()].map(([method, amount]) => ({ method, amount: money(amount) })),
      rows
    };
  }

  private requireProperty(user: UserContext) {
    if (!user.propertyId) {
      throw new BadRequestException("A property context is required.");
    }

    return user.propertyId;
  }
}

function parseReportDate(value?: string) {
  const datePart = value?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const date = new Date(`${datePart}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException("Report date is invalid.");
  }

  return date;
}

function money(value: Prisma.Decimal | number | string) {
  return new Prisma.Decimal(value).toFixed(2);
}
