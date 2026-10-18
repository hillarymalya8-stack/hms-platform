"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  PackageCheck,
  Plus,
  RefreshCcw,
  Send,
  Trash2,
  Truck,
  UserPlus
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api-client";

type Supplier = {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  taxNumber: string | null;
  paymentTerms: string | null;
  status: string;
  openOrders: number;
};

type PurchaseItem = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  onHand: number;
  lastCost: number;
};

type OrderStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CLOSED" | "CANCELLED";

type OrderLine = {
  id: string;
  inventoryItemId: string | null;
  itemName: string;
  sku: string | null;
  unit: string;
  description: string;
  quantityOrdered: number;
  quantityReceived: number;
  outstanding: number;
  unitCost: number;
  taxAmount: number;
  totalAmount: number;
};

type SupplierInvoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  status: "DRAFT" | "MATCHED" | "POSTED" | "PAID" | "VOID";
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  paidTotal: number;
};

type PurchaseOrder = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  supplierId: string;
  supplierName: string;
  orderedAt: string;
  expectedAt: string | null;
  approvedAt: string | null;
  receivedAt: string | null;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  receivedValue: number;
  invoicedValue: number;
  variance: number;
  hasVariance: boolean;
  notes: string | null;
  lines: OrderLine[];
  invoices: SupplierInvoice[];
};

type PurchasingOverview = {
  canReceive: boolean;
  mainStore: { id: string; name: string } | null;
  suppliers: Supplier[];
  items: PurchaseItem[];
  orders: PurchaseOrder[];
  summary: {
    awaitingApproval: number;
    awaitingReceipt: number;
    receivedNotInvoiced: number;
    openPayables: number;
    varianceCount: number;
  };
};

type ReceiveResponse = {
  order: PurchaseOrder;
  receiptValue: number;
  journalEntryNumber: string | null;
  journalPosted: boolean;
};

type InvoiceResponse = {
  invoice: SupplierInvoice;
  order: PurchaseOrder;
  match: { matched: boolean; variance: number; expectedSubtotal: number; message: string };
};

type DraftLine = { key: number; inventoryItemId: string; quantity: string; unitCost: string; taxAmount: string };

const emptySummary: PurchasingOverview["summary"] = {
  awaitingApproval: 0,
  awaitingReceipt: 0,
  receivedNotInvoiced: 0,
  openPayables: 0,
  varianceCount: 0
};

const statusTone: Record<OrderStatus, "primary" | "success" | "warning" | "danger" | "neutral"> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  APPROVED: "primary",
  PARTIALLY_RECEIVED: "warning",
  RECEIVED: "success",
  CLOSED: "success",
  CANCELLED: "danger"
};

const selectClass = "h-10 w-full rounded border border-border bg-white px-3 text-sm";

let lineKey = 0;
function newDraftLine(): DraftLine {
  lineKey += 1;
  return { key: lineKey, inventoryItemId: "", quantity: "", unitCost: "", taxAmount: "" };
}

export function PurchasingWorkspace() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [canReceive, setCanReceive] = useState(false);
  const [mainStoreName, setMainStoreName] = useState("Main Store");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading purchasing data...");
  const [statusFilter, setStatusFilter] = useState<"OPEN" | "ALL">("OPEN");
  const [selectedOrderId, setSelectedOrderId] = useState("");

  const [supplierForm, setSupplierForm] = useState({ name: "", email: "", phone: "", taxNumber: "", paymentTerms: "Net 30" });
  const [poForm, setPoForm] = useState({ supplierId: "", expectedAt: "", notes: "" });
  const [poLines, setPoLines] = useState<DraftLine[]>(() => [newDraftLine()]);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, string>>({});
  const [deliveryNote, setDeliveryNote] = useState("");
  const [invoiceForm, setInvoiceForm] = useState({ invoiceNumber: "", invoiceDate: todayIso(), dueDate: "", subtotal: "", taxTotal: "" });

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null;
  const visibleOrders = useMemo(
    () => (statusFilter === "ALL" ? orders : orders.filter((order) => order.status !== "CLOSED" && order.status !== "CANCELLED")),
    [orders, statusFilter]
  );
  const activeSuppliers = suppliers.filter((supplier) => supplier.status === "ACTIVE");

  const poTotals = useMemo(() => {
    return poLines.reduce(
      (totals, line) => {
        const quantity = Number(line.quantity);
        const unitCost = Number(line.unitCost);
        const tax = Number(line.taxAmount || 0);
        const lineValue = Number.isFinite(quantity * unitCost) ? quantity * unitCost : 0;
        return { subtotal: totals.subtotal + lineValue, tax: totals.tax + (Number.isFinite(tax) ? tax : 0) };
      },
      { subtotal: 0, tax: 0 }
    );
  }, [poLines]);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData(successMessage?: string) {
    setBusy(true);
    const result = await apiRequest<PurchasingOverview>("/purchasing/overview");
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    const data = result.data;
    setSuppliers(data.suppliers);
    setItems(data.items);
    setOrders(data.orders);
    setSummary(data.summary);
    setCanReceive(data.canReceive);
    setMainStoreName(data.mainStore?.name ?? "Main Store");
    setLoaded(true);
    setPoForm((current) => ({
      ...current,
      supplierId: data.suppliers.some((supplier) => supplier.id === current.supplierId && supplier.status === "ACTIVE")
        ? current.supplierId
        : data.suppliers.find((supplier) => supplier.status === "ACTIVE")?.id ?? ""
    }));
    setSelectedOrderId((current) => (data.orders.some((order) => order.id === current) ? current : ""));

    if (successMessage) {
      setMessage(successMessage);
    } else if (data.suppliers.length === 0) {
      setMessage("No suppliers yet — add your first supplier to start raising purchase orders.");
    } else if (data.items.length === 0) {
      setMessage("No materials yet. Add materials in Inventory before raising purchase orders.");
    } else {
      setMessage(`${data.orders.length} purchase ${data.orders.length === 1 ? "order" : "orders"} loaded.`);
    }
  }

  function replaceOrder(order: PurchaseOrder) {
    setOrders((current) => current.map((entry) => (entry.id === order.id ? order : entry)));
  }

  function selectOrder(order: PurchaseOrder | null) {
    if (!order) {
      setSelectedOrderId("");
      return;
    }
    setSelectedOrderId(order.id);
    setReceiveQuantities(Object.fromEntries(order.lines.map((line) => [line.id, line.outstanding > 0 ? String(line.outstanding) : "0"])));
    setDeliveryNote("");
    const uninvoiced = Math.max(order.receivedValue - order.invoicedValue, 0);
    setInvoiceForm({ invoiceNumber: "", invoiceDate: todayIso(), dueDate: "", subtotal: uninvoiced ? uninvoiced.toFixed(2) : "", taxTotal: "" });
  }

  async function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = supplierForm.name.trim();
    if (!name) {
      setMessage("Enter the supplier name before saving.");
      return;
    }

    const payload = Object.fromEntries(
      Object.entries({ ...supplierForm, name }).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value !== "")
    );

    setBusy(true);
    const result = await apiRequest<Supplier>("/purchasing/suppliers", { method: "POST", body: JSON.stringify(payload) });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setSuppliers((current) => [...current, result.data].sort((left, right) => left.name.localeCompare(right.name)));
    setPoForm((current) => ({ ...current, supplierId: current.supplierId || result.data.id }));
    setSupplierForm({ name: "", email: "", phone: "", taxNumber: "", paymentTerms: "Net 30" });
    setMessage(`${result.data.name} (${result.data.code}) added as a supplier.`);
  }

  function updateLine(key: number, patch: Partial<DraftLine>) {
    setPoLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if (patch.inventoryItemId !== undefined && !line.unitCost) {
          const item = items.find((entry) => entry.id === patch.inventoryItemId);
          if (item && item.lastCost > 0) next.unitCost = item.lastCost.toFixed(2);
        }
        return next;
      })
    );
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supplier = suppliers.find((entry) => entry.id === poForm.supplierId);
    if (!supplier) {
      setMessage("Choose a supplier for the purchase order.");
      return;
    }

    const filled = poLines.filter((line) => line.inventoryItemId || line.quantity || line.unitCost);
    if (filled.length === 0) {
      setMessage("Add at least one line with a material, quantity, and unit cost.");
      return;
    }

    for (const [index, line] of filled.entries()) {
      const quantity = Number(line.quantity);
      const unitCost = Number(line.unitCost);
      const tax = Number(line.taxAmount || 0);
      if (!line.inventoryItemId || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0 || !Number.isFinite(tax) || tax < 0) {
        setMessage(`Line ${index + 1}: choose a material and enter a quantity above zero and a valid unit cost.`);
        return;
      }
    }

    setBusy(true);
    const result = await apiRequest<PurchaseOrder>("/purchasing/orders", {
      method: "POST",
      body: JSON.stringify({
        supplierId: supplier.id,
        ...(poForm.expectedAt ? { expectedAt: poForm.expectedAt } : {}),
        ...(poForm.notes.trim() ? { notes: poForm.notes.trim() } : {}),
        lines: filled.map((line) => ({
          inventoryItemId: line.inventoryItemId,
          quantity: line.quantity.trim(),
          unitCost: line.unitCost.trim(),
          ...(line.taxAmount.trim() ? { taxAmount: line.taxAmount.trim() } : {})
        }))
      })
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setPoForm((current) => ({ ...current, expectedAt: "", notes: "" }));
    setPoLines([newDraftLine()]);
    await loadData(`${result.data.orderNumber} created for ${supplier.name} (${formatMoney(result.data.grandTotal)}). Submit or approve it next.`);
    selectOrder(result.data);
  }

  async function changeStatus(order: PurchaseOrder, action: "submit" | "approve" | "cancel") {
    if (action === "cancel" && !window.confirm(`Cancel ${order.orderNumber}? This cannot be undone.`)) {
      return;
    }

    setBusy(true);
    const result = await apiRequest<PurchaseOrder>(`/purchasing/orders/${order.id}/${action}`, { method: "POST" });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    const verbs = { submit: "submitted for approval", approve: "approved and ready to receive", cancel: "cancelled" };
    await loadData(`${result.data.orderNumber} ${verbs[action]}.`);
  }

  async function receiveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;

    const lines = [];
    for (const line of selectedOrder.lines) {
      const raw = (receiveQuantities[line.id] ?? "").trim();
      if (!raw || Number(raw) === 0) continue;
      const quantity = Number(raw);
      if (!Number.isFinite(quantity) || quantity < 0) {
        setMessage(`Enter a valid quantity received for ${line.itemName}.`);
        return;
      }
      if (quantity > line.outstanding + 1e-9) {
        setMessage(`Only ${formatQty(line.outstanding)} ${line.unit} of ${line.itemName} is outstanding.`);
        return;
      }
      lines.push({ lineId: line.id, quantity: raw });
    }

    if (lines.length === 0) {
      setMessage("Enter the quantity received for at least one line.");
      return;
    }

    setBusy(true);
    const result = await apiRequest<ReceiveResponse>(`/purchasing/orders/${selectedOrder.id}/receive`, {
      method: "POST",
      body: JSON.stringify({ lines, ...(deliveryNote.trim() ? { deliveryNote: deliveryNote.trim() } : {}) })
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    const journalNote = result.data.journalPosted
      ? ` Journal ${result.data.journalEntryNumber} posted (Dr Inventory / Cr Accounts Payable).`
      : " No journal posted (no open financial period or Inventory/AP accounts) — finance should journal this receipt.";
    await loadData(
      `${formatMoney(result.data.receiptValue)} of goods received into ${mainStoreName} on ${result.data.order.orderNumber}.${journalNote}`
    );
    selectOrder(result.data.order);
  }

  async function recordInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;

    const invoiceNumber = invoiceForm.invoiceNumber.trim();
    const subtotal = Number(invoiceForm.subtotal);
    const tax = Number(invoiceForm.taxTotal || 0);
    if (!invoiceNumber || !invoiceForm.invoiceDate || !Number.isFinite(subtotal) || subtotal < 0 || !Number.isFinite(tax) || tax < 0) {
      setMessage("Enter the supplier invoice number, date, and amount before recording.");
      return;
    }

    setBusy(true);
    const result = await apiRequest<InvoiceResponse>(`/purchasing/orders/${selectedOrder.id}/invoices`, {
      method: "POST",
      body: JSON.stringify({
        invoiceNumber,
        invoiceDate: invoiceForm.invoiceDate,
        ...(invoiceForm.dueDate ? { dueDate: invoiceForm.dueDate } : {}),
        subtotal: invoiceForm.subtotal.trim(),
        ...(invoiceForm.taxTotal.trim() ? { taxTotal: invoiceForm.taxTotal.trim() } : {})
      })
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    await loadData(`Invoice ${result.data.invoice.invoiceNumber} recorded. ${result.data.match.message}`);
    selectOrder(result.data.order);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">Purchasing Workspace</h3>
            <p className="text-sm text-muted-foreground">
              Raise purchase orders, approve, receive goods into the {mainStoreName}, and match supplier invoices.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={() => void loadData()} disabled={busy}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        </div>

        <p role="status" className="rounded border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">
          {message}
        </p>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard label="Awaiting approval" value={String(summary.awaitingApproval)} />
          <SummaryCard label="Awaiting receipt" value={String(summary.awaitingReceipt)} />
          <SummaryCard label="Received, not invoiced" value={formatMoney(summary.receivedNotInvoiced)} />
          <SummaryCard label="Invoice variances" value={String(summary.varianceCount)} warn={summary.varianceCount > 0} />
        </div>

        <div className="overflow-hidden rounded border border-border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              <h4 className="font-bold">Purchase Orders</h4>
            </div>
            <select
              aria-label="Order filter"
              className="h-9 rounded border border-border bg-white px-2 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "OPEN" | "ALL")}
            >
              <option value="OPEN">Open orders</option>
              <option value="ALL">All orders</option>
            </select>
          </div>
          <div className="divide-y divide-border">
            {!loaded ? (
              <p className="px-4 py-8 text-sm text-muted-foreground">Loading purchase orders...</p>
            ) : visibleOrders.length === 0 ? (
              <p className="px-4 py-8 text-sm text-muted-foreground">
                {orders.length === 0
                  ? suppliers.length === 0
                    ? "No purchase orders yet. Add a supplier, then raise your first purchase order."
                    : "No purchase orders yet. Use the form to raise your first purchase order."
                  : "No open purchase orders. Switch to “All orders” to see closed and cancelled ones."}
              </p>
            ) : (
              visibleOrders.map((order) => {
                const selected = order.id === selectedOrderId;
                return (
                  <div key={order.id} className={selected ? "bg-primary/5" : undefined}>
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-start justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-muted/40"
                      onClick={() => selectOrder(selected ? null : order)}
                      aria-expanded={selected}
                    >
                      <div className="min-w-0">
                        <p className="font-bold">{order.orderNumber}</p>
                        <p className="truncate text-muted-foreground">
                          {order.supplierName} · {order.lines.length} {order.lines.length === 1 ? "line" : "lines"}
                          {order.expectedAt ? ` · due ${formatDate(order.expectedAt)}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {order.hasVariance ? (
                          <Badge tone="danger">
                            <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
                            Variance
                          </Badge>
                        ) : null}
                        <Badge tone={statusTone[order.status]}>{statusLabel(order.status)}</Badge>
                        <span className="font-semibold tabular-nums">{formatMoney(order.grandTotal)}</span>
                      </div>
                    </button>
                    {selected ? (
                      <OrderDetail
                        order={order}
                        busy={busy}
                        canReceive={canReceive}
                        mainStoreName={mainStoreName}
                        receiveQuantities={receiveQuantities}
                        setReceiveQuantities={setReceiveQuantities}
                        deliveryNote={deliveryNote}
                        setDeliveryNote={setDeliveryNote}
                        invoiceForm={invoiceForm}
                        setInvoiceForm={setInvoiceForm}
                        onStatus={(action) => void changeStatus(order, action)}
                        onReceive={receiveOrder}
                        onInvoice={recordInvoice}
                      />
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-4">
        <form onSubmit={createOrder} className="rounded border border-border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">New Purchase Order</h4>
          </div>
          {activeSuppliers.length === 0 ? (
            <p className="mb-3 rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
              No suppliers yet — add your first supplier below.
            </p>
          ) : null}
          {loaded && items.length === 0 ? (
            <p className="mb-3 rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
              No materials yet — add materials in Inventory so they can be ordered.
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              aria-label="Supplier"
              className={selectClass}
              value={poForm.supplierId}
              onChange={(event) => setPoForm({ ...poForm, supplierId: event.target.value })}
            >
              <option value="">Select supplier</option>
              {activeSuppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Expected delivery
              <Input
                aria-label="Expected delivery date"
                type="date"
                min={todayIso()}
                value={poForm.expectedAt}
                onChange={(event) => setPoForm({ ...poForm, expectedAt: event.target.value })}
              />
            </label>
          </div>

          <div className="mt-3 space-y-3">
            {poLines.map((line, index) => {
              const item = items.find((entry) => entry.id === line.inventoryItemId);
              return (
                <div key={line.key} className="rounded border border-border bg-background/60 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">Line {index + 1}</span>
                    {poLines.length > 1 ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs text-danger hover:underline"
                        onClick={() => setPoLines((current) => current.filter((entry) => entry.key !== line.key))}
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr]">
                    <select
                      aria-label={`Line ${index + 1} material`}
                      className={selectClass}
                      value={line.inventoryItemId}
                      onChange={(event) => updateLine(line.key, { inventoryItemId: event.target.value })}
                    >
                      <option value="">Select material</option>
                      {items.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name} ({entry.unit})
                        </option>
                      ))}
                    </select>
                    <Input
                      aria-label={`Line ${index + 1} quantity`}
                      inputMode="decimal"
                      placeholder={item ? `Qty ${item.unit}` : "Qty"}
                      value={line.quantity}
                      onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                    />
                    <Input
                      aria-label={`Line ${index + 1} unit cost`}
                      inputMode="decimal"
                      placeholder="Unit cost"
                      value={line.unitCost}
                      onChange={(event) => updateLine(line.key, { unitCost: event.target.value })}
                    />
                    <Input
                      aria-label={`Line ${index + 1} tax amount`}
                      inputMode="decimal"
                      placeholder="Tax (opt.)"
                      value={line.taxAmount}
                      onChange={(event) => updateLine(line.key, { taxAmount: event.target.value })}
                    />
                  </div>
                  {item ? (
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {formatQty(item.onHand)} {item.unit} in {mainStoreName}
                      {item.lastCost > 0 ? ` · avg cost ${formatMoney(item.lastCost)}` : ""}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          <Button type="button" variant="ghost" className="mt-2" onClick={() => setPoLines((current) => [...current, newDraftLine()])}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add line
          </Button>
          <Input
            aria-label="Order notes"
            className="mt-2"
            placeholder="Notes for the supplier (optional)"
            value={poForm.notes}
            onChange={(event) => setPoForm({ ...poForm, notes: event.target.value })}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm tabular-nums">
              Total <span className="font-bold">{formatMoney(poTotals.subtotal + poTotals.tax)}</span>
              {poTotals.tax > 0 ? <span className="text-muted-foreground"> (incl. {formatMoney(poTotals.tax)} tax)</span> : null}
            </p>
            <Button disabled={busy || activeSuppliers.length === 0 || items.length === 0}>
              <FileText className="h-4 w-4" aria-hidden="true" />
              Create order
            </Button>
          </div>
        </form>

        <form onSubmit={createSupplier} className="rounded border border-border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Add Supplier</h4>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              aria-label="Supplier name"
              className="sm:col-span-2"
              placeholder="Supplier name"
              value={supplierForm.name}
              onChange={(event) => setSupplierForm({ ...supplierForm, name: event.target.value })}
            />
            <Input
              aria-label="Supplier email"
              type="email"
              placeholder="Email (optional)"
              value={supplierForm.email}
              onChange={(event) => setSupplierForm({ ...supplierForm, email: event.target.value })}
            />
            <Input
              aria-label="Supplier phone"
              type="tel"
              placeholder="Phone (optional)"
              value={supplierForm.phone}
              onChange={(event) => setSupplierForm({ ...supplierForm, phone: event.target.value })}
            />
            <Input
              aria-label="Supplier tax number"
              placeholder="Tax / VAT number (optional)"
              value={supplierForm.taxNumber}
              onChange={(event) => setSupplierForm({ ...supplierForm, taxNumber: event.target.value })}
            />
            <Input
              aria-label="Payment terms"
              placeholder="Payment terms e.g. Net 30"
              value={supplierForm.paymentTerms}
              onChange={(event) => setSupplierForm({ ...supplierForm, paymentTerms: event.target.value })}
            />
          </div>
          <Button className="mt-3" disabled={busy}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Save supplier
          </Button>
        </form>

        <div className="rounded border border-border bg-white">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Truck className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Suppliers</h4>
          </div>
          <div className="divide-y divide-border">
            {!loaded ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">Loading suppliers...</p>
            ) : suppliers.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No suppliers yet — add your first supplier.</p>
            ) : (
              suppliers.map((supplier) => (
                <div key={supplier.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold">{supplier.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[supplier.code, supplier.paymentTerms, supplier.phone, supplier.email].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {supplier.status !== "ACTIVE" ? <Badge tone="neutral">{supplier.status.toLowerCase()}</Badge> : null}
                    <Badge tone={supplier.openOrders > 0 ? "primary" : "neutral"}>
                      {supplier.openOrders} open
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded border bg-white p-4 ${warn ? "border-warning/60" : "border-border"}`}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

type OrderDetailProps = {
  order: PurchaseOrder;
  busy: boolean;
  canReceive: boolean;
  mainStoreName: string;
  receiveQuantities: Record<string, string>;
  setReceiveQuantities: (updater: (current: Record<string, string>) => Record<string, string>) => void;
  deliveryNote: string;
  setDeliveryNote: (value: string) => void;
  invoiceForm: { invoiceNumber: string; invoiceDate: string; dueDate: string; subtotal: string; taxTotal: string };
  setInvoiceForm: (value: OrderDetailProps["invoiceForm"]) => void;
  onStatus: (action: "submit" | "approve" | "cancel") => void;
  onReceive: (event: FormEvent<HTMLFormElement>) => void;
  onInvoice: (event: FormEvent<HTMLFormElement>) => void;
};

function OrderDetail({
  order,
  busy,
  canReceive,
  mainStoreName,
  receiveQuantities,
  setReceiveQuantities,
  deliveryNote,
  setDeliveryNote,
  invoiceForm,
  setInvoiceForm,
  onStatus,
  onReceive,
  onInvoice
}: OrderDetailProps) {
  const receivable = order.status === "APPROVED" || order.status === "PARTIALLY_RECEIVED";
  const invoiceable = order.status === "PARTIALLY_RECEIVED" || order.status === "RECEIVED";
  const hasReceipts = order.lines.some((line) => line.quantityReceived > 0);
  const cancellable = (order.status === "DRAFT" || order.status === "PENDING_APPROVAL" || order.status === "APPROVED") && !hasReceipts;
  const uninvoiced = order.receivedValue - order.invoicedValue;
  const invoiceSubtotal = Number(invoiceForm.subtotal);
  const previewVariance = invoiceForm.subtotal && Number.isFinite(invoiceSubtotal) ? invoiceSubtotal - uninvoiced : 0;

  return (
    <div className="space-y-4 border-t border-border px-4 pb-4 pt-3">
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Metric label="Ordered" value={formatMoney(order.subtotal)} />
        <Metric label="Received" value={formatMoney(order.receivedValue)} />
        <Metric label="Invoiced" value={formatMoney(order.invoicedValue)} />
        <Metric
          label="Variance"
          value={formatMoney(order.variance)}
          tone={Math.abs(order.variance) > 0.01 ? "text-danger" : undefined}
        />
      </div>
      {order.notes ? <p className="text-sm text-muted-foreground">Notes: {order.notes}</p> : null}

      <div className="flex flex-wrap gap-2">
        {order.status === "DRAFT" ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => onStatus("submit")}>
            <Send className="h-4 w-4" aria-hidden="true" />
            Submit for approval
          </Button>
        ) : null}
        {order.status === "DRAFT" || order.status === "PENDING_APPROVAL" ? (
          <Button type="button" disabled={busy} onClick={() => onStatus("approve")}>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Approve
          </Button>
        ) : null}
        {cancellable ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onStatus("cancel")}>
            <Ban className="h-4 w-4" aria-hidden="true" />
            Cancel order
          </Button>
        ) : null}
      </div>

      <form onSubmit={onReceive} className="rounded border border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            <h5 className="text-sm font-bold">{receivable ? `Receive into ${mainStoreName}` : "Order lines"}</h5>
          </div>
          {receivable && !canReceive ? (
            <span className="text-xs text-muted-foreground">Main Store access is required to receive goods.</span>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Material</th>
                <th className="px-3 py-2 text-right font-semibold">Ordered</th>
                <th className="px-3 py-2 text-right font-semibold">Received</th>
                <th className="px-3 py-2 text-right font-semibold">Unit cost</th>
                {receivable && canReceive ? <th className="px-3 py-2 text-right font-semibold">Receive now</th> : null}
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <p className="font-semibold">{line.itemName}</p>
                    {line.sku ? <p className="text-xs text-muted-foreground">{line.sku}</p> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatQty(line.quantityOrdered)} {line.unit}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatQty(line.quantityReceived)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.unitCost)}</td>
                  {receivable && canReceive ? (
                    <td className="px-3 py-2 text-right">
                      {line.outstanding > 0 ? (
                        <Input
                          aria-label={`Quantity received for ${line.itemName}`}
                          inputMode="decimal"
                          className="ml-auto w-24 text-right"
                          value={receiveQuantities[line.id] ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            setReceiveQuantities((current) => ({ ...current, [line.id]: value }));
                          }}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">Complete</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {receivable && canReceive ? (
          <div className="flex flex-col gap-2 border-t border-border p-3 sm:flex-row">
            <Input
              aria-label="Delivery note number"
              placeholder="Delivery note / GRN number (optional)"
              value={deliveryNote}
              onChange={(event) => setDeliveryNote(event.target.value)}
            />
            <Button disabled={busy} className="shrink-0">
              <PackageCheck className="h-4 w-4" aria-hidden="true" />
              Post receipt
            </Button>
          </div>
        ) : null}
      </form>

      <div className="rounded border border-border">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
          <h5 className="text-sm font-bold">Supplier invoices</h5>
        </div>
        {order.invoices.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">
            {invoiceable ? "No supplier invoice recorded yet." : "Supplier invoices can be recorded once goods are received."}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {order.invoices.map((invoice) => (
              <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div>
                  <p className="font-semibold">{invoice.invoiceNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(invoice.invoiceDate)}
                    {invoice.dueDate ? ` · due ${formatDate(invoice.dueDate)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={invoice.status === "DRAFT" ? "danger" : invoice.status === "VOID" ? "neutral" : "success"}>
                    {invoice.status === "DRAFT" ? "Variance - review" : invoice.status.toLowerCase()}
                  </Badge>
                  <span className="font-semibold tabular-nums">{formatMoney(invoice.grandTotal)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {invoiceable ? (
          <form onSubmit={onInvoice} className="space-y-3 border-t border-border p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                aria-label="Supplier invoice number"
                placeholder="Supplier invoice number"
                value={invoiceForm.invoiceNumber}
                onChange={(event) => setInvoiceForm({ ...invoiceForm, invoiceNumber: event.target.value })}
              />
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Invoice date
                <Input
                  aria-label="Invoice date"
                  type="date"
                  value={invoiceForm.invoiceDate}
                  onChange={(event) => setInvoiceForm({ ...invoiceForm, invoiceDate: event.target.value })}
                />
              </label>
              <Input
                aria-label="Invoice amount before tax"
                inputMode="decimal"
                placeholder="Amount before tax"
                value={invoiceForm.subtotal}
                onChange={(event) => setInvoiceForm({ ...invoiceForm, subtotal: event.target.value })}
              />
              <Input
                aria-label="Invoice tax"
                inputMode="decimal"
                placeholder="Tax (optional)"
                value={invoiceForm.taxTotal}
                onChange={(event) => setInvoiceForm({ ...invoiceForm, taxTotal: event.target.value })}
              />
              <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
                Due date (optional)
                <Input
                  aria-label="Invoice due date"
                  type="date"
                  min={invoiceForm.invoiceDate}
                  value={invoiceForm.dueDate}
                  onChange={(event) => setInvoiceForm({ ...invoiceForm, dueDate: event.target.value })}
                />
              </label>
            </div>
            <p className={`text-xs tabular-nums ${Math.abs(previewVariance) > 0.01 ? "text-danger" : "text-muted-foreground"}`}>
              Received not yet invoiced: {formatMoney(Math.max(uninvoiced, 0))}
              {Math.abs(previewVariance) > 0.01 ? ` · variance ${formatMoney(previewVariance)} will be flagged for review` : " · 3-way match OK"}
            </p>
            <Button disabled={busy}>
              <FileText className="h-4 w-4" aria-hidden="true" />
              Record invoice
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded border border-border bg-white p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-semibold tabular-nums ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

function statusLabel(status: OrderStatus) {
  const labels: Record<OrderStatus, string> = {
    DRAFT: "Draft",
    PENDING_APPROVAL: "Pending approval",
    APPROVED: "Approved",
    PARTIALLY_RECEIVED: "Part received",
    RECEIVED: "Received",
    CLOSED: "Closed",
    CANCELLED: "Cancelled"
  };
  return labels[status];
}

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
}

function formatQty(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2
  }).format(value);
}
