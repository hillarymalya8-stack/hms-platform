"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  FileText,
  RefreshCcw,
  Send,
  Truck
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Supplier = {
  id: string;
  name: string;
  terms: string;
  category: string;
};

type PurchaseItem = {
  id: string;
  name: string;
  unit: string;
  lastCost: number;
};

type PurchaseOrderStatus = "DRAFT" | "APPROVED" | "RECEIVED" | "INVOICED" | "PAID";

type PurchaseOrder = {
  id: string;
  poNumber: string;
  supplierId: string;
  itemId: string;
  quantity: number;
  unitCost: number;
  status: PurchaseOrderStatus;
  receivedQuantity: number;
  invoiceNumber?: string;
  invoiceAmount?: number;
  dueDate?: string;
};

type ApEvent = {
  id: string;
  reference: string;
  action: string;
  supplierName: string;
  amount: number;
  posting: string;
};

const demoSuppliers: Supplier[] = [
  { id: "supplier-fresh", name: "Fresh Foods Ltd", terms: "Net 14", category: "Food" },
  { id: "supplier-beverage", name: "Arusha Beverage Supply", terms: "Net 7", category: "Beverage" },
  { id: "supplier-clean", name: "CleanPro Supplies", terms: "Net 30", category: "Housekeeping" }
];

const demoPurchaseItems: PurchaseItem[] = [
  { id: "item-chicken", name: "Chicken Fillets", unit: "kg", lastCost: 5.4 },
  { id: "item-rice", name: "Basmati Rice", unit: "kg", lastCost: 1.75 },
  { id: "item-coffee", name: "Coffee Beans", unit: "kg", lastCost: 8.2 },
  { id: "item-detergent", name: "Laundry Detergent", unit: "ltr", lastCost: 3.1 }
];

const demoPurchaseOrders: PurchaseOrder[] = [
  {
    id: "po-demo-1",
    poNumber: "PO-2026-0001",
    supplierId: "supplier-fresh",
    itemId: "item-chicken",
    quantity: 20,
    unitCost: 5.4,
    status: "APPROVED",
    receivedQuantity: 0
  },
  {
    id: "po-demo-2",
    poNumber: "PO-2026-0002",
    supplierId: "supplier-clean",
    itemId: "item-detergent",
    quantity: 12,
    unitCost: 3.1,
    status: "RECEIVED",
    receivedQuantity: 12
  }
];

export function PurchasingWorkspace() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [events, setEvents] = useState<ApEvent[]>([]);
  const [message, setMessage] = useState("Load purchasing data to begin the procure-to-pay flow.");

  const [poForm, setPoForm] = useState({
    supplierId: "supplier-fresh",
    itemId: "item-chicken",
    quantity: "15",
    unitCost: "5.40"
  });

  const [invoiceForm, setInvoiceForm] = useState({
    orderId: "",
    invoiceNumber: "INV-2026-1001",
    invoiceAmount: "108.00",
    dueDate: "2026-09-14"
  });

  const activeSuppliers = suppliers.length ? suppliers : demoSuppliers;
  const activeItems = items.length ? items : demoPurchaseItems;

  const enrichedOrders = useMemo(
    () =>
      orders.map((order) => {
        const supplier = activeSuppliers.find((entry) => entry.id === order.supplierId);
        const item = activeItems.find((entry) => entry.id === order.itemId);
        const poTotal = order.quantity * order.unitCost;
        const receivedTotal = order.receivedQuantity * order.unitCost;
        const variance = typeof order.invoiceAmount === "number" ? order.invoiceAmount - receivedTotal : 0;
        return { ...order, supplier, item, poTotal, receivedTotal, variance };
      }),
    [activeItems, activeSuppliers, orders]
  );

  const approvedCount = enrichedOrders.filter((order) => order.status === "APPROVED").length;
  const receivedNotInvoiced = enrichedOrders
    .filter((order) => order.status === "RECEIVED")
    .reduce((sum, order) => sum + order.receivedTotal, 0);
  const apBalance = enrichedOrders
    .filter((order) => order.status === "INVOICED")
    .reduce((sum, order) => sum + (order.invoiceAmount ?? 0), 0);
  const paidTotal = enrichedOrders
    .filter((order) => order.status === "PAID")
    .reduce((sum, order) => sum + (order.invoiceAmount ?? order.poTotal), 0);

  function loadData() {
    setSuppliers([...demoSuppliers]);
    setItems([...demoPurchaseItems]);
    setOrders(demoPurchaseOrders.map((order) => ({ ...order })));
    setEvents([]);
    setInvoiceForm((current) => ({ ...current, orderId: "po-demo-2", invoiceAmount: "37.20" }));
    setMessage("Purchasing data loaded.");
  }

  function createPurchaseOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supplier = activeSuppliers.find((entry) => entry.id === poForm.supplierId);
    const item = activeItems.find((entry) => entry.id === poForm.itemId);
    const quantity = Number(poForm.quantity);
    const unitCost = Number(poForm.unitCost);

    if (!supplier || !item || quantity <= 0 || unitCost <= 0) {
      setMessage("Choose a supplier, item, quantity, and unit cost before creating a PO.");
      return;
    }

    const orderNumber = `PO-2026-${String(orders.length + 1).padStart(4, "0")}`;
    const order: PurchaseOrder = {
      id: createLocalId("po"),
      poNumber: orderNumber,
      supplierId: supplier.id,
      itemId: item.id,
      quantity,
      unitCost,
      status: "DRAFT",
      receivedQuantity: 0
    };

    setOrders((current) => [order, ...current]);
    setMessage(`${orderNumber} created for ${supplier.name}. Approve it before receiving goods.`);
  }

  function approveOrder(orderId: string) {
    const order = enrichedOrders.find((entry) => entry.id === orderId);
    if (!order || order.status !== "DRAFT") {
      setMessage("Only draft purchase orders can be approved.");
      return;
    }

    setOrders((current) =>
      current.map((entry) => (entry.id === orderId ? { ...entry, status: "APPROVED" } : entry))
    );
    setEvents((current) => [
      {
        id: createLocalId("event"),
        reference: order.poNumber,
        action: "Approved",
        supplierName: order.supplier?.name ?? "Supplier",
        amount: order.poTotal,
        posting: "No accounting entry until goods or invoice are received"
      },
      ...current
    ]);
    setMessage(`${order.poNumber} approved.`);
  }

  function receiveOrder(orderId: string) {
    const order = enrichedOrders.find((entry) => entry.id === orderId);
    if (!order || order.status !== "APPROVED") {
      setMessage("Only approved purchase orders can be received.");
      return;
    }

    setOrders((current) =>
      current.map((entry) =>
        entry.id === orderId ? { ...entry, status: "RECEIVED", receivedQuantity: entry.quantity } : entry
      )
    );
    setInvoiceForm((current) => ({
      ...current,
      orderId,
      invoiceAmount: order.poTotal.toFixed(2)
    }));
    setEvents((current) => [
      {
        id: createLocalId("event"),
        reference: `GRN-${order.poNumber.slice(-4)}`,
        action: "Goods received",
        supplierName: order.supplier?.name ?? "Supplier",
        amount: order.poTotal,
        posting: "Dr Inventory, Cr Goods received not invoiced"
      },
      ...current
    ]);
    setMessage(`${order.poNumber} received. Supplier invoice can now be matched.`);
  }

  function matchInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const order = enrichedOrders.find((entry) => entry.id === invoiceForm.orderId);
    const invoiceAmount = Number(invoiceForm.invoiceAmount);

    if (!order || order.status !== "RECEIVED" || invoiceAmount <= 0) {
      setMessage("Select a received PO and enter a valid supplier invoice amount.");
      return;
    }

    const varianceLimit = Math.max(2, order.receivedTotal * 0.03);
    if (Math.abs(invoiceAmount - order.receivedTotal) > varianceLimit) {
      setMessage("Invoice variance is above tolerance. Manager approval is required before posting AP.");
      return;
    }

    setOrders((current) =>
      current.map((entry) =>
        entry.id === order.id
          ? {
              ...entry,
              status: "INVOICED",
              invoiceNumber: invoiceForm.invoiceNumber,
              invoiceAmount,
              dueDate: invoiceForm.dueDate
            }
          : entry
      )
    );
    setEvents((current) => [
      {
        id: createLocalId("event"),
        reference: invoiceForm.invoiceNumber,
        action: "Invoice matched",
        supplierName: order.supplier?.name ?? "Supplier",
        amount: invoiceAmount,
        posting: "Dr Goods received not invoiced, Cr Accounts payable"
      },
      ...current
    ]);
    setMessage(`${invoiceForm.invoiceNumber} matched to ${order.poNumber}. AP balance updated.`);
  }

  function payInvoice(orderId: string) {
    const order = enrichedOrders.find((entry) => entry.id === orderId);
    if (!order || order.status !== "INVOICED") {
      setMessage("Only matched supplier invoices can be paid.");
      return;
    }

    const amount = order.invoiceAmount ?? order.poTotal;
    setOrders((current) =>
      current.map((entry) => (entry.id === orderId ? { ...entry, status: "PAID" } : entry))
    );
    setEvents((current) => [
      {
        id: createLocalId("event"),
        reference: `PAY-${order.poNumber.slice(-4)}`,
        action: "Supplier paid",
        supplierName: order.supplier?.name ?? "Supplier",
        amount,
        posting: "Dr Accounts payable, Cr Bank"
      },
      ...current
    ]);
    setMessage(`${order.supplier?.name ?? "Supplier"} paid ${formatMoney(amount)}.`);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">Purchasing and AP Workspace</h3>
            <p className="text-sm text-muted-foreground">Create POs, receive goods, match invoices, and pay suppliers.</p>
          </div>
          <Button type="button" variant="secondary" onClick={loadData}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Load purchasing
          </Button>
        </div>

        <p className="rounded border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">{message}</p>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded border border-border bg-white p-4">
            <p className="text-sm text-muted-foreground">Approved POs</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{approvedCount}</p>
          </div>
          <div className="rounded border border-border bg-white p-4">
            <p className="text-sm text-muted-foreground">Received not invoiced</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatMoney(receivedNotInvoiced)}</p>
          </div>
          <div className="rounded border border-border bg-white p-4">
            <p className="text-sm text-muted-foreground">AP balance</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatMoney(apBalance)}</p>
          </div>
          <div className="rounded border border-border bg-white p-4">
            <p className="text-sm text-muted-foreground">Paid suppliers</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatMoney(paidTotal)}</p>
          </div>
        </div>

        <form onSubmit={createPurchaseOrder} className="rounded border border-border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">New Purchase Order</h4>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              aria-label="Supplier"
              className="h-10 rounded border border-border bg-white px-3 text-sm"
              value={poForm.supplierId}
              onChange={(event) => setPoForm({ ...poForm, supplierId: event.target.value })}
            >
              {activeSuppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Purchase item"
              className="h-10 rounded border border-border bg-white px-3 text-sm"
              value={poForm.itemId}
              onChange={(event) => {
                const item = activeItems.find((entry) => entry.id === event.target.value);
                setPoForm({
                  ...poForm,
                  itemId: event.target.value,
                  unitCost: item ? item.lastCost.toFixed(2) : poForm.unitCost
                });
              }}
            >
              {activeItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <Input
              aria-label="PO quantity"
              value={poForm.quantity}
              onChange={(event) => setPoForm({ ...poForm, quantity: event.target.value })}
              placeholder="Quantity"
            />
            <Input
              aria-label="PO unit cost"
              value={poForm.unitCost}
              onChange={(event) => setPoForm({ ...poForm, unitCost: event.target.value })}
              placeholder="Unit cost"
            />
          </div>
          <Button className="mt-3">
            <Send className="h-4 w-4" aria-hidden="true" />
            Create PO
          </Button>
        </form>

        <form onSubmit={matchInvoice} className="rounded border border-border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Match Supplier Invoice</h4>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              aria-label="Received purchase order"
              className="h-10 rounded border border-border bg-white px-3 text-sm"
              value={invoiceForm.orderId}
              onChange={(event) => {
                const order = enrichedOrders.find((entry) => entry.id === event.target.value);
                setInvoiceForm({
                  ...invoiceForm,
                  orderId: event.target.value,
                  invoiceAmount: order ? order.receivedTotal.toFixed(2) : invoiceForm.invoiceAmount
                });
              }}
            >
              <option value="">Select received PO</option>
              {enrichedOrders
                .filter((order) => order.status === "RECEIVED")
                .map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.poNumber} - {order.supplier?.name}
                  </option>
                ))}
            </select>
            <Input
              aria-label="Invoice number"
              value={invoiceForm.invoiceNumber}
              onChange={(event) => setInvoiceForm({ ...invoiceForm, invoiceNumber: event.target.value })}
              placeholder="Invoice number"
            />
            <Input
              aria-label="Invoice amount"
              value={invoiceForm.invoiceAmount}
              onChange={(event) => setInvoiceForm({ ...invoiceForm, invoiceAmount: event.target.value })}
              placeholder="Invoice amount"
            />
            <Input
              aria-label="Due date"
              type="date"
              value={invoiceForm.dueDate}
              onChange={(event) => setInvoiceForm({ ...invoiceForm, dueDate: event.target.value })}
            />
          </div>
          <Button className="mt-3" disabled={!invoiceForm.orderId}>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Post AP invoice
          </Button>
        </form>
      </div>

      <div className="space-y-4">
        <div className="overflow-hidden rounded border border-border bg-white">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Truck className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Purchase Orders</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">PO</th>
                  <th className="px-4 py-3 font-semibold">Supplier</th>
                  <th className="px-4 py-3 font-semibold">Item</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {enrichedOrders.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-muted-foreground" colSpan={6}>
                      No purchase orders loaded yet.
                    </td>
                  </tr>
                ) : (
                  enrichedOrders.map((order) => (
                    <tr key={order.id} className="border-t border-border">
                      <td className="px-4 py-3 font-semibold">{order.poNumber}</td>
                      <td className="px-4 py-3">
                        <p>{order.supplier?.name}</p>
                        <p className="text-xs text-muted-foreground">{order.supplier?.terms}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p>{order.item?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {order.quantity.toFixed(2)} {order.item?.unit} x {formatMoney(order.unitCost)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(order.poTotal)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(order.status)}>{order.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {order.status === "DRAFT" ? (
                          <Button type="button" variant="secondary" className="h-8 px-3" onClick={() => approveOrder(order.id)}>
                            Approve
                          </Button>
                        ) : order.status === "APPROVED" ? (
                          <Button type="button" variant="secondary" className="h-8 px-3" onClick={() => receiveOrder(order.id)}>
                            Receive
                          </Button>
                        ) : order.status === "INVOICED" ? (
                          <Button type="button" variant="secondary" className="h-8 px-3" onClick={() => payInvoice(order.id)}>
                            Pay
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">No action</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded border border-border bg-white">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <CreditCard className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">AP Posting Audit</h4>
          </div>
          <div className="divide-y divide-border">
            {events.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">No purchasing events posted yet.</div>
            ) : (
              events.slice(0, 6).map((event) => (
                <div key={event.id} className="px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{event.reference}</p>
                      <p className="text-muted-foreground">{event.action} - {event.supplierName}</p>
                    </div>
                    <span className="font-bold tabular-nums">{formatMoney(event.amount)}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{event.posting}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function statusTone(status: PurchaseOrderStatus) {
  if (status === "PAID") return "success";
  if (status === "INVOICED") return "primary";
  if (status === "RECEIVED") return "warning";
  return "neutral";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2
  }).format(value);
}

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
