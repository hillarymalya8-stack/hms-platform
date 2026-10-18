import { InventoryMovementStatus, InventoryMovementType, Prisma } from "@prisma/client";

export type StockReceiptInput = {
  propertyId: string;
  itemId: string;
  locationId: string;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  businessDate: Date;
  sourceType: string;
  sourceId?: string | null;
  journalEntryId?: string | null;
};

/**
 * Posts a stock receipt into a location: updates the balance using weighted-average cost
 * (same formula as InventoryService.receiveStock) and writes a POSTED RECEIPT movement.
 * Must be called inside a transaction. The balance row is locked first so concurrent
 * receipts of the same item into the same store cannot overwrite each other's average cost.
 */
export async function applyStockReceipt(tx: Prisma.TransactionClient, input: StockReceiptInput) {
  const { itemId, locationId, quantity, unitCost } = input;

  await tx.$executeRaw`SELECT 1 FROM inventory_balances WHERE item_id = ${itemId}::uuid AND location_id = ${locationId}::uuid FOR UPDATE`;

  const existingBalance = await tx.inventoryBalance.findUnique({
    where: { itemId_locationId: { itemId, locationId } }
  });
  const currentQuantity = existingBalance?.quantityOnHand ?? new Prisma.Decimal(0);
  const currentValue = currentQuantity.mul(existingBalance?.averageCost ?? 0);
  const receiptValue = quantity.mul(unitCost);
  const nextQuantity = currentQuantity.plus(quantity);
  const averageCost = nextQuantity.gt(0) ? currentValue.plus(receiptValue).div(nextQuantity) : unitCost;

  const balance = await tx.inventoryBalance.upsert({
    where: { itemId_locationId: { itemId, locationId } },
    update: {
      quantityOnHand: nextQuantity,
      averageCost
    },
    create: {
      itemId,
      locationId,
      quantityOnHand: quantity,
      averageCost: unitCost
    }
  });

  const movement = await tx.inventoryMovement.create({
    data: {
      propertyId: input.propertyId,
      itemId,
      toLocationId: locationId,
      journalEntryId: input.journalEntryId ?? null,
      movementType: InventoryMovementType.RECEIPT,
      status: InventoryMovementStatus.POSTED,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      quantity,
      unitCost,
      totalCost: receiptValue,
      businessDate: input.businessDate,
      postedAt: new Date()
    }
  });

  return { balance, movement, receiptValue };
}
