type PurchasedItem = {
  quantity: { toString(): string };
  productVariant: { name: string; product: { name: string } };
};

export function posChargeDescription(orderNumber: string, items: PurchasedItem[], voided = false) {
  const purchases = items.map((item) => {
    const variant = item.productVariant.name.trim();
    const name = item.productVariant.product.name;
    const label = variant && variant.toLowerCase() !== "regular" ? `${name} (${variant})` : name;
    return `${item.quantity.toString()} x ${label}`;
  });
  const prefix = voided ? "Void: " : "";
  return purchases.length
    ? `${prefix}${purchases.join("; ")} - Order ${orderNumber}`
    : `${prefix}POS order ${orderNumber}`;
}
