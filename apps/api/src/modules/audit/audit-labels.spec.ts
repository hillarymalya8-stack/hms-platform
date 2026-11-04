import { describe, expect, it } from "vitest";
import { auditActionLabel, describeAuditTarget } from "./audit-labels";
import { parseDateBoundary } from "./audit.service";

describe("audit labels", () => {
  it("names stock and POS actions in plain words", () => {
    expect(auditActionLabel("pos", "create_order")).toBe("Sale created");
    expect(auditActionLabel("inventory", "stock_adjustment")).toBe("Stock adjusted");
    expect(auditActionLabel("front_office", "check_in_reservation")).toBe("Check in reservation");
  });

  it("prefers a resolved record name, then readable values, then a short id", () => {
    const resolved = new Map([["11111111-1111-1111-1111-111111111111", "Order POS-2026-00001"]]);
    expect(describeAuditTarget("pos_order", "11111111-1111-1111-1111-111111111111", null, null, resolved)).toBe("Order POS-2026-00001");
    expect(describeAuditTarget("payment", "x", { systemReceiptNumber: "RCT-2026-00002" }, null, new Map())).toBe("Payment RCT-2026-00002");
    expect(describeAuditTarget("room", "abcdef1234", null, null, new Map())).toBe("Room abcdef12");
  });
});

describe("audit date filters", () => {
  it("includes the whole end day for plain dates", () => {
    expect(parseDateBoundary("2026-11-04", "start")?.toISOString()).toBe("2026-11-04T00:00:00.000Z");
    expect(parseDateBoundary("2026-11-04", "end")?.toISOString()).toBe("2026-11-05T00:00:00.000Z");
    expect(parseDateBoundary("2026-11-03T21:00:00.000Z", "end")?.toISOString()).toBe("2026-11-03T21:00:00.000Z");
    expect(parseDateBoundary("", "start")).toBeUndefined();
    expect(() => parseDateBoundary("yesterday", "start")).toThrow();
  });
});
