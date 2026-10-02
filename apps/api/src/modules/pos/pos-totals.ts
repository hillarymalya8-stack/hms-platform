import { Prisma } from "@prisma/client";

export type PosOrderLineDraft = {
  quantity: string | number;
  unitPrice: string | number;
  taxRate?: string | number;
  discountAmount?: string | number;
};

export function calculatePosOrderTotals(lines: PosOrderLineDraft[]) {
  if (lines.length === 0) {
    throw new Error("A POS order must contain at least one item.");
  }

  let subtotal = new Prisma.Decimal(0);
  let discountTotal = new Prisma.Decimal(0);
  let taxTotal = new Prisma.Decimal(0);
  let grandTotal = new Prisma.Decimal(0);

  const itemTotals = lines.map((line) => {
    const quantity = money(line.quantity, "quantity");
    const unitPrice = money(line.unitPrice, "unitPrice");
    const discount = money(line.discountAmount ?? "0", "discountAmount");
    const taxRate = money(line.taxRate ?? "0", "taxRate");

    if (quantity.lte(0)) {
      throw new Error("Item quantity must be greater than zero.");
    }

    if (unitPrice.lt(0) || discount.lt(0) || taxRate.lt(0)) {
      throw new Error("POS order amounts cannot be negative.");
    }

    const lineSubtotal = quantity.mul(unitPrice);
    if (discount.gt(lineSubtotal)) {
      throw new Error("Discount cannot exceed the line subtotal.");
    }

    const taxableAmount = lineSubtotal.minus(discount);
    const taxAmount = taxableAmount.mul(taxRate);
    const totalAmount = taxableAmount.plus(taxAmount);

    subtotal = subtotal.plus(lineSubtotal);
    discountTotal = discountTotal.plus(discount);
    taxTotal = taxTotal.plus(taxAmount);
    grandTotal = grandTotal.plus(totalAmount);

    return {
      quantity,
      unitPrice,
      discountAmount: discount,
      taxAmount,
      totalAmount
    };
  });

  return {
    itemTotals,
    subtotal,
    discountTotal,
    taxTotal,
    grandTotal
  };
}

function money(value: string | number, field: string) {
  if (typeof value === "number" && !Number.isInteger(value)) {
    throw new Error(`${field} must be sent as a decimal string, not a floating point number.`);
  }

  return new Prisma.Decimal(value);
}
