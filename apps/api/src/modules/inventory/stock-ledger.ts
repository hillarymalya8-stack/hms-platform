import { InventoryMovementType, Prisma } from "@prisma/client";
import { UserContext } from "../../common/auth/user-context";
import { auditData } from "../audit/audit.service";

// The person behind a stock change. Always built from the authenticated session, never from input.
export type StockActor = {
  userId: string;
  name: string;
  organizationId: string;
};

export function stockActor(user: UserContext): StockActor {
  return { userId: user.userId, name: user.fullName, organizationId: user.organizationId };
}

export type StockAuditAction =
  | "stock_receipt"
  | "purchase_receipt"
  | "stock_issue"
  | "stock_transfer"
  | "stock_adjustment"
  | "sale_deduction"
  | "sale_return";

type LocationRef = { id: string; name: string } | null | undefined;

export type StockMovementAuditInput = {
  action: StockAuditAction;
  propertyId: string;
  movement: {
    id: string;
    movementType: InventoryMovementType;
    quantity: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    totalCost: Prisma.Decimal;
    sourceType: string | null;
    sourceId: string | null;
    reason: string | null;
    fromQuantityBefore: Prisma.Decimal | null;
    fromQuantityAfter: Prisma.Decimal | null;
    toQuantityBefore: Prisma.Decimal | null;
    toQuantityAfter: Prisma.Decimal | null;
  };
  item: { id: string; name: string; sku: string; unitOfMeasure: string };
  from?: LocationRef;
  to?: LocationRef;
};

// Writes the audit trail entry for a posted stock movement inside the same transaction.
export function recordStockMovementAudit(tx: Prisma.TransactionClient, actor: StockActor, input: StockMovementAuditInput) {
  const { movement, item, from, to } = input;
  const quantity = movement.quantity.toFixed(2);
  const where = from && to ? `${from.name} to ${to.name}` : (from ?? to)?.name ?? "";
  const reason = movement.reason ? ` Reason: ${movement.reason}.` : "";
  const source = movement.sourceType && !movement.reason?.includes(movement.sourceType) ? ` (${movement.sourceType})` : "";

  return tx.auditLog.create({
    data: auditData({
      organizationId: actor.organizationId,
      propertyId: input.propertyId,
      userId: actor.userId,
      actorName: actor.name,
      module: "inventory",
      action: input.action,
      recordType: "inventory_movement",
      recordId: movement.id,
      itemId: item.id,
      itemName: item.name,
      summary: `${quantity} ${item.unitOfMeasure} ${item.name} - ${where}${source}.${reason}`.trim(),
      newValue: {
        movementType: movement.movementType,
        itemId: item.id,
        itemName: item.name,
        sku: item.sku,
        unit: item.unitOfMeasure,
        quantity: movement.quantity.toString(),
        unitCost: movement.unitCost.toString(),
        totalCost: movement.totalCost.toString(),
        sourceType: movement.sourceType,
        sourceId: movement.sourceId,
        reason: movement.reason,
        fromLocation: from
          ? {
              id: from.id,
              name: from.name,
              quantityBefore: movement.fromQuantityBefore?.toString() ?? null,
              quantityAfter: movement.fromQuantityAfter?.toString() ?? null
            }
          : null,
        toLocation: to
          ? {
              id: to.id,
              name: to.name,
              quantityBefore: movement.toQuantityBefore?.toString() ?? null,
              quantityAfter: movement.toQuantityAfter?.toString() ?? null
            }
          : null
      }
    })
  });
}

// Locks a balance row (if it exists) so before/after quantities are exact under concurrent posting.
export async function lockBalance(tx: Prisma.TransactionClient, itemId: string, locationId: string) {
  await tx.$executeRaw`SELECT 1 FROM inventory_balances WHERE item_id = ${itemId}::uuid AND location_id = ${locationId}::uuid FOR UPDATE`;
}
