import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { canUseStore, storeAccess } from "@hms/shared";
import {
  FinancialPeriodStatus,
  JournalStatus,
  Prisma,
  PurchaseOrderStatus,
  RecordStatus,
  SupplierInvoiceStatus
} from "@prisma/client";
import { UserContext } from "../../common/auth/user-context";
import { PrismaService } from "../../common/prisma/prisma.service";
import { JournalValidationError, validateBalancedJournal } from "../accounting/journal-balancer";
import { AuditService } from "../audit/audit.service";
import { applyStockReceipt } from "../inventory/stock-receipt";
import { CreatePurchaseOrderDto } from "./dto/create-purchase-order.dto";
import { CreateSupplierDto } from "./dto/create-supplier.dto";
import { ReceivePurchaseOrderDto } from "./dto/receive-purchase-order.dto";
import { RecordSupplierInvoiceDto } from "./dto/record-supplier-invoice.dto";

const MAIN_STORE_CODE = "MAIN";
const INVENTORY_ACCOUNT_CODE = "1400";
const ACCOUNTS_PAYABLE_ACCOUNT_CODE = "2100";
// Invoice and receipt values within one cent are treated as a match.
const MATCH_TOLERANCE = new Prisma.Decimal("0.01");
const ZERO = new Prisma.Decimal(0);

const orderInclude = {
  supplier: true,
  lines: {
    include: { inventoryItem: true },
    orderBy: { createdAt: "asc" }
  },
  supplierInvoices: {
    orderBy: { createdAt: "asc" }
  }
} satisfies Prisma.PurchaseOrderInclude;

type OrderWithRelations = Prisma.PurchaseOrderGetPayload<{ include: typeof orderInclude }>;

@Injectable()
export class PurchasingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async getOverview(user: UserContext) {
    const propertyId = this.requireProperty(user);
    const mainStore = await this.ensureMainStore(propertyId);

    const [suppliers, orders, items] = await Promise.all([
      this.prisma.supplier.findMany({
        where: { propertyId },
        orderBy: { name: "asc" }
      }),
      this.prisma.purchaseOrder.findMany({
        where: { propertyId },
        include: orderInclude,
        orderBy: { orderedAt: "desc" },
        take: 200
      }),
      this.prisma.inventoryItem.findMany({
        where: { propertyId, active: true },
        include: {
          balances: { where: { locationId: mainStore.id } }
        },
        orderBy: { name: "asc" }
      })
    ]);

    const mappedOrders = orders.map(mapOrder);
    const openStatuses: PurchaseOrderStatus[] = [
      PurchaseOrderStatus.DRAFT,
      PurchaseOrderStatus.PENDING_APPROVAL,
      PurchaseOrderStatus.APPROVED,
      PurchaseOrderStatus.PARTIALLY_RECEIVED
    ];

    return {
      canReceive: canUseStore(user.permissions, MAIN_STORE_CODE),
      mainStore: { id: mainStore.id, name: mainStore.name },
      suppliers: suppliers.map((supplier) => ({
        ...mapSupplier(supplier),
        openOrders: orders.filter((order) => order.supplierId === supplier.id && openStatuses.includes(order.status)).length
      })),
      items: items.map((item) => ({
        id: item.id,
        sku: item.sku,
        name: item.name,
        unit: item.unitOfMeasure,
        onHand: Number(item.balances[0]?.quantityOnHand ?? 0),
        lastCost: Number(item.balances[0]?.averageCost ?? 0)
      })),
      orders: mappedOrders,
      summary: {
        awaitingApproval: mappedOrders.filter((order) => order.status === "DRAFT" || order.status === "PENDING_APPROVAL").length,
        awaitingReceipt: mappedOrders.filter((order) => order.status === "APPROVED" || order.status === "PARTIALLY_RECEIVED").length,
        receivedNotInvoiced: round2(
          mappedOrders.reduce((sum, order) => sum + Math.max(order.receivedValue - order.invoicedValue, 0), 0)
        ),
        openPayables: round2(
          mappedOrders.reduce(
            (sum, order) =>
              sum +
              order.invoices
                .filter((invoice) => invoice.status !== "VOID" && invoice.status !== "PAID")
                .reduce((total, invoice) => total + invoice.grandTotal - invoice.paidTotal, 0),
            0
          )
        ),
        varianceCount: mappedOrders.filter((order) => order.hasVariance).length
      }
    };
  }

  async createSupplier(user: UserContext, dto: CreateSupplierDto) {
    const propertyId = this.requireProperty(user);
    const name = dto.name.trim();

    if (!name) {
      throw new BadRequestException("Supplier name is required.");
    }

    const requestedCode = dto.supplierCode?.trim().toUpperCase();
    const data = {
      propertyId,
      name,
      email: dto.email?.trim() || null,
      phone: dto.phone?.trim() || null,
      taxNumber: dto.taxNumber?.trim() || null,
      paymentTerms: dto.paymentTerms?.trim() || null
    };

    const duplicateName = await this.prisma.supplier.findFirst({
      where: { propertyId, name: { equals: name, mode: "insensitive" } }
    });
    if (duplicateName) {
      throw new ConflictException(`Supplier ${duplicateName.name} already exists.`);
    }

    let supplier = null;
    if (requestedCode) {
      const existing = await this.prisma.supplier.findFirst({ where: { propertyId, supplierCode: requestedCode } });
      if (existing) {
        throw new ConflictException(`Supplier code ${requestedCode} is already used by ${existing.name}.`);
      }
      supplier = await this.prisma.supplier.create({ data: { ...data, supplierCode: requestedCode } });
    } else {
      supplier = await withUniqueRetry(async () => {
        const last = await this.prisma.supplier.findFirst({
          where: { propertyId, supplierCode: { startsWith: "SUP-" } },
          orderBy: { supplierCode: "desc" }
        });
        return this.prisma.supplier.create({
          data: { ...data, supplierCode: nextNumber("SUP-", last?.supplierCode) }
        });
      });
    }

    await this.audit.record({
      organizationId: user.organizationId,
      propertyId,
      userId: user.userId,
      module: "purchasing",
      action: "create_supplier",
      recordType: "supplier",
      recordId: supplier.id,
      newValue: { supplierCode: supplier.supplierCode, name: supplier.name, paymentTerms: supplier.paymentTerms }
    });

    return { ...mapSupplier(supplier), openOrders: 0 };
  }

  async createOrder(user: UserContext, dto: CreatePurchaseOrderDto) {
    const propertyId = this.requireProperty(user);

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, propertyId }
    });
    if (!supplier) {
      throw new NotFoundException("Supplier was not found.");
    }
    if (supplier.status !== RecordStatus.ACTIVE) {
      throw new BadRequestException(`${supplier.name} is not an active supplier.`);
    }

    const itemIds = [...new Set(dto.lines.map((line) => line.inventoryItemId))];
    const items = await this.prisma.inventoryItem.findMany({
      where: { id: { in: itemIds }, propertyId, active: true }
    });
    const itemsById = new Map(items.map((item) => [item.id, item]));

    let subtotal = ZERO;
    let taxTotal = ZERO;
    const lines = dto.lines.map((line, index) => {
      const item = itemsById.get(line.inventoryItemId);
      if (!item) {
        throw new NotFoundException(`Material on line ${index + 1} was not found.`);
      }
      const quantity = new Prisma.Decimal(line.quantity);
      const unitCost = new Prisma.Decimal(line.unitCost);
      const taxAmount = new Prisma.Decimal(line.taxAmount || "0");
      if (quantity.lte(0)) {
        throw new BadRequestException(`Quantity on line ${index + 1} must be greater than zero.`);
      }
      if (unitCost.lt(0) || taxAmount.lt(0)) {
        throw new BadRequestException(`Cost and tax on line ${index + 1} cannot be negative.`);
      }
      const lineSubtotal = quantity.mul(unitCost);
      subtotal = subtotal.plus(lineSubtotal);
      taxTotal = taxTotal.plus(taxAmount);
      return {
        inventoryItemId: item.id,
        description: line.description?.trim() || item.name,
        quantityOrdered: quantity,
        unitCost,
        taxAmount,
        totalAmount: lineSubtotal.plus(taxAmount)
      };
    });

    const expectedAt = dto.expectedAt ? parseDateOnly(dto.expectedAt, "Expected delivery date") : null;
    const year = new Date().getUTCFullYear();

    const order = await withUniqueRetry(async () => {
      const last = await this.prisma.purchaseOrder.findFirst({
        where: { propertyId, orderNumber: { startsWith: `PO-${year}-` } },
        orderBy: { orderNumber: "desc" }
      });
      return this.prisma.purchaseOrder.create({
        data: {
          propertyId,
          supplierId: supplier.id,
          orderNumber: nextNumber(`PO-${year}-`, last?.orderNumber),
          status: PurchaseOrderStatus.DRAFT,
          expectedAt,
          subtotal,
          taxTotal,
          grandTotal: subtotal.plus(taxTotal),
          notes: dto.notes?.trim() || null,
          lines: { create: lines }
        },
        include: orderInclude
      });
    });

    await this.audit.record({
      organizationId: user.organizationId,
      propertyId,
      userId: user.userId,
      module: "purchasing",
      action: "create_purchase_order",
      recordType: "purchase_order",
      recordId: order.id,
      newValue: {
        orderNumber: order.orderNumber,
        supplierId: supplier.id,
        supplierName: supplier.name,
        lineCount: order.lines.length,
        grandTotal: order.grandTotal.toFixed(2)
      }
    });

    return mapOrder(order);
  }

  submitOrder(user: UserContext, orderId: string) {
    return this.transitionOrder(user, orderId, "submit_purchase_order", [PurchaseOrderStatus.DRAFT], {
      status: PurchaseOrderStatus.PENDING_APPROVAL
    });
  }

  approveOrder(user: UserContext, orderId: string) {
    return this.transitionOrder(
      user,
      orderId,
      "approve_purchase_order",
      [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.PENDING_APPROVAL],
      { status: PurchaseOrderStatus.APPROVED, approvedAt: new Date() }
    );
  }

  async cancelOrder(user: UserContext, orderId: string) {
    const propertyId = this.requireProperty(user);
    const order = await this.findOrder(this.prisma, propertyId, orderId);
    if (order.lines.some((line) => line.quantityReceived.gt(0))) {
      throw new ConflictException(`${order.orderNumber} already has goods received and cannot be cancelled.`);
    }
    return this.transitionOrder(
      user,
      orderId,
      "cancel_purchase_order",
      [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.PENDING_APPROVAL, PurchaseOrderStatus.APPROVED],
      { status: PurchaseOrderStatus.CANCELLED }
    );
  }

  async receiveOrder(user: UserContext, orderId: string, dto: ReceivePurchaseOrderDto) {
    const propertyId = this.requireProperty(user);

    if (!canUseStore(user.permissions, MAIN_STORE_CODE)) {
      throw new ForbiddenException("Receiving goods requires access to the Main Store.");
    }

    const mainStore = await this.ensureMainStore(propertyId);
    const businessDate = todayDateOnly();
    const deliveryNote = dto.deliveryNote?.trim() || null;

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM purchase_orders WHERE id = ${orderId}::uuid AND property_id = ${propertyId}::uuid FOR UPDATE`;
      const order = await this.findOrder(tx, propertyId, orderId);

      if (order.status !== PurchaseOrderStatus.APPROVED && order.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED) {
        throw new ConflictException(`${order.orderNumber} is ${statusLabel(order.status)}. Only approved orders can be received.`);
      }

      const linesById = new Map(order.lines.map((line) => [line.id, line]));
      const requested = dto.lines?.length
        ? dto.lines.map((entry) => {
            const line = linesById.get(entry.lineId);
            if (!line) {
              throw new NotFoundException("A receipt line does not belong to this purchase order.");
            }
            return { line, quantity: new Prisma.Decimal(entry.quantity) };
          })
        : order.lines.map((line) => ({ line, quantity: line.quantityOrdered.minus(line.quantityReceived) }));

      const seen = new Set<string>();
      const receipts = requested.filter((entry) => {
        if (seen.has(entry.line.id)) {
          throw new BadRequestException("Each order line can only appear once in a receipt.");
        }
        seen.add(entry.line.id);
        if (entry.quantity.lt(0)) {
          throw new BadRequestException("Received quantities cannot be negative.");
        }
        const outstanding = entry.line.quantityOrdered.minus(entry.line.quantityReceived);
        if (entry.quantity.gt(outstanding)) {
          throw new BadRequestException(
            `Only ${outstanding.toFixed(2)} of ${entry.line.description} is still outstanding on ${order.orderNumber}.`
          );
        }
        return entry.quantity.gt(0);
      });

      if (receipts.length === 0) {
        throw new BadRequestException("Enter a quantity received for at least one line.");
      }

      for (const { line } of receipts) {
        if (!line.inventoryItemId || !line.inventoryItem || !line.inventoryItem.active) {
          throw new BadRequestException(`${line.description} is no longer an active material and cannot be received into stock.`);
        }
      }

      const receiptValue = receipts.reduce((sum, { line, quantity }) => sum.plus(quantity.mul(line.unitCost)), ZERO);
      const journal = await this.postReceiptJournal(tx, user, propertyId, order, receiptValue, businessDate, deliveryNote);

      for (const { line, quantity } of receipts) {
        await applyStockReceipt(tx, {
          propertyId,
          itemId: line.inventoryItemId!,
          locationId: mainStore.id,
          quantity,
          unitCost: line.unitCost,
          businessDate,
          sourceType: "PURCHASE_ORDER",
          sourceId: order.id,
          journalEntryId: journal?.id ?? null
        });
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { quantityReceived: line.quantityReceived.plus(quantity) }
        });
      }

      const refreshedLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: order.id } });
      const fullyReceived = refreshedLines.every((line) => line.quantityReceived.gte(line.quantityOrdered));

      const updated = await tx.purchaseOrder.update({
        where: { id: order.id },
        data: {
          status: fullyReceived ? PurchaseOrderStatus.RECEIVED : PurchaseOrderStatus.PARTIALLY_RECEIVED,
          receivedAt: new Date()
        },
        include: orderInclude
      });

      return { order: updated, previousStatus: order.status, receipts, receiptValue, journal };
    }, { timeout: 20000 });

    await this.audit.record({
      organizationId: user.organizationId,
      propertyId,
      userId: user.userId,
      module: "purchasing",
      action: "receive_purchase_order",
      recordType: "purchase_order",
      recordId: result.order.id,
      previousValue: { status: result.previousStatus },
      newValue: {
        status: result.order.status,
        location: mainStore.code,
        deliveryNote,
        receiptValue: result.receiptValue.toFixed(2),
        journalEntryNumber: result.journal?.entryNumber ?? null,
        lines: result.receipts.map(({ line, quantity }) => ({
          lineId: line.id,
          itemId: line.inventoryItemId,
          quantity: quantity.toFixed(4),
          unitCost: line.unitCost.toFixed(4)
        }))
      }
    });

    return {
      order: mapOrder(result.order),
      receiptValue: Number(result.receiptValue),
      journalEntryNumber: result.journal?.entryNumber ?? null,
      journalPosted: Boolean(result.journal)
    };
  }

  async recordInvoice(user: UserContext, orderId: string, dto: RecordSupplierInvoiceDto) {
    const propertyId = this.requireProperty(user);
    const invoiceNumber = dto.invoiceNumber.trim();
    const subtotal = new Prisma.Decimal(dto.subtotal);
    const taxTotal = new Prisma.Decimal(dto.taxTotal || "0");
    const invoiceDate = parseDateOnly(dto.invoiceDate, "Invoice date");
    const dueDate = dto.dueDate ? parseDateOnly(dto.dueDate, "Due date") : null;

    if (!invoiceNumber) {
      throw new BadRequestException("Supplier invoice number is required.");
    }
    if (subtotal.lt(0) || taxTotal.lt(0)) {
      throw new BadRequestException("Invoice amounts cannot be negative.");
    }
    if (dueDate && dueDate < invoiceDate) {
      throw new BadRequestException("Due date cannot be before the invoice date.");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM purchase_orders WHERE id = ${orderId}::uuid AND property_id = ${propertyId}::uuid FOR UPDATE`;
      const order = await this.findOrder(tx, propertyId, orderId);

      if (order.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED && order.status !== PurchaseOrderStatus.RECEIVED) {
        throw new ConflictException(
          `${order.orderNumber} is ${statusLabel(order.status)}. Record supplier invoices after goods have been received.`
        );
      }

      const duplicate = await tx.supplierInvoice.findFirst({
        where: {
          propertyId,
          supplierId: order.supplierId,
          invoiceNumber: { equals: invoiceNumber, mode: "insensitive" },
          status: { not: SupplierInvoiceStatus.VOID }
        }
      });
      if (duplicate) {
        throw new ConflictException(`Invoice ${invoiceNumber} from ${order.supplier.name} has already been recorded.`);
      }

      // Three-way match: ordered (PO) vs received (GRN) vs invoiced. The invoice must cover
      // the value received that has not been invoiced yet.
      const receivedValue = receivedValueOf(order);
      const previouslyInvoiced = order.supplierInvoices
        .filter((invoice) => invoice.status !== SupplierInvoiceStatus.VOID)
        .reduce((sum, invoice) => sum.plus(invoice.subtotal), ZERO);
      const uninvoicedReceived = receivedValue.minus(previouslyInvoiced);
      const variance = subtotal.minus(uninvoicedReceived);
      const matched = variance.abs().lte(MATCH_TOLERANCE);
      const exceedsOrder = previouslyInvoiced.plus(subtotal).gt(order.subtotal.plus(MATCH_TOLERANCE));

      const invoice = await tx.supplierInvoice.create({
        data: {
          propertyId,
          supplierId: order.supplierId,
          purchaseOrderId: order.id,
          invoiceNumber,
          invoiceDate,
          dueDate,
          status: matched ? SupplierInvoiceStatus.MATCHED : SupplierInvoiceStatus.DRAFT,
          subtotal,
          taxTotal,
          grandTotal: subtotal.plus(taxTotal)
        }
      });

      let updatedOrder = order;
      if (matched && order.status === PurchaseOrderStatus.RECEIVED) {
        updatedOrder = await tx.purchaseOrder.update({
          where: { id: order.id },
          data: { status: PurchaseOrderStatus.CLOSED },
          include: orderInclude
        });
      } else {
        updatedOrder = await this.findOrder(tx, propertyId, order.id);
      }

      return { invoice, order: updatedOrder, previousStatus: order.status, receivedValue, uninvoicedReceived, variance, matched, exceedsOrder };
    }, { timeout: 20000 });

    await this.audit.record({
      organizationId: user.organizationId,
      propertyId,
      userId: user.userId,
      module: "purchasing",
      action: result.matched ? "record_supplier_invoice" : "record_supplier_invoice_variance",
      recordType: "supplier_invoice",
      recordId: result.invoice.id,
      previousValue: { orderStatus: result.previousStatus },
      newValue: {
        orderNumber: result.order.orderNumber,
        invoiceNumber: result.invoice.invoiceNumber,
        subtotal: result.invoice.subtotal.toFixed(2),
        taxTotal: result.invoice.taxTotal.toFixed(2),
        expectedSubtotal: result.uninvoicedReceived.toFixed(2),
        variance: result.variance.toFixed(2),
        status: result.invoice.status,
        orderStatus: result.order.status
      }
    });

    const variance = Number(result.variance);
    return {
      invoice: mapInvoice(result.invoice),
      order: mapOrder(result.order),
      match: {
        matched: result.matched,
        expectedSubtotal: Number(result.uninvoicedReceived),
        invoicedSubtotal: Number(result.invoice.subtotal),
        variance,
        exceedsOrder: result.exceedsOrder,
        message: result.matched
          ? `Invoice matches goods received (${result.uninvoicedReceived.toFixed(2)}).`
          : `Variance of ${result.variance.toFixed(2)}: invoice ${variance > 0 ? "is higher" : "is lower"} than goods received not yet invoiced (${result.uninvoicedReceived.toFixed(2)}). Held for review.`
      }
    };
  }

  private async transitionOrder(
    user: UserContext,
    orderId: string,
    action: string,
    allowedFrom: PurchaseOrderStatus[],
    data: Prisma.PurchaseOrderUpdateManyMutationInput & { status: PurchaseOrderStatus }
  ) {
    const propertyId = this.requireProperty(user);
    const order = await this.findOrder(this.prisma, propertyId, orderId);

    if (!allowedFrom.includes(order.status)) {
      throw new ConflictException(`${order.orderNumber} is ${statusLabel(order.status)} and cannot be changed this way.`);
    }

    // Conditional update guards against two users changing the same order at once.
    const changed = await this.prisma.purchaseOrder.updateMany({
      where: { id: order.id, propertyId, status: order.status },
      data
    });
    if (changed.count !== 1) {
      throw new ConflictException(`${order.orderNumber} was changed by someone else. Refresh and try again.`);
    }

    const updated = await this.findOrder(this.prisma, propertyId, order.id);

    await this.audit.record({
      organizationId: user.organizationId,
      propertyId,
      userId: user.userId,
      module: "purchasing",
      action,
      recordType: "purchase_order",
      recordId: order.id,
      previousValue: { status: order.status },
      newValue: { status: updated.status, orderNumber: updated.orderNumber }
    });

    return mapOrder(updated);
  }

  /**
   * Dr Inventory (1400) / Cr Accounts Payable (2100) for the value received. Only posted when the
   * property has both accounts and an open financial period covering the business date; otherwise
   * the receipt still goes through and finance can journal it manually.
   */
  private async postReceiptJournal(
    tx: Prisma.TransactionClient,
    user: UserContext,
    propertyId: string,
    order: OrderWithRelations,
    amount: Prisma.Decimal,
    businessDate: Date,
    deliveryNote: string | null
  ) {
    if (amount.lte(0)) {
      return null;
    }

    const [period, accounts] = await Promise.all([
      tx.financialPeriod.findFirst({
        where: {
          propertyId,
          status: FinancialPeriodStatus.OPEN,
          startDate: { lte: businessDate },
          endDate: { gte: businessDate }
        },
        orderBy: { startDate: "desc" }
      }),
      tx.account.findMany({
        where: {
          organizationId: user.organizationId,
          active: true,
          accountCode: { in: [INVENTORY_ACCOUNT_CODE, ACCOUNTS_PAYABLE_ACCOUNT_CODE] },
          OR: [{ propertyId }, { propertyId: null }]
        }
      })
    ]);

    const pick = (code: string) =>
      accounts.find((account) => account.accountCode === code && account.propertyId === propertyId) ??
      accounts.find((account) => account.accountCode === code);
    const inventoryAccount = pick(INVENTORY_ACCOUNT_CODE);
    const payableAccount = pick(ACCOUNTS_PAYABLE_ACCOUNT_CODE);

    if (!period || !inventoryAccount || !payableAccount) {
      return null;
    }

    const amountText = amount.toFixed(4);
    try {
      validateBalancedJournal([
        { accountCode: INVENTORY_ACCOUNT_CODE, debitAmount: amountText },
        { accountCode: ACCOUNTS_PAYABLE_ACCOUNT_CODE, creditAmount: amountText }
      ]);
    } catch (error) {
      if (error instanceof JournalValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const receiptCount = await tx.journalEntry.count({
      where: { propertyId, sourceType: "PURCHASE_RECEIPT", sourceId: order.id }
    });
    const sequence = receiptCount + 1;
    const description = `Goods received on ${order.orderNumber} from ${order.supplier.name}${deliveryNote ? ` (${deliveryNote})` : ""}`;

    return tx.journalEntry.create({
      data: {
        propertyId,
        financialPeriodId: period.id,
        entryNumber: `GRN-${order.orderNumber}-${sequence}`,
        sourceType: "PURCHASE_RECEIPT",
        sourceId: order.id,
        sourceNumber: order.orderNumber,
        status: JournalStatus.POSTED,
        idempotencyKey: `purchase-receipt:${order.id}:${sequence}`,
        postedAt: new Date(),
        lines: {
          create: [
            { accountId: inventoryAccount.id, debitAmount: amount, description },
            { accountId: payableAccount.id, creditAmount: amount, description }
          ]
        }
      }
    });
  }

  private async findOrder(tx: Prisma.TransactionClient | PrismaService, propertyId: string, orderId: string) {
    const order = await tx.purchaseOrder.findFirst({
      where: { id: orderId, propertyId },
      include: orderInclude
    });
    if (!order) {
      throw new NotFoundException("Purchase order was not found.");
    }
    return order;
  }

  private async ensureMainStore(propertyId: string) {
    const label = storeAccess.find((store) => store.locationCode === MAIN_STORE_CODE)?.label ?? "Main Store";
    return this.prisma.inventoryLocation.upsert({
      where: { propertyId_code: { propertyId, code: MAIN_STORE_CODE } },
      update: {},
      create: { propertyId, code: MAIN_STORE_CODE, name: label, locationType: "STORE" }
    });
  }

  private requireProperty(user: UserContext) {
    if (!user.propertyId) {
      throw new BadRequestException("A property context is required.");
    }
    return user.propertyId;
  }
}

function receivedValueOf(order: OrderWithRelations) {
  return order.lines.reduce((sum, line) => sum.plus(line.quantityReceived.mul(line.unitCost)), ZERO);
}

function mapSupplier(supplier: {
  id: string;
  supplierCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  taxNumber: string | null;
  paymentTerms: string | null;
  status: RecordStatus;
}) {
  return {
    id: supplier.id,
    code: supplier.supplierCode,
    name: supplier.name,
    email: supplier.email,
    phone: supplier.phone,
    taxNumber: supplier.taxNumber,
    paymentTerms: supplier.paymentTerms,
    status: supplier.status
  };
}

function mapInvoice(invoice: {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date | null;
  status: SupplierInvoiceStatus;
  subtotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
  paidTotal: Prisma.Decimal;
}) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: dateOnlyIso(invoice.invoiceDate),
    dueDate: invoice.dueDate ? dateOnlyIso(invoice.dueDate) : null,
    status: invoice.status,
    subtotal: Number(invoice.subtotal),
    taxTotal: Number(invoice.taxTotal),
    grandTotal: Number(invoice.grandTotal),
    paidTotal: Number(invoice.paidTotal)
  };
}

function mapOrder(order: OrderWithRelations) {
  const receivedValue = receivedValueOf(order);
  const invoicedValue = order.supplierInvoices
    .filter((invoice) => invoice.status !== SupplierInvoiceStatus.VOID)
    .reduce((sum, invoice) => sum.plus(invoice.subtotal), ZERO);
  const variance = order.supplierInvoices.length ? invoicedValue.minus(receivedValue) : ZERO;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    supplierId: order.supplierId,
    supplierName: order.supplier.name,
    orderedAt: order.orderedAt.toISOString(),
    expectedAt: order.expectedAt ? dateOnlyIso(order.expectedAt) : null,
    approvedAt: order.approvedAt?.toISOString() ?? null,
    receivedAt: order.receivedAt?.toISOString() ?? null,
    subtotal: Number(order.subtotal),
    taxTotal: Number(order.taxTotal),
    grandTotal: Number(order.grandTotal),
    receivedValue: Number(receivedValue),
    invoicedValue: Number(invoicedValue),
    variance: Number(variance),
    hasVariance:
      variance.abs().gt(MATCH_TOLERANCE) ||
      order.supplierInvoices.some((invoice) => invoice.status === SupplierInvoiceStatus.DRAFT),
    notes: order.notes,
    lines: order.lines.map((line) => ({
      id: line.id,
      inventoryItemId: line.inventoryItemId,
      itemName: line.inventoryItem?.name ?? line.description,
      sku: line.inventoryItem?.sku ?? null,
      unit: line.inventoryItem?.unitOfMeasure ?? "EA",
      description: line.description,
      quantityOrdered: Number(line.quantityOrdered),
      quantityReceived: Number(line.quantityReceived),
      outstanding: Number(Prisma.Decimal.max(line.quantityOrdered.minus(line.quantityReceived), 0)),
      unitCost: Number(line.unitCost),
      taxAmount: Number(line.taxAmount),
      totalAmount: Number(line.totalAmount)
    })),
    invoices: order.supplierInvoices.map(mapInvoice)
  };
}

// Sequence numbers are zero-padded so string ordering matches numeric ordering (up to 9999, then widens).
function nextNumber(prefix: string, last?: string | null) {
  const current = last ? Number.parseInt(last.slice(prefix.length), 10) : 0;
  const next = Number.isFinite(current) ? current + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

function statusLabel(status: PurchaseOrderStatus) {
  return status.toLowerCase().replace(/_/g, " ");
}

async function withUniqueRetry<T>(operation: () => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const isUniqueConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!isUniqueConflict || attempt >= attempts) {
        throw error;
      }
    }
  }
}

function parseDateOnly(value: string, label: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    throw new BadRequestException(`${label} must be in YYYY-MM-DD format.`);
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function dateOnlyIso(value: Date) {
  return value.toISOString().slice(0, 10);
}

function todayDateOnly() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
