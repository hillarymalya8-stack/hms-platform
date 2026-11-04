import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { InvoicesService } from "./invoices.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { UserContext } from "../../common/auth/user-context";

const decimal = (value: string) => new Prisma.Decimal(value);

describe("invoice POS descriptions", () => {
  it("resolves old room charges and voids to purchases while retaining the posted payment amounts", async () => {
    const charge = {
      id: "charge", itemType: "POS_CHARGE", sourceType: "POS_ORDER", sourceId: "order",
      description: "POS order POS-2026-00001", quantity: decimal("1"),
      unitPrice: decimal("5000"), totalAmount: decimal("5000"), postedAt: new Date()
    };
    const reservation = {
      id: "reservation", primaryGuest: { id: "guest", firstName: "Test", lastName: "Guest" },
      reservationRooms: [], folios: [{ id: "folio", balance: decimal("0"), items: [
        charge,
        { ...charge, id: "void", sourceType: "POS_ORDER_VOID", description: "Void POS order POS-2026-00001",
          unitPrice: decimal("-5000"), totalAmount: decimal("-5000") },
        { ...charge, id: "snapshot", description: "2 x Safari - Order POS-2026-00001" }
      ] }]
    };
    const findMany = vi.fn().mockResolvedValue([{
      id: "order", orderNumber: "POS-2026-00001", items: [
        { quantity: decimal("2"), productVariant: { name: "Regular", product: { name: "Safari" } } },
        { quantity: decimal("1"), productVariant: { name: "Fillet", product: { name: "Beef Steak" } } }
      ]
    }]);
    const prisma = { reservation: { findMany: vi.fn().mockResolvedValue([reservation]) }, posOrder: { findMany } };
    const service = new InvoicesService(prisma as unknown as PrismaService);
    const results = await service.searchReservations({ propertyId: "property" } as UserContext, "Test");
    expect(findMany.mock.calls[0][0].where).toEqual({ propertyId: "property", id: { in: ["order"] } });
    expect(results[0].items.map((item) => item.description)).toEqual([
      "2 x Safari; 1 x Beef Steak (Fillet) - Order POS-2026-00001",
      "Void: 2 x Safari; 1 x Beef Steak (Fillet) - Order POS-2026-00001",
      "2 x Safari - Order POS-2026-00001"
    ]);
    expect(results[0].items.map((item) => item.totalAmount)).toEqual(["5000.00", "-5000.00", "5000.00"]);

    findMany.mockResolvedValue([]);
    const missing = await service.searchReservations({ propertyId: "property" } as UserContext, "Test");
    expect(missing[0].items[0].description).toBe(charge.description);
  });
});
