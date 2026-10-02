import { describe, expect, it } from "vitest";
import { calculatePosOrderTotals } from "./pos-totals";

describe("calculatePosOrderTotals", () => {
  it("calculates subtotal, tax, and grand total", () => {
    const result = calculatePosOrderTotals([
      { quantity: "2", unitPrice: "12.50", taxRate: "0.1600" },
      { quantity: "1", unitPrice: "4.50", taxRate: "0.1600" }
    ]);

    expect(result.subtotal.toFixed(4)).toBe("29.5000");
    expect(result.taxTotal.toFixed(4)).toBe("4.7200");
    expect(result.grandTotal.toFixed(4)).toBe("34.2200");
  });

  it("rejects floating point money values", () => {
    expect(() => calculatePosOrderTotals([{ quantity: "1", unitPrice: 12.5 }])).toThrow("decimal string");
  });

  it("rejects empty orders", () => {
    expect(() => calculatePosOrderTotals([])).toThrow("at least one item");
  });
});
