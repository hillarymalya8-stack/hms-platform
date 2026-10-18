"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Calculator, CreditCard, Minus, Plus, ReceiptText, RefreshCcw, Send, Store, Trash2, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api-client";
import { readSession } from "@/lib/auth";

type PaymentMethod = "CASH" | "CARD" | "MOBILE_MONEY" | "BANK_TRANSFER" | "ROOM_CHARGE";
type PosOutletType = "RESTAURANT" | "BAR" | "ROOM_SERVICE" | "SPA" | "OTHER";

type DiningTable = {
  id: string;
  tableNumber: string;
  section: string | null;
  seats: number;
  status: "AVAILABLE" | "SEATED" | "ORDER_OPEN" | "OUT_OF_SERVICE";
};

type PosOutlet = {
  id: string;
  name: string;
  outletType: PosOutletType;
  terminals: Array<{ id: string; name: string; deviceIdentifier: string }>;
  tables: DiningTable[];
};

type CatalogItem = {
  productVariantId: string;
  price: string | number;
  taxRate: string | number;
  productVariant: {
    id: string;
    name: string;
    product: { name: string; category?: { name: string } | null };
  };
};

type MenuItem = {
  productVariantId: string;
  name: string;
  category: string;
  price: number;
  taxRate: number;
};

type CartLine = { item: MenuItem; quantity: number };

type PosOrder = {
  id: string;
  orderNumber: string;
  status: "OPEN" | "HELD" | "PAID" | "VOIDED" | "REFUNDED" | string;
  serviceType: string;
  grandTotal: string | number;
  createdAt: string;
  folioId?: string | null;
  outlet: { id: string; name: string; outletType: PosOutletType };
  table?: { id: string; tableNumber: string } | null;
  items: Array<{ id: string; quantity: string | number; totalAmount: string | number; productVariant: { product: { name: string } } }>;
  payments?: Array<{
    id: string;
    systemReceiptNumber: string;
    externalReceiptNumber?: string | null;
    paymentMethod: PaymentMethod;
    amount: string | number;
    status: string;
  }>;
};

const takeawayValue = "";

const paymentMethods: Array<{ label: string; value: PaymentMethod }> = [
  { label: "Cash", value: "CASH" },
  { label: "Card / Credit", value: "CARD" },
  { label: "Mobile Money", value: "MOBILE_MONEY" },
  { label: "Bank Transfer", value: "BANK_TRANSFER" },
  { label: "Room Charge", value: "ROOM_CHARGE" }
];

export function PosWorkspace() {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [outlets, setOutlets] = useState<PosOutlet[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState("");
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedTableId, setSelectedTableId] = useState(takeawayValue);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orders, setOrders] = useState<PosOrder[]>([]);
  const [payingOrderId, setPayingOrderId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [externalReceiptNumber, setExternalReceiptNumber] = useState("");
  const [message, setMessage] = useState("Loading POS outlets...");
  const [busy, setBusy] = useState(false);

  const canCreate = permissions.includes("pos.orders.create");
  const canPay = permissions.includes("pos.orders.pay");
  const selectedOutlet = outlets.find((outlet) => outlet.id === selectedOutletId);
  const selectedTable = selectedOutlet?.tables.find((table) => table.id === selectedTableId);
  const categories = useMemo(() => ["All", ...Array.from(new Set(menu.map((item) => item.category))).sort()], [menu]);
  const visibleMenu = activeCategory === "All" ? menu : menu.filter((item) => item.category === activeCategory);
  const subtotal = cart.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const taxTotal = cart.reduce((sum, line) => sum + line.item.price * line.quantity * line.item.taxRate, 0);
  const outletOrders = orders.filter((order) => !selectedOutletId || order.outlet.id === selectedOutletId);
  const openOrders = outletOrders.filter((order) => order.status === "OPEN" || order.status === "HELD");
  const paidOrders = outletOrders.filter((order) => order.status === "PAID");
  const payingOrder = orders.find((order) => order.id === payingOrderId);
  const payingBalance = payingOrder ? orderBalance(payingOrder) : 0;
  const referenceRequired = ["CARD", "MOBILE_MONEY", "BANK_TRANSFER"].includes(paymentMethod);

  useEffect(() => {
    setPermissions(readSession()?.user.permissions ?? []);
    void loadOutlets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadOutlets(preferredOutletId?: string) {
    setBusy(true);
    const [outletResult, orderResult] = await Promise.all([
      apiRequest<PosOutlet[]>("/pos/outlets"),
      apiRequest<PosOrder[]>("/pos/orders")
    ]);
    setBusy(false);

    if (!outletResult.ok) {
      setOutlets([]);
      setMessage(outletResult.error);
      return;
    }

    setOutlets(outletResult.data);
    if (orderResult.ok) setOrders(orderResult.data);

    if (outletResult.data.length === 0) {
      setSelectedOutletId("");
      setMenu([]);
      setMessage("No POS outlets are available to you. Ask an administrator for outlet access.");
      return;
    }

    const nextOutlet =
      outletResult.data.find((outlet) => outlet.id === (preferredOutletId ?? selectedOutletId)) ?? outletResult.data[0];
    await selectOutlet(nextOutlet.id, outletResult.data);
  }

  async function selectOutlet(outletId: string, outletList = outlets) {
    const outlet = outletList.find((entry) => entry.id === outletId);
    setSelectedOutletId(outletId);
    setSelectedTableId(takeawayValue);
    setCart([]);
    setActiveCategory("All");
    if (!outlet) return;

    const catalogResult = await apiRequest<CatalogItem[]>(`/pos/outlets/${outlet.id}/catalog`);
    if (!catalogResult.ok) {
      setMenu([]);
      setMessage(catalogResult.error);
      return;
    }

    const items = catalogResult.data.map(mapCatalogItem);
    setMenu(items);
    setMessage(
      items.length
        ? `${outlet.name}: ${items.length} menu item${items.length === 1 ? "" : "s"} loaded.`
        : `${outlet.name} has no menu items yet. Add products in Administration > Menu & prices.`
    );
  }

  async function loadOrders() {
    const result = await apiRequest<PosOrder[]>("/pos/orders");
    if (result.ok) setOrders(result.data);
    else setMessage(result.error);
  }

  function addItem(item: MenuItem) {
    setCart((current) => {
      const existing = current.find((line) => line.item.productVariantId === item.productVariantId);
      if (existing) {
        return current.map((line) =>
          line.item.productVariantId === item.productVariantId ? { ...line, quantity: line.quantity + 1 } : line
        );
      }
      return [...current, { item, quantity: 1 }];
    });
  }

  function updateQuantity(productVariantId: string, delta: number) {
    setCart((current) =>
      current
        .map((line) => (line.item.productVariantId === productVariantId ? { ...line, quantity: line.quantity + delta } : line))
        .filter((line) => line.quantity > 0)
    );
  }

  async function sendOrder() {
    if (!selectedOutlet || cart.length === 0) {
      setMessage("Add at least one item before sending the order.");
      return;
    }

    setBusy(true);
    const result = await apiRequest<PosOrder>("/pos/orders", {
      method: "POST",
      body: JSON.stringify({
        outletId: selectedOutlet.id,
        terminalId: selectedOutlet.terminals[0]?.id,
        tableId: selectedTable?.id,
        serviceType: selectedOutlet.outletType === "BAR" ? "BAR" : selectedTable ? "DINE_IN" : "TAKEAWAY",
        idempotencyKey: createLocalId("pos-order"),
        items: cart.map((line) => ({ productVariantId: line.item.productVariantId, quantity: String(line.quantity) }))
      })
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setCart([]);
    setMessage(`${result.data.orderNumber} sent${selectedTable ? ` for table ${selectedTable.tableNumber}` : ""}. Total ${formatMoney(Number(result.data.grandTotal))}.`);
    if (canPay) startPayment(result.data.id);
    await loadOutlets(selectedOutlet.id);
  }

  function startPayment(orderId: string) {
    setPayingOrderId(orderId);
    setPaymentMethod("CASH");
    setExternalReceiptNumber("");
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payingOrder) return;

    if (referenceRequired && !externalReceiptNumber.trim()) {
      setMessage("This payment method requires a receipt ID or transaction reference.");
      return;
    }
    if (paymentMethod === "ROOM_CHARGE" && !payingOrder.folioId) {
      setMessage("This check is not linked to a room folio. Use the POS terminal to charge a room.");
      return;
    }

    setBusy(true);
    const result = await apiRequest<PosOrder>(`/pos/orders/${payingOrder.id}/payments`, {
      method: "POST",
      body: JSON.stringify({
        paymentMethod,
        amount: payingBalance.toFixed(2),
        externalReceiptNumber: externalReceiptNumber.trim() || undefined,
        idempotencyKey: createLocalId("pos-payment")
      })
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    const payments = result.data.payments ?? [];
    const receipt = payments[payments.length - 1]?.systemReceiptNumber;
    setPayingOrderId("");
    setExternalReceiptNumber("");
    setMessage(`${result.data.orderNumber} paid${receipt ? `. System receipt ${receipt}` : ""}.`);
    await loadOutlets(selectedOutletId);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">Outlet POS</h3>
            <p className="text-sm text-muted-foreground">Table orders, open checks, and payments against the live hotel database.</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => void loadOutlets()} disabled={busy}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        </div>

        <p className="rounded border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground" aria-live="polite">
          {message}
        </p>

        <div className="rounded border border-border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Store className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Outlet and Table</h4>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
            <select
              aria-label="POS outlet"
              className="h-10 rounded border border-border bg-white px-3 text-sm"
              value={selectedOutletId}
              onChange={(event) => void selectOutlet(event.target.value)}
              disabled={outlets.length === 0}
            >
              {outlets.length === 0 ? <option value="">No outlets</option> : null}
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Dining table"
              className="h-10 rounded border border-border bg-white px-3 text-sm"
              value={selectedTableId}
              onChange={(event) => setSelectedTableId(event.target.value)}
              disabled={!selectedOutlet}
            >
              <option value={takeawayValue}>{selectedOutlet?.outletType === "BAR" ? "Bar counter" : "Takeaway / no table"}</option>
              {selectedOutlet?.tables.map((table) => (
                <option key={table.id} value={table.id} disabled={table.status === "OUT_OF_SERVICE"}>
                  Table {table.tableNumber}
                  {table.section ? ` (${table.section})` : ""} - {table.status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <Badge tone={selectedTable?.status === "ORDER_OPEN" ? "warning" : "success"}>
              {selectedTable?.status.replaceAll("_", " ") ?? "READY"}
            </Badge>
          </div>
          {selectedOutlet && selectedOutlet.tables.length === 0 && selectedOutlet.outletType !== "BAR" ? (
            <p className="mt-2 text-xs text-muted-foreground">No dining tables set up for this outlet. Add them in Administration &gt; Menu &amp; prices.</p>
          ) : null}
        </div>

        {categories.length > 2 ? (
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Button
                key={category}
                type="button"
                variant={category === activeCategory ? "primary" : "secondary"}
                className="h-8 px-3"
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </Button>
            ))}
          </div>
        ) : null}

        {visibleMenu.length === 0 ? (
          <div className="rounded border border-dashed border-border bg-white px-4 py-10 text-center text-sm text-muted-foreground">
            {selectedOutlet ? "No menu items are available at this outlet." : "Choose an outlet to see its menu."}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleMenu.map((item) => (
              <button
                key={item.productVariantId}
                type="button"
                className="rounded border border-border bg-white p-4 text-left transition-colors hover:border-primary hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => addItem(item)}
                disabled={!canCreate}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">{item.name}</span>
                  <Utensils className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                </div>
                <p className="text-xs text-muted-foreground">{item.category}</p>
                <p className="mt-2 font-bold tabular-nums">{formatMoney(item.price)}</p>
              </button>
            ))}
          </div>
        )}

        <div className="rounded border border-border bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-primary" aria-hidden="true" />
              <h4 className="font-bold">Open Checks</h4>
            </div>
            <Badge tone={openOrders.length ? "warning" : "neutral"}>{openOrders.length} open</Badge>
          </div>
          <div className="divide-y divide-border">
            {openOrders.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No open checks at this outlet.</p>
            ) : (
              openOrders.map((order) => (
                <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="font-bold">{order.orderNumber}</p>
                    <p className="text-muted-foreground">
                      {order.table ? `Table ${order.table.tableNumber}` : order.serviceType.replaceAll("_", " ")} ·{" "}
                      {order.items.map((item) => `${Number(item.quantity)}x ${item.productVariant.product.name}`).join(", ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold tabular-nums">{formatMoney(orderBalance(order))}</span>
                    {canPay ? (
                      <Button type="button" variant="secondary" className="h-8 px-3" onClick={() => startPayment(order.id)}>
                        <CreditCard className="h-4 w-4" aria-hidden="true" />
                        Pay
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded border border-border bg-white">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-primary" aria-hidden="true" />
              <h3 className="font-bold">New Order</h3>
            </div>
          </div>
          <div className="min-h-[160px] divide-y divide-border">
            {cart.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">
                {canCreate ? "No items added yet." : "You can view this outlet but not create orders."}
              </div>
            ) : (
              cart.map((line) => (
                <div key={line.item.productVariantId} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-semibold">{line.item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {line.quantity} x {formatMoney(line.item.price)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="secondary" className="h-8 px-2" onClick={() => updateQuantity(line.item.productVariantId, -1)} aria-label={`Remove one ${line.item.name}`}>
                      <Minus className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="secondary" className="h-8 px-2" onClick={() => updateQuantity(line.item.productVariantId, 1)} aria-label={`Add one ${line.item.name}`}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="space-y-2 border-t border-border p-4 text-sm">
            <Row label="Subtotal" value={formatMoney(subtotal)} />
            <Row label="Tax" value={formatMoney(taxTotal)} />
            <div className="flex justify-between gap-3 border-t border-border pt-2 text-base">
              <span className="font-bold">Total</span>
              <span className="font-bold tabular-nums">{formatMoney(subtotal + taxTotal)}</span>
            </div>
            <div className="grid gap-2 pt-2 sm:grid-cols-2">
              <Button type="button" onClick={() => void sendOrder()} disabled={busy || cart.length === 0 || !canCreate}>
                <Send className="h-4 w-4" aria-hidden="true" />
                Send order
              </Button>
              <Button type="button" variant="secondary" onClick={() => setCart([])} disabled={cart.length === 0}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Clear
              </Button>
            </div>
          </div>
        </div>

        {payingOrder ? (
          <form onSubmit={submitPayment} className="rounded border border-primary bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h4 className="font-bold">Pay {payingOrder.orderNumber}</h4>
              <span className="font-bold tabular-nums">{formatMoney(payingBalance)}</span>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Payment method</span>
              <select
                className="h-10 w-full rounded border border-border bg-white px-3 text-sm"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
              >
                {paymentMethods
                  .filter((method) => method.value !== "ROOM_CHARGE" || Boolean(payingOrder.folioId))
                  .map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
            </label>
            {!payingOrder.folioId ? (
              <p className="mt-2 text-xs text-muted-foreground">Room charges are linked to a guest folio from the POS terminal.</p>
            ) : null}
            <label className="mt-3 block space-y-1.5">
              <span className="text-sm font-medium">Receipt ID / transaction reference</span>
              <Input
                value={externalReceiptNumber}
                onChange={(event) => setExternalReceiptNumber(event.target.value)}
                placeholder={referenceRequired ? "Required for this method" : "Optional"}
              />
            </label>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button disabled={busy || payingBalance <= 0}>
                <CreditCard className="h-4 w-4" aria-hidden="true" />
                Take payment
              </Button>
              <Button type="button" variant="secondary" onClick={() => setPayingOrderId("")}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        <div className="rounded border border-border bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" aria-hidden="true" />
              <h4 className="font-bold">Paid Sales</h4>
            </div>
            <Button type="button" variant="ghost" className="h-8 px-2" onClick={() => void loadOrders()} aria-label="Reload orders">
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <div className="space-y-2">
            {paidOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No paid orders yet.</p>
            ) : (
              paidOrders.slice(0, 6).map((order) => {
                const payment = order.payments?.[order.payments.length - 1];
                return (
                  <div key={order.id} className="rounded border border-border bg-background/70 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold">{order.orderNumber}</p>
                        <p className="text-muted-foreground">
                          {order.table ? `Table ${order.table.tableNumber}` : order.serviceType.replaceAll("_", " ")}
                          {payment ? ` · ${payment.paymentMethod.replaceAll("_", " ")}` : ""}
                        </p>
                      </div>
                      <span className="font-bold tabular-nums">{formatMoney(Number(order.grandTotal))}</span>
                    </div>
                    {payment ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {payment.systemReceiptNumber}
                        {payment.externalReceiptNumber ? ` · External ${payment.externalReceiptNumber}` : ""} · {formatDateTime(order.createdAt)}
                      </p>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function mapCatalogItem(item: CatalogItem): MenuItem {
  const productName = item.productVariant.product.name;
  const variantName = item.productVariant.name;
  const isDefaultVariant = !variantName || ["regular", "standard", "default"].includes(variantName.toLowerCase());
  return {
    productVariantId: item.productVariantId,
    name: isDefaultVariant ? productName : `${productName} ${variantName}`,
    category: item.productVariant.product.category?.name ?? "Other",
    price: Number(item.price),
    taxRate: Number(item.taxRate)
  };
}

function orderBalance(order: PosOrder) {
  const paid = (order.payments ?? [])
    .filter((payment) => payment.status === "COMPLETED")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  return Math.max(0, Math.round((Number(order.grandTotal) - paid) * 100) / 100);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
