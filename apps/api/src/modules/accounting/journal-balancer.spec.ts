import { describe, expect, it } from "vitest";
import { validateBalancedJournal } from "./journal-balancer";

describe("validateBalancedJournal", () => {
  it("accepts a balanced journal entry", () => {
    const result = validateBalancedJournal([
      { accountCode: "1100", debitAmount: "100.00" },
      { accountCode: "4200", creditAmount: "100.00" }
    ]);

    expect(result).toEqual({
      balanced: true,
      totalDebit: "100.0000",
      totalCredit: "100.0000",
      lineCount: 2
    });
  });

  it("rejects an unbalanced journal entry", () => {
    expect(() =>
      validateBalancedJournal([
        { accountCode: "1100", debitAmount: "100.00" },
        { accountCode: "4200", creditAmount: "99.99" }
      ])
    ).toThrow("not balanced");
  });

  it("rejects a line with both debit and credit", () => {
    expect(() =>
      validateBalancedJournal([
        { accountCode: "1100", debitAmount: "100.00", creditAmount: "100.00" },
        { accountCode: "4200", creditAmount: "100.00" }
      ])
    ).toThrow("both debit and credit");
  });

  it("rejects floating point money input", () => {
    expect(() =>
      validateBalancedJournal([
        { accountCode: "1100", debitAmount: 10.25 },
        { accountCode: "4200", creditAmount: "10.25" }
      ])
    ).toThrow("decimal string");
  });
});
