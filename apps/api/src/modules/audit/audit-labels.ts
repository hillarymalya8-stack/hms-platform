import { Prisma } from "@prisma/client";

const labels: Record<string, string> = {
  "pos.create_order": "Sale created",
  "pos.take_payment": "Payment collected",
  "pos.edit_order": "Order edited",
  "pos.void_order": "Order voided",
  "inventory.stock_receipt": "Stock received",
  "inventory.stock_issue": "Stock issued",
  "inventory.stock_transfer": "Stock transferred",
  "inventory.stock_adjustment": "Stock adjusted",
  "inventory.sale_deduction": "Stock deducted by sale",
  "inventory.sale_return": "Stock returned (order edit/void)",
  "inventory.purchase_receipt": "Stock received (purchase order)",
  "inventory.item_created": "Item created",
  "inventory.item_updated": "Item edited",
  "purchasing.receive_purchase_order": "Purchase order received"
};

export function auditActionLabel(module: string, action: string) {
  const known = labels[`${module}.${action}`];
  if (known) return known;
  const text = action.replaceAll("_", " ").replaceAll(".", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// A short human-readable name for the record an audit entry is about.
export function describeAuditTarget(
  recordType: string,
  recordId: string | null,
  newValue: Prisma.JsonValue | null,
  previousValue: Prisma.JsonValue | null,
  resolved: Map<string, string>
) {
  if (recordId && resolved.has(recordId)) {
    return resolved.get(recordId)!;
  }

  const value = pickObject(newValue) ?? pickObject(previousValue) ?? {};
  const text = (key: string) => (typeof value[key] === "string" && value[key] ? String(value[key]) : null);
  const named =
    text("orderNumber") ??
    text("systemReceiptNumber") ??
    text("reservationNumber") ??
    text("entryNumber") ??
    text("invoiceNumber") ??
    text("itemName") ??
    text("name") ??
    text("fullName") ??
    text("email");
  const type = recordType.replaceAll("_", " ");
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  if (named) return `${typeLabel} ${named}`;
  return recordId ? `${typeLabel} ${recordId.slice(0, 8)}` : typeLabel;
}

function pickObject(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Prisma.JsonValue>) : null;
}
