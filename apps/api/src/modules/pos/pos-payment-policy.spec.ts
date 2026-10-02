import { PaymentMethod } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { assertPaymentReferencePolicy, paymentRequiresExternalReference } from "./pos-payment-policy";

describe("POS payment reference policy", () => {
  it("requires references for card, credit, mobile money, and bank transfer payments", () => {
    expect(paymentRequiresExternalReference(PaymentMethod.CARD)).toBe(true);
    expect(paymentRequiresExternalReference(PaymentMethod.CREDIT)).toBe(true);
    expect(paymentRequiresExternalReference(PaymentMethod.MOBILE_MONEY)).toBe(true);
    expect(paymentRequiresExternalReference(PaymentMethod.BANK_TRANSFER)).toBe(true);
  });

  it("does not require a reference for cash or room charge payments", () => {
    expect(paymentRequiresExternalReference(PaymentMethod.CASH)).toBe(false);
    expect(paymentRequiresExternalReference(PaymentMethod.ROOM_CHARGE)).toBe(false);
  });

  it("rejects card payment without receipt reference", () => {
    expect(() => assertPaymentReferencePolicy({ paymentMethod: PaymentMethod.CARD })).toThrow("require a receipt ID");
  });

  it("accepts card payment with external receipt number", () => {
    expect(() =>
      assertPaymentReferencePolicy({
        paymentMethod: PaymentMethod.CARD,
        externalReceiptNumber: "CARD-RCT-001"
      })
    ).not.toThrow();
  });
});
