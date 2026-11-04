import { BadRequestException, Injectable } from "@nestjs/common";
import { FolioItemType, PaymentMethod, PaymentStatus, PosOrderStatus, Prisma } from "@prisma/client";
import { UserContext } from "../../common/auth/user-context";
import { PrismaService } from "../../common/prisma/prisma.service";
import { parseDay, isoDay, serializeExpense, totalsByCurrency } from "../front-office/day-expenses.service";

type Bucket = Map<string, Prisma.Decimal>;

// Day sales for Finance, read straight from Front Office and POS records, so rooms and POS are
// visible even when no accounting journal has been posted for them yet.
@Injectable()
export class DaySalesService {
  constructor(private readonly prisma: PrismaService) {}

  async daySales(user: UserContext, date?: string) {
    if (!user.propertyId) throw new BadRequestException("A property context is required.");
    const propertyId = user.propertyId;
    const day = parseDay(date);
    const next = new Date(day);
    next.setUTCDate(next.getUTCDate() + 1);
    const inDay = { gte: day, lt: next };

    const [folioItems, folioPayments, orders, posPayments, expenses] = await Promise.all([
      this.prisma.folioItem.findMany({
        where: {
          postedAt: inDay,
          folio: { propertyId },
          OR: [
            { itemType: FolioItemType.ROOM_CHARGE },
            { itemType: FolioItemType.OTHER, sourceType: "FRONT_OFFICE" },
            { itemType: FolioItemType.DEPOSIT, sourceType: "PREPAID_BOOKING" }
          ]
        },
        include: { folio: { include: folioInclude } },
        orderBy: { postedAt: "asc" }
      }),
      this.prisma.payment.findMany({
        where: { propertyId, sourceType: "FOLIO", status: PaymentStatus.COMPLETED, createdAt: inDay },
        orderBy: { createdAt: "asc" }
      }),
      this.prisma.posOrder.findMany({
        where: { propertyId, createdAt: inDay, status: { not: PosOrderStatus.VOID } },
        include: { outlet: true },
        orderBy: { createdAt: "asc" }
      }),
      this.prisma.payment.findMany({
        where: { propertyId, orderId: { not: null }, status: PaymentStatus.COMPLETED, createdAt: inDay },
        include: { order: { select: { currencyCode: true, status: true, orderNumber: true } } }
      }),
      this.prisma.frontOfficeExpense.findMany({
        where: { propertyId, expenseDate: day },
        orderBy: { createdAt: "asc" }
      })
    ]);

    // Folio payments store a placeholder currency; use the currency the stay was sold in.
    const folioIds = [...new Set(folioPayments.map((payment) => payment.sourceId))];
    const folios = folioIds.length
      ? await this.prisma.folio.findMany({ where: { id: { in: folioIds } }, include: folioInclude })
      : [];
    const folioById = new Map(folios.map((folio) => [folio.id, folio]));

    const roomCharges: Bucket = new Map();
    const prepaid: Bucket = new Map();
    const roomRows = folioItems.map((item) => {
      const currency = stayCurrency(item.folio);
      add(item.itemType === FolioItemType.DEPOSIT ? prepaid : roomCharges, currency, item.totalAmount);
      return {
        type: item.itemType === FolioItemType.DEPOSIT ? "PREPAID" : "CHARGE",
        description: item.description,
        room: item.folio.reservation.reservationRooms.map((entry) => entry.room?.roomNumber).filter(Boolean).join(", "),
        guest: guestName(item.folio.reservation.primaryGuest),
        reservationNumber: item.folio.reservation.reservationNumber,
        amount: money(item.totalAmount),
        currencyCode: currency,
        postedAt: item.postedAt
      };
    });

    const roomCollected: Bucket = new Map();
    const roomByMethod = new Map<string, Bucket>();
    for (const payment of folioPayments) {
      const folio = folioById.get(payment.sourceId);
      const currency = folio ? stayCurrency(folio) : "TZS";
      add(roomCollected, currency, payment.amount);
      addMethod(roomByMethod, payment.paymentMethod, currency, payment.amount);
    }

    const posSales: Bucket = new Map();
    const outlets = new Map<string, { orders: number; totals: Bucket }>();
    for (const order of orders) {
      add(posSales, order.currencyCode, order.grandTotal);
      const outlet = outlets.get(order.outlet.name) ?? { orders: 0, totals: new Map() };
      outlet.orders += 1;
      add(outlet.totals, order.currencyCode, order.grandTotal);
      outlets.set(order.outlet.name, outlet);
    }

    const posCollected: Bucket = new Map();
    const posToRooms: Bucket = new Map();
    const posByMethod = new Map<string, Bucket>();
    for (const payment of posPayments) {
      if (!payment.order || payment.order.status === PosOrderStatus.VOID) continue;
      const currency = payment.order.currencyCode;
      if (payment.paymentMethod === PaymentMethod.ROOM_CHARGE) {
        // Charged to a guest room: collected later through the room bill, so not counted twice.
        add(posToRooms, currency, payment.amount);
        continue;
      }
      add(posCollected, currency, payment.amount);
      addMethod(posByMethod, payment.paymentMethod, currency, payment.amount);
    }

    const expenseTotals = totalsByCurrency(expenses);
    const expenseBucket: Bucket = new Map(expenseTotals.map((row) => [row.currencyCode, new Prisma.Decimal(row.amount)]));
    const cashIn: Bucket = new Map();
    for (const method of [roomByMethod.get(PaymentMethod.CASH), posByMethod.get(PaymentMethod.CASH)]) {
      for (const [currency, amount] of method ?? []) add(cashIn, currency, amount);
    }

    const currencies = [
      ...new Set([roomCharges, prepaid, roomCollected, posSales, posCollected, expenseBucket].flatMap((bucket) => [...bucket.keys()]))
    ].sort((a, b) => (a === "TZS" ? -1 : b === "TZS" ? 1 : a.localeCompare(b)));
    if (!currencies.length) currencies.push("TZS");

    const totals = currencies.map((currencyCode) => {
      const sales = get(roomCharges, currencyCode).plus(get(posSales, currencyCode));
      const collected = get(roomCollected, currencyCode).plus(get(prepaid, currencyCode)).plus(get(posCollected, currencyCode));
      const spent = get(expenseBucket, currencyCode);
      return {
        currencyCode,
        roomSales: money(get(roomCharges, currencyCode)),
        roomCollected: money(get(roomCollected, currencyCode)),
        prepaidBookings: money(get(prepaid, currencyCode)),
        posSales: money(get(posSales, currencyCode)),
        posCollected: money(get(posCollected, currencyCode)),
        posChargedToRooms: money(get(posToRooms, currencyCode)),
        totalSales: money(sales),
        totalCollected: money(collected),
        expenses: money(spent),
        netAfterExpenses: money(collected.minus(spent)),
        cashCollected: money(get(cashIn, currencyCode)),
        cashAfterExpenses: money(get(cashIn, currencyCode).minus(spent))
      };
    });

    return {
      date: isoDay(day),
      generatedAt: new Date().toISOString(),
      totals,
      rooms: {
        rows: roomRows,
        paymentCount: folioPayments.length,
        byMethod: methodRows(roomByMethod)
      },
      pos: {
        orderCount: orders.length,
        byOutlet: [...outlets.entries()].map(([name, outlet]) => ({
          name,
          orders: outlet.orders,
          totals: bucketRows(outlet.totals)
        })),
        byMethod: methodRows(posByMethod)
      },
      expenses: {
        rows: expenses.map(serializeExpense),
        totals: expenseTotals
      }
    };
  }
}

const folioInclude = {
  reservation: {
    include: {
      primaryGuest: true,
      reservationRooms: { include: { room: true } }
    }
  }
} satisfies Prisma.FolioInclude;

type FolioWithStay = Prisma.FolioGetPayload<{ include: typeof folioInclude }>;

function stayCurrency(folio: FolioWithStay) {
  return folio.reservation.reservationRooms[0]?.currencyCode ?? "TZS";
}

function guestName(guest: { firstName: string; lastName: string }) {
  return `${guest.firstName} ${guest.lastName}`.trim();
}

function add(bucket: Bucket, currency: string, amount: Prisma.Decimal) {
  bucket.set(currency, get(bucket, currency).plus(amount));
}

function get(bucket: Bucket, currency: string) {
  return bucket.get(currency) ?? new Prisma.Decimal(0);
}

function addMethod(methods: Map<string, Bucket>, method: string, currency: string, amount: Prisma.Decimal) {
  const bucket = methods.get(method) ?? new Map();
  add(bucket, currency, amount);
  methods.set(method, bucket);
}

function bucketRows(bucket: Bucket) {
  return [...bucket.entries()].map(([currencyCode, amount]) => ({ currencyCode, amount: money(amount) }));
}

function methodRows(methods: Map<string, Bucket>) {
  return [...methods.entries()].map(([method, bucket]) => ({ method, totals: bucketRows(bucket) }));
}

function money(value: Prisma.Decimal) {
  return value.toFixed(2);
}
