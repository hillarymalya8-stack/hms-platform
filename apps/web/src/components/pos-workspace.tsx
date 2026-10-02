"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Calculator,
  CreditCard,
  Minus,
  Plus,
  ReceiptText,
  RefreshCcw,
  Store,
  Trash2,
  Utensils
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PaymentMethod = "CASH" | "CARD" | "MOBILE_MONEY" | "BANK_TRANSFER" | "ROOM_CHARGE";

type PosProduct = {
  id: string;
  name: string;
  category: string;
  price: number;
  taxRate: number;
};

type PosTable = {
  id: string;
  label: string;
  status: "AVAILABLE" | "SEATED" | "ORDER_OPEN";
};

type CartLine = {
  product: PosProduct;
  quantity: number;
};

type PaidOrder = {
  id: string;
  orderNumber: string;
  tableLabel: string;
  paymentMethod: PaymentMethod;
  systemReceiptNumber: string;
  externalReceiptNumber?: string;
  total: number;
  createdAt: string;
};

const demoProducts: PosProduct[] = [
  { id: "prod-breakfast", name: "Full Breakfast", category: "Kitchen", price: 18, taxRate: 0.16 },
  { id: "prod-chicken", name: "Grilled Chicken", category: "Kitchen", price: 24, taxRate: 0.16 },
  { id: "prod-coffee", name: "House Coffee", category: "Bar", price: 4, taxRate: 0.16 },
  { id: "prod-juice", name: "Fresh Juice", category: "Bar", price: 6, taxRate: 0.16 },
  { id: "prod-water", name: "Mineral Water", category: "Bar", price: 2.5, taxRate: 0.16 },
  { id: "prod-room-service", name: "Room Service Tray", category: "Service", price: 8, taxRate: 0.16 }
];

const initialTables: PosTable[] = [
  { id: "tbl-1", label: "Table 1", status: "AVAILABLE" },
  { id: "tbl-2", label: "Table 2", status: "SEATED" },
  { id: "tbl-3", label: "Table 3", status: "AVAILABLE" },
  { id: "takeaway", label: "Takeaway", status: "AVAILABLE" }
];

const paymentMethods: Array<{ label: string; value: PaymentMethod }> = [
  { label: "Cash", value: "CASH" },
  { label: "Card / Credit", value: "CARD" },
  { label: "Mobile Money", value: "MOBILE_MONEY" },
  { label: "Bank Transfer", value: "BANK_TRANSFER" },
  { label: "Room Charge", value: "ROOM_CHARGE" }
];

export function PosWorkspace() {
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [tables, setTables] = useState<PosTable[]>([]);
  const [selectedTableId, setSelectedTableId] = useState("takeaway");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [externalReceiptNumber, setExternalReceiptNumber] = useState("");
  const [orders, setOrders] = useState<PaidOrder[]>([]);
  const [message, setMessage] = useState("Load POS data to start a restaurant sale.");

  const selectedTable = useMemo(
    () => tables.find((table) => table.id === selectedTableId) ?? tables[0],
    [selectedTableId, tables]
  );

  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0),
    [cart]
  );
  const taxTotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.product.price * line.quantity * line.product.taxRate, 0),
    [cart]
  );
  const grandTotal = subtotal + taxTotal;
  const referenceRequired = ["CARD", "MOBILE_MONEY", "BANK_TRANSFER"].includes(paymentMethod);

  function loadData() {
    setProducts([...demoProducts]);
    setTables(initialTables.map((table) => ({ ...table })));
    setSelectedTableId("takeaway");
    setMessage("POS catalog, tables, and payment policies loaded.");
  }

  function addProduct(product: PosProduct) {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        return current.map((line) =>
          line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line
        );
      }

      return [...current, { product, quantity: 1 }];
    });
    setMessage(`${product.name} added to the order.`);
  }

  function updateQuantity(productId: string, direction: "up" | "down") {
    setCart((current) =>
      current
        .map((line) =>
          line.product.id === productId
            ? { ...line, quantity: direction === "up" ? line.quantity + 1 : line.quantity - 1 }
            : line
        )
        .filter((line) => line.quantity > 0)
    );
  }

  function clearOrder() {
    setCart([]);
    setExternalReceiptNumber("");
    setMessage("Current order cleared.");
  }

  function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (cart.length === 0) {
      setMessage("Add at least one item before taking payment.");
      return;
    }

    if (referenceRequired && !externalReceiptNumber.trim()) {
      setMessage("This payment method requires a receipt ID or transaction reference.");
      return;
    }

    if (
      externalReceiptNumber.trim() &&
      orders.some(
        (order) =>
          order.paymentMethod === paymentMethod &&
          order.externalReceiptNumber?.toLowerCase() === externalReceiptNumber.trim().toLowerCase()
      )
    ) {
      setMessage("That external receipt ID was already used for this payment method.");
      return;
    }

    const orderNumber = `POS-2026-${String(orders.length + 1).padStart(5, "0")}`;
    const receiptNumber = `RCT-2026-${String(orders.length + 1).padStart(5, "0")}`;
    const paidOrder: PaidOrder = {
      id: createLocalId("paid-order"),
      orderNumber,
      tableLabel: selectedTable?.label ?? "Takeaway",
      paymentMethod,
      systemReceiptNumber: receiptNumber,
      externalReceiptNumber: externalReceiptNumber.trim() || undefined,
      total: grandTotal,
      createdAt: new Date().toISOString()
    };

    setOrders((current) => [paidOrder, ...current]);
    if (selectedTable) {
      setTables((current) =>
        current.map((table) => (table.id === selectedTable.id ? { ...table, status: "AVAILABLE" } : table))
      );
    }
    setCart([]);
    setExternalReceiptNumber("");
    setMessage(`${orderNumber} paid. System receipt ${receiptNumber} posted to POS revenue and tax.`);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">Restaurant POS Work Surface</h3>
            <p className="text-sm text-muted-foreground">Create an order, enforce receipt IDs, and post paid sales.</p>
          </div>
          <Button type="button" variant="secondary" onClick={loadData}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Load POS data
          </Button>
        </div>

        <p className="rounded border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">{message}</p>

        <div className="rounded border border-border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Store className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Outlet and Table</h4>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
            <select
              aria-label="POS outlet"
              className="h-10 rounded border border-border bg-white px-3 text-sm"
              value="restaurant"
              onChange={() => undefined}
            >
              <option value="restaurant">Main Restaurant</option>
            </select>
            <select
              aria-label="Dining table"
              className="h-10 rounded border border-border bg-white px-3 text-sm"
              value={selectedTableId}
              onChange={(event) => setSelectedTableId(event.target.value)}
            >
              {tables.length === 0 ? <option value="takeaway">Takeaway</option> : null}
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.label} - {table.status.replace("_", " ")}
                </option>
              ))}
            </select>
            <Badge tone={selectedTable?.status === "ORDER_OPEN" ? "warning" : "success"}>
              {selectedTable?.status.replace("_", " ") ?? "READY"}
            </Badge>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(products.length ? products : demoProducts).map((product) => (
            <button
              key={product.id}
              type="button"
              className="rounded border border-border bg-white p-4 text-left transition-colors hover:border-primary hover:bg-background"
              onClick={() => addProduct(product)}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{product.name}</span>
                <Utensils className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              </div>
              <p className="text-xs text-muted-foreground">{product.category}</p>
              <p className="mt-2 font-bold tabular-nums">{formatMoney(product.price)}</p>
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={submitPayment} className="rounded border border-border bg-white">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-primary" aria-hidden="true" />
            <h3 className="font-bold">Current Order</h3>
          </div>
        </div>

        <div className="min-h-[220px] divide-y divide-border">
          {cart.length === 0 ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">No items added yet.</div>
          ) : (
            cart.map((line) => (
              <div key={line.product.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{line.product.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {line.quantity} x {formatMoney(line.product.price)}
                    </p>
                  </div>
                  <p className="font-bold tabular-nums">{formatMoney(line.product.price * line.quantity)}</p>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button type="button" variant="secondary" className="h-8 px-2" onClick={() => updateQuantity(line.product.id, "down")}>
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="secondary" className="h-8 px-2" onClick={() => updateQuantity(line.product.id, "up")}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border p-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-semibold tabular-nums">{formatMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-semibold tabular-nums">{formatMoney(taxTotal)}</span>
            </div>
            <div className="flex justify-between gap-3 border-t border-border pt-2 text-base">
              <span className="font-bold">Total</span>
              <span className="font-bold tabular-nums">{formatMoney(grandTotal)}</span>
            </div>
          </div>

          <label className="mt-4 block space-y-1.5">
            <span className="text-sm font-medium">Payment method</span>
            <select
              className="h-10 w-full rounded border border-border bg-white px-3 text-sm"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
            >
              {paymentMethods.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block space-y-1.5">
            <span className="text-sm font-medium">Receipt ID / transaction reference</span>
            <Input
              value={externalReceiptNumber}
              onChange={(event) => setExternalReceiptNumber(event.target.value)}
              placeholder={referenceRequired ? "Required for this method" : "Optional"}
            />
          </label>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <Button disabled={cart.length === 0}>
              <CreditCard className="h-4 w-4" aria-hidden="true" />
              Take payment
            </Button>
            <Button type="button" variant="secondary" onClick={clearOrder}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Clear
            </Button>
          </div>
        </div>

        <div className="border-t border-border p-4">
          <div className="mb-3 flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Paid Sales</h4>
          </div>
          <div className="space-y-2">
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No paid orders yet.</p>
            ) : (
              orders.slice(0, 4).map((order) => (
                <div key={order.id} className="rounded border border-border bg-background/70 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{order.orderNumber}</p>
                      <p className="text-muted-foreground">{order.tableLabel} · {order.paymentMethod.replace("_", " ")}</p>
                    </div>
                    <span className="font-bold tabular-nums">{formatMoney(order.total)}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {order.systemReceiptNumber}
                    {order.externalReceiptNumber ? ` · External ${order.externalReceiptNumber}` : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </form>
    </div>
  );
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
