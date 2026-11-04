import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { UserContext } from "../../common/auth/user-context";
import { PrismaService } from "../../common/prisma/prisma.service";
import { auditActionLabel, describeAuditTarget } from "./audit-labels";

type AuditInput = {
  organizationId: string;
  propertyId?: string | null;
  userId?: string | null;
  // Snapshot of the staff name; filled from the users table automatically when omitted.
  actorName?: string | null;
  module: string;
  action: string;
  recordType: string;
  recordId?: string | null;
  itemId?: string | null;
  itemName?: string | null;
  summary?: string | null;
  previousValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type AuditSearchFilters = {
  page?: string;
  pageSize?: string;
  userId?: string;
  from?: string;
  to?: string;
  itemId?: string;
  action?: string;
  module?: string;
  q?: string;
};

const MAX_PAGE_SIZE = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  // Pass a transaction client to keep the audit entry in the same transaction as the change.
  record(input: AuditInput, client: Prisma.TransactionClient | PrismaService = this.prisma) {
    return client.auditLog.create({ data: auditData(input) });
  }

  listRecent(organizationId: string, propertyId?: string) {
    return this.prisma.auditLog.findMany({
      where: {
        organizationId,
        OR: propertyId ? [{ propertyId }, { propertyId: null }] : undefined
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 100
    });
  }

  // Searchable, paginated audit trail. Read-only: there is no API to edit or delete entries,
  // and the database rejects UPDATE/DELETE on audit_logs.
  async search(user: UserContext, filters: AuditSearchFilters) {
    const page = clampInt(filters.page, 1, 1, 100000);
    const pageSize = clampInt(filters.pageSize, 25, 1, MAX_PAGE_SIZE);
    const where = this.buildWhere(user, filters);

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, fullName: true, status: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);

    const names = await this.resolveRecordNames(rows);

    return {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      entries: rows.map((row) => {
        const staffName = row.actorName ?? row.user?.fullName ?? null;
        return {
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          module: row.module,
          action: row.action,
          actionLabel: auditActionLabel(row.module, row.action),
          recordType: row.recordType,
          recordId: row.recordId,
          staff: {
            userId: row.userId,
            // null means the old entry has no reliable staff information ("Not recorded").
            name: staffName,
            disabled: row.user ? row.user.status !== "ACTIVE" : false
          },
          itemId: row.itemId,
          itemName: row.itemName ?? (row.recordType === "inventory_item" && row.recordId ? names.get(row.recordId) ?? null : null),
          target: describeAuditTarget(row.recordType, row.recordId, row.newValue, row.previousValue, names),
          summary: row.summary,
          previousValue: row.previousValue,
          newValue: row.newValue
        };
      })
    };
  }

  // Options for the audit trail filters. Disabled staff stay listed so their history can be found.
  async filterOptions(user: UserContext) {
    const [users, actions, items] = await Promise.all([
      this.prisma.user.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true, fullName: true, status: true },
        orderBy: { fullName: "asc" }
      }),
      this.prisma.auditLog.groupBy({
        by: ["module", "action"],
        where: this.scopeWhere(user),
        orderBy: [{ module: "asc" }, { action: "asc" }]
      }),
      user.propertyId
        ? this.prisma.inventoryItem.findMany({
            where: { propertyId: user.propertyId },
            select: { id: true, name: true, sku: true, active: true },
            orderBy: { name: "asc" }
          })
        : Promise.resolve([])
    ]);

    return {
      staff: users.map((entry) => ({ id: entry.id, name: entry.fullName, disabled: entry.status !== "ACTIVE" })),
      actions: actions.map((entry) => ({
        module: entry.module,
        action: entry.action,
        label: auditActionLabel(entry.module, entry.action)
      })),
      items: items.map((item) => ({ id: item.id, name: item.name, sku: item.sku, active: item.active }))
    };
  }

  private scopeWhere(user: UserContext): Prisma.AuditLogWhereInput {
    return {
      organizationId: user.organizationId,
      OR: user.propertyId ? [{ propertyId: user.propertyId }, { propertyId: null }] : undefined
    };
  }

  private buildWhere(user: UserContext, filters: AuditSearchFilters): Prisma.AuditLogWhereInput {
    const and: Prisma.AuditLogWhereInput[] = [this.scopeWhere(user)];

    if (filters.userId) {
      if (!UUID.test(filters.userId)) throw new BadRequestException("Choose a valid staff member.");
      and.push({ userId: filters.userId });
    }

    if (filters.itemId) {
      if (!UUID.test(filters.itemId)) throw new BadRequestException("Choose a valid item.");
      and.push({ OR: [{ itemId: filters.itemId }, { recordType: "inventory_item", recordId: filters.itemId }] });
    }

    if (filters.action) {
      and.push({ action: filters.action.trim() });
    }

    if (filters.module) {
      and.push({ module: filters.module.trim() });
    }

    const from = parseDateBoundary(filters.from, "start");
    const to = parseDateBoundary(filters.to, "end");
    if (from && to && from >= to) {
      throw new BadRequestException("The start date must be before the end date.");
    }
    if (from || to) {
      and.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } });
    }

    const q = filters.q?.trim();
    if (q) {
      const contains = { contains: q.slice(0, 120), mode: "insensitive" as const };
      and.push({
        OR: [
          { actorName: contains },
          { itemName: contains },
          { summary: contains },
          { action: contains },
          { module: contains },
          { recordType: contains },
          { recordId: contains },
          { user: { fullName: contains } }
        ]
      });
    }

    return { AND: and };
  }

  // Looks up readable names for older entries that only stored a record id.
  private async resolveRecordNames(rows: Array<{ recordType: string; recordId: string | null }>) {
    const idsByType = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.recordId || !UUID.test(row.recordId)) continue;
      const list = idsByType.get(row.recordType) ?? [];
      list.push(row.recordId);
      idsByType.set(row.recordType, list);
    }

    const names = new Map<string, string>();
    const ids = (type: string) => idsByType.get(type) ?? [];
    const [orders, payments, items, users, purchaseOrders, reservations] = await Promise.all([
      ids("pos_order").length
        ? this.prisma.posOrder.findMany({ where: { id: { in: ids("pos_order") } }, select: { id: true, orderNumber: true } })
        : [],
      ids("payment").length
        ? this.prisma.payment.findMany({
            where: { id: { in: ids("payment") } },
            select: { id: true, systemReceiptNumber: true, order: { select: { orderNumber: true } } }
          })
        : [],
      ids("inventory_item").length
        ? this.prisma.inventoryItem.findMany({ where: { id: { in: ids("inventory_item") } }, select: { id: true, name: true } })
        : [],
      ids("user").length
        ? this.prisma.user.findMany({ where: { id: { in: ids("user") } }, select: { id: true, fullName: true } })
        : [],
      ids("purchase_order").length
        ? this.prisma.purchaseOrder.findMany({ where: { id: { in: ids("purchase_order") } }, select: { id: true, orderNumber: true } })
        : [],
      ids("reservation").length
        ? this.prisma.reservation.findMany({ where: { id: { in: ids("reservation") } }, select: { id: true, reservationNumber: true } })
        : []
    ]);

    for (const order of orders) names.set(order.id, `Order ${order.orderNumber}`);
    for (const payment of payments) {
      names.set(payment.id, `Receipt ${payment.systemReceiptNumber}${payment.order ? ` (${payment.order.orderNumber})` : ""}`);
    }
    for (const item of items) names.set(item.id, item.name);
    for (const entry of users) names.set(entry.id, `Staff account ${entry.fullName}`);
    for (const order of purchaseOrders) names.set(order.id, `Purchase order ${order.orderNumber}`);
    for (const reservation of reservations) names.set(reservation.id, `Reservation ${reservation.reservationNumber}`);
    return names;
  }
}

export function auditData(input: AuditInput): Prisma.AuditLogUncheckedCreateInput {
  return {
    organizationId: input.organizationId,
    propertyId: input.propertyId,
    userId: input.userId,
    actorName: input.actorName ?? undefined,
    module: input.module,
    action: input.action,
    recordType: input.recordType,
    recordId: input.recordId,
    itemId: input.itemId ?? undefined,
    itemName: input.itemName ?? undefined,
    summary: input.summary ?? undefined,
    previousValue: input.previousValue,
    newValue: input.newValue,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent
  };
}

function clampInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

// Accepts a full ISO timestamp (the browser sends local-day boundaries) or a YYYY-MM-DD date.
// For a plain date, "end" means the following midnight so the whole day is included.
export function parseDateBoundary(value: string | undefined, edge: "start" | "end") {
  if (!value?.trim()) return undefined;
  const text = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const date = new Date(dateOnly ? `${text}T00:00:00.000Z` : text);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException("Dates must be valid, for example 2026-11-04.");
  }
  if (dateOnly && edge === "end") {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
}
