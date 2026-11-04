import { InventoryMovementStatus, InventoryMovementType, Prisma } from "@prisma/client";
import { lockBalance, recordStockMovementAudit, StockActor, StockAuditAction } from "./stock-ledger";

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
  // Logged-in user posting the receipt; recorded on the movement and in the audit trail.
  actor: StockActor;
  reason?: string | null;
  auditAction?: StockAuditAction;
};

/**
 * Posts a stock receipt into a location: updates the balance using weighted-average cost
 * (same formula as InventoryService.receiveStock) and writes a POSTED RECEIPT movement.
 * Must be called inside a transaction. The balance row is locked first so concurrent
 * receipts of the same item into the same store cannot overwrite each other's average cost.
 */
export async function applyStockReceipt(tx: Prisma.TransactionClient, input: StockReceiptInput) {
  const { itemId, locationId, quantity, unitCost } = input;

  await lockBalance(tx, itemId, locationId);

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
    },
    include: {
      item: true,
      location: true
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
      postedAt: new Date(),
      performedByUserId: input.actor.userId,
      performedByName: input.actor.name,
      reason: input.reason?.trim() || null,
      toQuantityBefore: currentQuantity,
      toQuantityAfter: balance.quantityOnHand
    },
    include: {
      item: true,
      fromLocation: true,
      toLocation: true
    }
  });

  await recordStockMovementAudit(tx, input.actor, {
    action: input.auditAction ?? "stock_receipt",
    propertyId: input.propertyId,
    movement,
    item: balance.item,
    to: balance.location
  });

  return { balance, movement, receiptValue };
}
