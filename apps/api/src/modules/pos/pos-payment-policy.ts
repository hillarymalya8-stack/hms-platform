import { PaymentMethod } from "@prisma/client";

export const referenceRequiredPaymentMethods: PaymentMethod[] = [
  PaymentMethod.CARD,
  PaymentMethod.CREDIT,
  PaymentMethod.MOBILE_MONEY,
  PaymentMethod.BANK_TRANSFER
];

export function paymentRequiresExternalReference(paymentMethod: PaymentMethod) {
  return referenceRequiredPaymentMethods.includes(paymentMethod);
}

export function assertPaymentReferencePolicy(input: {
  paymentMethod: PaymentMethod;
  externalReceiptNumber?: string | null;
  authorizationCode?: string | null;
  externalReference?: string | null;
}) {
  if (!paymentRequiresExternalReference(input.paymentMethod)) {
    return;
  }

  const hasReference =
    Boolean(input.externalReceiptNumber?.trim()) ||
    Boolean(input.authorizationCode?.trim()) ||
    Boolean(input.externalReference?.trim());

  if (!hasReference) {
    throw new Error(`${input.paymentMethod} payments require a receipt ID, authorization code, or external reference.`);
  }
}
