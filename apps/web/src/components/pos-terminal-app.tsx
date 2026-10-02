"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  BellRing,
  CheckCircle2,
  CreditCard,
  LockKeyhole,
  Minus,
  Plus,
  Printer,
  RefreshCcw,
  ShieldCheck,
  Store,
  Trash2,
  Wifi,
  WifiOff,
  type LucideIcon
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api-client";
import { getApiBaseUrl, isDemoAuthEnabled, loginWithDemoCredentials, readSession, saveSession, type LoginResponse } from "@/lib/auth";
import {
  enqueueOfflineSale,
  onOfflineQueueChanged,
  readCachedPosCatalog,
  readOfflineSales,
  saveCachedPosCatalog,
  syncQueuedOfflineSales
} from "@/lib/offline-pos";

type PaymentMethod = "CASH" | "CARD" | "MOBILE_MONEY" | "BANK_TRANSFER" | "ROOM_CHARGE";
type TerminalMode = "offline" | "live";
type PrepStation = "Restaurant Kitchen" | "Bar Printer" | "Service Desk";
type PosOutletType = "RESTAURANT" | "BAR" | "ROOM_SERVICE" | "SPA" | "OTHER";

type TerminalProduct = {
  id: string;
  productVariantId: string;
  name: string;
  category: string;
  price: number;
  taxRate: number;
};

type TicketLine = {
  product: TerminalProduct;
  quantity: number;
};

type PaidReceipt = {
  id: string;
  receiptNumber: string;
  paymentMethod: PaymentMethod;
  total: number;
  offline?: boolean;
  syncStatus?: string;
  lines: Array<{
    name: string;
    quantity: number;
    amount: number;
  }>;
  createdAt: string;
};

type PrepTicket = {
  id: string;
  ticketNumber: string;
  station: PrepStation;
  lines: Array<{
    name: string;
    quantity: number;
  }>;
  status: "SENT" | "PRINTED";
  createdAt: string;
};

type PosTerminal = {
  id: string;
  name: string;
  deviceIdentifier: string;
  syncStatus: string;
};

type PosOutlet = {
  id: string;
  name: string;
  outletType: PosOutletType;
  terminals: PosTerminal[];
};

type CatalogItem = {
  productVariantId: string;
  price: string | number;
  taxRate: string | number;
  productVariant: {
    id: string;
    name: string;
    product: {
      name: string;
      category?: {
        name: string;
      } | null;
    };
  };
};

type PosPayment = {
  id: string;
  systemReceiptNumber: string;
  paymentMethod: PaymentMethod;
  amount: string | number;
  createdAt: string;
};

type PosOrderResponse = {
  id: string;
  orderNumber: string;
  grandTotal: string | number;
  payments?: PosPayment[];
};

type ChargeableRoom = {
  roomId: string;
  roomNumber: string;
  roomType: string;
  reservationId: string;
  reservationNumber: string;
  guest: {
    id: string;
    firstName: string;
    lastName: string;
  };
  folio: {
    id: string;
    folioNumber: string;
    balance: string;
  };
};

const defaultCashierEmail = "cashier@hotel.local";
const preferredOutletKey = "hms_pos_preferred_outlet";
const preferredTerminalKey = "hms_pos_preferred_terminal";

const paymentMethods: Array<{ label: string; value: PaymentMethod; icon: LucideIcon }> = [
  { label: "Cash", value: "CASH", icon: Banknote },
  { label: "Card", value: "CARD", icon: CreditCard },
  { label: "Mobile", value: "MOBILE_MONEY", icon: CreditCard },
  { label: "Bank", value: "BANK_TRANSFER", icon: CreditCard },
  { label: "Room", value: "ROOM_CHARGE", icon: Store }
];

const prepStations: Array<{ name: PrepStation | "Receipt Printer"; detail: string }> = [
  { name: "Receipt Printer", detail: "Customer receipts" },
  { name: "Restaurant Kitchen", detail: "Food tickets" },
  { name: "Bar Printer", detail: "Drink tickets" },
  { name: "Service Desk", detail: "Service requests" }
];

export function PosTerminalApp() {
  const apiUrl = useMemo(() => getApiBaseUrl(), []);
  const demoMode = useMemo(() => isDemoAuthEnabled(), []);
  const [activeCategory, setActiveCategory] = useState("Food");
  const [products, setProducts] = useState<TerminalProduct[]>([]);
  const [outlets, setOutlets] = useState<PosOutlet[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState("");
  const [selectedTerminalId, setSelectedTerminalId] = useState("");
  const [terminalMode, setTerminalMode] = useState<TerminalMode>("offline");
  const [ticket, setTicket] = useState<TicketLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [externalReference, setExternalReference] = useState("");
  const [receipts, setReceipts] = useState<PaidReceipt[]>([]);
  const [prepTickets, setPrepTickets] = useState<PrepTicket[]>([]);
  const [prepSent, setPrepSent] = useState(false);
  const [chargeableRooms, setChargeableRooms] = useState<ChargeableRoom[]>([]);
  const [selectedFolioId, setSelectedFolioId] = useState("");
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [message, setMessage] = useState("Cashier terminal ready. Sign in to post sales to the shared hotel database.");
  const [busy, setBusy] = useState(false);
  const [syncingOffline, setSyncingOffline] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [email, setEmail] = useState(defaultCashierEmail);
  const [password, setPassword] = useState("");

  const selectedOutlet = useMemo(
    () => outlets.find((outlet) => outlet.id === selectedOutletId) ?? outlets[0],
    [outlets, selectedOutletId]
  );
  const selectedTerminal = useMemo(
    () => selectedOutlet?.terminals.find((terminal) => terminal.id === selectedTerminalId) ?? selectedOutlet?.terminals[0],
    [selectedOutlet, selectedTerminalId]
  );
  const selectedChargeableRoom = useMemo(
    () => chargeableRooms.find((room) => room.folio.id === selectedFolioId) ?? null,
    [chargeableRooms, selectedFolioId]
  );
  const categories = useMemo(() => Array.from(new Set(products.map((product) => product.category))), [products]);
  const visibleProducts = products.filter((product) => product.category === activeCategory);
  const subtotal = useMemo(
    () => ticket.reduce((sum, line) => sum + line.product.price * line.quantity, 0),
    [ticket]
  );
  const tax = useMemo(
    () => ticket.reduce((sum, line) => sum + line.product.price * line.quantity * line.product.taxRate, 0),
    [ticket]
  );
  const total = subtotal + tax;
  const referenceRequired = ["CARD", "MOBILE_MONEY", "BANK_TRANSFER"].includes(paymentMethod);
  const roomChargeSelected = paymentMethod === "ROOM_CHARGE";
  const terminalLabel = selectedTerminal?.deviceIdentifier ?? "REST-POS-01";

  useEffect(() => {
    if (categories.length > 0 && !categories.includes(activeCategory)) {
      setActiveCategory(categories[0]);
    }
  }, [activeCategory, categories]);

  useEffect(() => {
    setOfflineQueueCount(countPendingOfflineSales());
    return onOfflineQueueChanged(() => setOfflineQueueCount(countPendingOfflineSales()));
  }, []);

  useEffect(() => {
    const session = readSession();
    if (!session) {
      loadCachedCatalog("No online cashier session found.");
      return;
    }

    setEmail(session.user.email);

    if (!session.user.permissions.includes("pos.view")) {
      setTerminalMode("offline");
      loadCachedCatalog("This credential is not allowed to open the POS terminal.");
      setMessage("This credential is not allowed to open the POS terminal.");
      return;
    }

    void syncCatalog();
  }, []);

  async function signInCashier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("Opening cashier session...");

    if (demoMode) {
      const result = loginWithDemoCredentials(email, password);

      if (!result) {
        setMessage("Cashier login was rejected.");
        setBusy(false);
        return;
      }

      if (!result.user.permissions.includes("pos.view")) {
        setTerminalMode("offline");
        setProducts([]);
        setMessage("This credential is not allowed to open the POS terminal.");
        setBusy(false);
        return;
      }

      saveSession(result);
      setTerminalMode("offline");
      loadCachedCatalog(`Signed in as ${result.user.fullName}. Netlify demo mode is offline-only.`);
      setBusy(false);
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        setMessage("Cashier login was rejected.");
        setBusy(false);
        return;
      }

      const result = (await response.json()) as LoginResponse;
      if (!result.user.permissions.includes("pos.view")) {
        setTerminalMode("offline");
        setProducts([]);
        setMessage("This credential is not allowed to open the POS terminal.");
        setBusy(false);
        return;
      }

      saveSession(result);
      setMessage(`Signed in as ${result.user.fullName}. Loading POS catalog...`);
      await syncCatalog();
    } catch {
      setTerminalMode("offline");
      loadCachedCatalog("API or database is offline.");
    } finally {
      setBusy(false);
    }
  }

  async function syncCatalog(preferredOutletId?: string, preferredTerminalId?: string) {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("hms_access_token") : null;

    if (!token) {
      loadCachedCatalog("Cashier sign-in is required before syncing with the shared database.");
      return;
    }

    setBusy(true);
    setMessage("Syncing menu from shared hotel database...");

    const outletResult = await apiRequest<PosOutlet[]>("/pos/outlets");
    if (!outletResult.ok) {
      loadCachedCatalog(outletResult.error);
      setBusy(false);
      return;
    }

    const storedOutletId = readPreferredOutletId();
    const nextOutlet =
      outletResult.data.find((outlet) => outlet.id === preferredOutletId) ??
      outletResult.data.find((outlet) => outlet.id === selectedOutletId) ??
      outletResult.data.find((outlet) => outlet.id === storedOutletId) ??
      outletResult.data.find((outlet) => outlet.outletType === "RESTAURANT") ??
      outletResult.data[0];
    if (!nextOutlet) {
      setTerminalMode("offline");
      setProducts([]);
      setMessage("No active POS outlet was found for this property.");
      setBusy(false);
      return;
    }

    const catalogResult = await apiRequest<CatalogItem[]>(`/pos/outlets/${nextOutlet.id}/catalog`);
    if (!catalogResult.ok) {
      loadCachedCatalog(catalogResult.error);
      setBusy(false);
      return;
    }

    const liveProducts = catalogResult.data.map(mapCatalogItem);
    const storedTerminalId = readPreferredTerminalId();
    const nextTerminalId =
      nextOutlet.terminals.find((terminal) => terminal.id === preferredTerminalId)?.id ??
      nextOutlet.terminals.find((terminal) => terminal.id === selectedTerminalId)?.id ??
      nextOutlet.terminals.find((terminal) => terminal.id === storedTerminalId)?.id ??
      nextOutlet.terminals[0]?.id ??
      "";

    setOutlets(outletResult.data);
    setSelectedOutletId(nextOutlet.id);
    setSelectedTerminalId(nextTerminalId);
    setProducts(liveProducts);
    setTerminalMode("live");
    rememberPosAssignment(nextOutlet.id, nextTerminalId);
    saveCachedPosCatalog({
      outlets: outletResult.data,
      selectedOutletId: nextOutlet.id,
      selectedTerminalId: nextTerminalId,
      products: liveProducts,
      cachedAt: new Date().toISOString()
    });
    setMessage(
      liveProducts.length > 0
        ? `Live ${formatOutletType(nextOutlet.outletType)} catalog synced from ${nextOutlet.name}.`
        : `No menu items are configured for ${nextOutlet.name}.`
    );
    void loadChargeableRooms(false);
    setBusy(false);
  }

  async function loadChargeableRooms(showStatus = true) {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("hms_access_token") : null;
    if (!token) return;

    setLoadingRooms(true);
    const result = await apiRequest<ChargeableRoom[]>("/pos/chargeable-rooms");
    setLoadingRooms(false);

    if (!result.ok) {
      if (showStatus) setMessage(result.error);
      return;
    }

    setChargeableRooms(result.data);
    setSelectedFolioId((current) => (result.data.some((room) => room.folio.id === current) ? current : ""));

    if (showStatus) {
      setMessage(
        result.data.length
          ? `${result.data.length} occupied rooms ready for room charge.`
          : "No occupied rooms with open folios are available for room charge."
      );
    }
  }

  function loadCachedCatalog(reason: string) {
    const cached = readCachedPosCatalog();
    setTerminalMode("offline");

    if (!cached || cached.products.length === 0) {
      setProducts([]);
      setOutlets([]);
      setMessage(`${reason} No cached menu is available on this machine yet.`);
      return false;
    }

    setOutlets(cached.outlets);
    setSelectedOutletId(cached.selectedOutletId);
    setSelectedTerminalId(cached.selectedTerminalId);
    setProducts(cached.products);
    rememberPosAssignment(cached.selectedOutletId, cached.selectedTerminalId);
    setMessage(`${reason} Offline mode is using the cached menu from ${formatDateTime(cached.cachedAt)}.`);
    return true;
  }

  async function changeOutlet(outletId: string) {
    if (!outletId || outletId === selectedOutletId) return;

    setTicket([]);
    setExternalReference("");
    setPrepSent(false);
    setMessage("Switching POS outlet...");
    await syncCatalog(outletId);
  }

  function changeTerminal(terminalId: string) {
    setSelectedTerminalId(terminalId);
    rememberPosAssignment(selectedOutletId, terminalId);
    const terminal = selectedOutlet?.terminals.find((entry) => entry.id === terminalId);
    setMessage(`${terminal?.name ?? "Terminal"} assigned to this machine.`);
  }

  function choosePaymentMethod(method: PaymentMethod) {
    setPaymentMethod(method);

    if (method === "ROOM_CHARGE") {
      setExternalReference("");
      void loadChargeableRooms(true);
      return;
    }

    setSelectedFolioId("");
  }

  function addProduct(product: TerminalProduct) {
    setTicket((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        return current.map((line) =>
          line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line
        );
      }

      return [...current, { product, quantity: 1 }];
    });
    setPrepSent(false);
    setMessage(`${product.name} added.`);
  }

  function updateQuantity(productId: string, direction: "up" | "down") {
    setTicket((current) =>
      current
        .map((line) =>
          line.product.id === productId
            ? { ...line, quantity: direction === "up" ? line.quantity + 1 : line.quantity - 1 }
            : line
        )
        .filter((line) => line.quantity > 0)
    );
    setPrepSent(false);
  }

  function clearTicket() {
    setTicket([]);
    setExternalReference("");
    setSelectedFolioId("");
    setPrepSent(false);
    setMessage("Ticket cleared.");
  }

  function sendToPrep() {
    if (ticket.length === 0) {
      setMessage("Add items before sending an order.");
      return;
    }

    const queuedTickets = queuePrepTickets(ticket, `LOCAL-${String(prepTickets.length + 1).padStart(4, "0")}`);
    setMessage(formatPrepMessage(queuedTickets));
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (ticket.length === 0) {
      setMessage("Add items before payment.");
      return;
    }

    if (roomChargeSelected && !selectedChargeableRoom) {
      setMessage("Choose an occupied room before charging this ticket to a room.");
      return;
    }

    if (referenceRequired && !externalReference.trim()) {
      setMessage("Transaction reference required.");
      return;
    }

    const orderLines = ticket;
    const orderIdempotencyKey = createLocalId("terminal-order");
    const paymentIdempotencyKey = createLocalId("terminal-payment");
    const paymentReference =
      roomChargeSelected && selectedChargeableRoom
        ? roomChargeReference(selectedChargeableRoom)
        : externalReference.trim() || undefined;

    if (terminalMode !== "live" || !selectedOutlet) {
      queueOfflinePayment(orderLines, orderIdempotencyKey, paymentIdempotencyKey);
      return;
    }

    setBusy(true);
    setMessage("Posting order to shared hotel database...");

    const orderResult = await apiRequest<PosOrderResponse>("/pos/orders", {
      method: "POST",
      body: JSON.stringify({
        outletId: selectedOutlet.id,
        terminalId: selectedTerminal?.id,
        folioId: roomChargeSelected ? selectedChargeableRoom?.folio.id : undefined,
        serviceType: serviceTypeForOutlet(selectedOutlet),
        idempotencyKey: orderIdempotencyKey,
        items: ticket.map((line) => ({
          productVariantId: line.product.productVariantId,
          quantity: String(line.quantity)
        }))
      })
    });

    if (!orderResult.ok) {
      setBusy(false);
      if (isReachabilityError(orderResult.error)) {
        queueOfflinePayment(orderLines, orderIdempotencyKey, paymentIdempotencyKey);
        return;
      }

      setMessage(orderResult.error);
      return;
    }

    const routedTickets = prepSent ? [] : queuePrepTickets(orderLines, orderResult.data.orderNumber);

    const paymentResult = await apiRequest<PosOrderResponse>(`/pos/orders/${orderResult.data.id}/payments`, {
      method: "POST",
      body: JSON.stringify({
        paymentMethod,
        amount: String(orderResult.data.grandTotal),
        externalReceiptNumber: roomChargeSelected ? undefined : externalReference.trim() || undefined,
        externalReference: paymentReference,
        idempotencyKey: paymentIdempotencyKey
      })
    });

    setBusy(false);

    if (!paymentResult.ok) {
      if (isReachabilityError(paymentResult.error)) {
        queueOfflinePayment(orderLines, orderIdempotencyKey, paymentIdempotencyKey);
        return;
      }

      setMessage(paymentResult.error);
      return;
    }

    const payments = paymentResult.data.payments ?? [];
    const payment = payments[payments.length - 1];
    const receiptNumber = payment?.systemReceiptNumber ?? orderResult.data.orderNumber;
    const receiptTotal = Number(payment?.amount ?? paymentResult.data.grandTotal);

    setReceipts((current) => [
      {
        id: payment?.id ?? createLocalId("receipt"),
        receiptNumber,
        paymentMethod,
        total: receiptTotal,
        lines: mapReceiptLines(orderLines),
        createdAt: payment?.createdAt ?? new Date().toISOString()
      },
      ...current
    ]);
    setTicket([]);
    setExternalReference("");
    setSelectedFolioId("");
    setPrepSent(false);
    setMessage(
      routedTickets.length
        ? `${receiptNumber} saved. ${formatPrepMessage(routedTickets)}`
        : `${receiptNumber} saved through the shared database.`
    );
  }

  function queueOfflinePayment(orderLines: TicketLine[], orderIdempotencyKey: string, paymentIdempotencyKey: string) {
    const localOrderNumber = `OFFLINE-${terminalLabel.replace(/[^A-Z0-9]/gi, "").slice(0, 8).toUpperCase()}-${Date.now().toString().slice(-6)}`;
    const offlineSale = enqueueOfflineSale({
      terminalId: selectedTerminal?.id,
      terminalName: selectedTerminal?.deviceIdentifier ?? selectedTerminal?.name ?? terminalLabel,
      outletId: selectedOutlet?.id,
      outletName: selectedOutlet?.name ?? "Offline Outlet",
      outletType: selectedOutlet?.outletType,
      folioId: roomChargeSelected ? selectedChargeableRoom?.folio.id : undefined,
      roomLabel: roomChargeSelected && selectedChargeableRoom ? roomChargeReference(selectedChargeableRoom) : undefined,
      localOrderNumber,
      subtotal,
      tax,
      total,
      paymentMethod,
      externalReference:
        roomChargeSelected && selectedChargeableRoom ? roomChargeReference(selectedChargeableRoom) : externalReference.trim() || undefined,
      orderIdempotencyKey,
      paymentIdempotencyKey,
      lines: orderLines.map((line) => ({
        productVariantId: line.product.productVariantId,
        name: line.product.name,
        quantity: line.quantity,
        unitPrice: line.product.price,
        taxRate: line.product.taxRate,
        amount: line.product.price * line.quantity
      }))
    });
    const routedTickets = prepSent ? [] : queuePrepTickets(orderLines, offlineSale.localOrderNumber);

    setReceipts((current) => [
      {
        id: offlineSale.id,
        receiptNumber: `${offlineSale.localOrderNumber}-PENDING`,
        paymentMethod,
        total,
        offline: true,
        syncStatus: "PENDING SYNC",
        lines: mapReceiptLines(orderLines),
        createdAt: offlineSale.createdAt
      },
      ...current
    ]);
    setTicket([]);
    setExternalReference("");
    setSelectedFolioId("");
    setPrepSent(false);
    setOfflineQueueCount(countPendingOfflineSales());
    setMessage(
      routedTickets.length
        ? `${offlineSale.localOrderNumber} saved offline. ${formatPrepMessage(routedTickets)}`
        : `${offlineSale.localOrderNumber} saved offline and waiting to sync.`
    );
  }

  async function syncOfflineQueue() {
    setSyncingOffline(true);
    setMessage("Syncing offline POS queue...");
    const result = await syncQueuedOfflineSales();
    setSyncingOffline(false);
    setOfflineQueueCount(countPendingOfflineSales());
    setMessage(
      result.conflicts
        ? `${result.synced} offline sales synced. ${result.conflicts} need review in Offline Sync.`
        : `${result.synced} offline sales synced. ${result.remaining} still pending.`
    );
  }

  function queuePrepTickets(lines: TicketLine[], orderLabel: string) {
    const tickets = createPrepTickets(lines, orderLabel, prepTickets.length, selectedOutlet?.outletType);
    if (tickets.length === 0) return tickets;

    setPrepTickets((current) => [...tickets, ...current]);
    setPrepSent(true);
    return tickets;
  }

  function printReceipt(receipt: PaidReceipt) {
    openPrintWindow(
      `Receipt ${receipt.receiptNumber}`,
      `
        <h1>Main Hotel</h1>
        <p><strong>Receipt:</strong> ${escapeHtml(receipt.receiptNumber)}</p>
        <p><strong>Payment:</strong> ${escapeHtml(receipt.paymentMethod.replace("_", " "))}</p>
        ${receipt.offline ? `<p><strong>Status:</strong> ${escapeHtml(receipt.syncStatus ?? "PENDING SYNC")}</p>` : ""}
        <hr />
        ${receipt.lines
          .map(
            (line) => `
              <div class="line">
                <span>${line.quantity} x ${escapeHtml(line.name)}</span>
                <strong>${formatMoney(line.amount)}</strong>
              </div>
            `
          )
          .join("")}
        <hr />
        <div class="total"><span>Total</span><strong>${formatMoney(receipt.total)}</strong></div>
        <p class="muted">${escapeHtml(new Date(receipt.createdAt).toLocaleString())}</p>
      `
    );
  }

  function printPrepTicket(ticketToPrint: PrepTicket) {
    openPrintWindow(
      `${ticketToPrint.station} ${ticketToPrint.ticketNumber}`,
      `
        <h1>${escapeHtml(ticketToPrint.station)}</h1>
        <p><strong>Ticket:</strong> ${escapeHtml(ticketToPrint.ticketNumber)}</p>
        <hr />
        ${ticketToPrint.lines
          .map(
            (line) => `
              <div class="line">
                <span>${line.quantity} x ${escapeHtml(line.name)}</span>
              </div>
            `
          )
          .join("")}
        <hr />
        <p class="muted">${escapeHtml(new Date(ticketToPrint.createdAt).toLocaleString())}</p>
      `
    );
    setPrepTickets((current) =>
      current.map((entry) => (entry.id === ticketToPrint.id ? { ...entry, status: "PRINTED" } : entry))
    );
  }

  return (
    <main className="min-h-screen bg-[#eef3ec]">
      <div className="grid min-h-screen lg:grid-cols-[80px_1fr]">
        <aside className="flex flex-row items-center justify-between border-b border-border bg-[#163f35] px-3 py-3 text-white lg:flex-col lg:border-b-0 lg:border-r">
          <div className="flex h-12 w-12 items-center justify-center rounded bg-white/10">
            <Store className="h-6 w-6" aria-hidden="true" />
          </div>
          <nav className="flex gap-2 lg:flex-col">
            {[Store, Printer, Wifi, LockKeyhole].map((Icon, index) => (
              <button
                key={index}
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/20"
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </button>
            ))}
          </nav>
          <a
            href="/"
            className="flex h-11 w-11 items-center justify-center rounded border border-white/10 bg-white/5 text-xs font-bold text-white transition-colors hover:bg-white/20"
          >
            HMS
          </a>
        </aside>

        <section className="flex min-w-0 flex-col">
          <header className="border-b border-border bg-white px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="success">POS Terminal</Badge>
                  <Badge>Terminal {terminalLabel}</Badge>
                  <Badge>Cashier role</Badge>
                  {selectedOutlet ? <Badge>{formatOutletType(selectedOutlet.outletType)}</Badge> : null}
                  {offlineQueueCount ? <Badge tone="warning">{offlineQueueCount} offline pending</Badge> : null}
                </div>
                <h1 className="mt-2 text-2xl font-bold leading-tight">{selectedOutlet?.name ?? "Main Restaurant"} Cashier</h1>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="flex h-10 items-center gap-2 rounded border border-border bg-muted px-3 text-sm font-semibold">
                  {terminalMode === "live" ? (
                    <Wifi className="h-4 w-4 text-success" aria-hidden="true" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-warning" aria-hidden="true" />
                  )}
                  {terminalMode === "live" ? "Database connected" : "Offline queue active"}
                </div>
                <div className="flex h-10 items-center gap-2 rounded border border-border bg-muted px-3 text-sm font-semibold">
                  <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                  POS only
                </div>
              </div>
            </div>
          </header>

          <div className="grid flex-1 gap-4 p-4 xl:grid-cols-[1fr_420px]">
            <section className="space-y-4">
              <form onSubmit={signInCashier} className="grid gap-3 rounded border border-border bg-white p-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">Cashier email</span>
                  <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">Password</span>
                  <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
                </label>
                <Button disabled={busy}>
                  <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                  Sign in
                </Button>
              </form>

              {outlets.length > 0 ? (
                <div className="grid gap-3 rounded border border-border bg-white p-3 lg:grid-cols-[1fr_1fr_1.2fr] lg:items-end">
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">Outlet</span>
                    <select
                      value={selectedOutletId}
                      onChange={(event) => {
                        void changeOutlet(event.target.value);
                      }}
                      disabled={busy}
                      className="h-11 w-full rounded border border-input bg-background px-3 text-sm font-semibold outline-none transition-colors focus:border-primary"
                    >
                      {outlets.map((outlet) => (
                        <option key={outlet.id} value={outlet.id}>
                          {outlet.name} - {formatOutletType(outlet.outletType)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">Terminal</span>
                    <select
                      value={selectedTerminalId}
                      onChange={(event) => changeTerminal(event.target.value)}
                      disabled={busy || !selectedOutlet?.terminals.length}
                      className="h-11 w-full rounded border border-input bg-background px-3 text-sm font-semibold outline-none transition-colors focus:border-primary"
                    >
                      {(selectedOutlet?.terminals ?? []).map((terminal) => (
                        <option key={terminal.id} value={terminal.id}>
                          {terminal.name} - {terminal.deviceIdentifier}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="rounded border border-border bg-muted px-3 py-2 text-sm font-semibold text-muted-foreground">
                    {prepDestinationSummary(selectedOutlet)}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveCategory(category)}
                    className={`h-11 rounded border px-4 text-sm font-bold transition-colors ${
                      activeCategory === category
                        ? "border-[#163f35] bg-[#163f35] text-white"
                        : "border-border bg-white text-foreground hover:bg-muted"
                    }`}
                  >
                    {category}
                  </button>
                ))}
                <Button type="button" variant="secondary" onClick={() => void syncCatalog()} disabled={busy}>
                  <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                  Sync
                </Button>
                <Button type="button" variant="secondary" onClick={syncOfflineQueue} disabled={syncingOffline || offlineQueueCount === 0}>
                  <Wifi className="h-4 w-4" aria-hidden="true" />
                  Sync offline
                </Button>
              </div>

              <div className="rounded border border-border bg-white px-4 py-3 text-sm font-semibold text-muted-foreground">
                {message}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {prepStations.map((station) => {
                  const queueCount =
                    station.name === "Receipt Printer"
                      ? receipts.length
                      : prepTickets.filter((ticketToPrint) => ticketToPrint.station === station.name).length;
                  return (
                    <div key={station.name} className="rounded border border-border bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold">{station.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{station.detail}</p>
                        </div>
                        <Printer className="h-4 w-4 text-primary" aria-hidden="true" />
                      </div>
                      <Badge tone={queueCount ? "warning" : "success"}>{queueCount ? `${queueCount} queued` : "Ready"}</Badge>
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {visibleProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addProduct(product)}
                    className="flex min-h-[142px] flex-col justify-between rounded border border-border bg-white p-4 text-left transition-colors hover:border-[#163f35] hover:bg-[#f8fbf7]"
                  >
                    <span className="text-base font-bold">{product.name}</span>
                    <span className="text-sm font-medium text-muted-foreground">{product.category}</span>
                    <span className="text-xl font-bold tabular-nums">{formatMoney(product.price)}</span>
                  </button>
                ))}
              </div>
            </section>

            <form onSubmit={submitPayment} className="flex min-h-[640px] flex-col rounded border border-border bg-white">
              <div className="border-b border-border px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold">Current Ticket</h2>
                  <Badge tone={ticket.length ? "primary" : "neutral"}>{ticket.length} lines</Badge>
                </div>
              </div>

              <div className="min-h-[220px] flex-1 divide-y divide-border overflow-y-auto">
                {ticket.length === 0 ? (
                  <div className="px-4 py-8 text-sm text-muted-foreground">No items on ticket.</div>
                ) : (
                  ticket.map((line) => (
                    <div key={line.product.id} className="px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold">{line.product.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {line.quantity} x {formatMoney(line.product.price)}
                          </p>
                        </div>
                        <p className="font-bold tabular-nums">{formatMoney(line.product.price * line.quantity)}</p>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => updateQuantity(line.product.id, "down")}>
                          <Minus className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => updateQuantity(line.product.id, "up")}>
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
                    <span className="font-semibold tabular-nums">{formatMoney(tax)}</span>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-border pt-3 text-xl">
                    <span className="font-bold">Total</span>
                    <span className="font-bold tabular-nums">{formatMoney(total)}</span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {paymentMethods.map((method) => {
                    const Icon = method.icon;
                    return (
                      <button
                        key={method.value}
                        type="button"
                        onClick={() => choosePaymentMethod(method.value)}
                        className={`flex h-11 items-center justify-center gap-2 rounded border text-sm font-bold transition-colors ${
                          paymentMethod === method.value
                            ? "border-[#163f35] bg-[#163f35] text-white"
                            : "border-border bg-white text-foreground hover:bg-muted"
                        }`}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        {method.label}
                      </button>
                    );
                  })}
                </div>

                {roomChargeSelected ? (
                  <div className="mt-3 rounded border border-border bg-muted/45 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-bold">Occupied room</span>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-8 px-3"
                        onClick={() => void loadChargeableRooms(true)}
                        disabled={loadingRooms}
                      >
                        <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                        Refresh
                      </Button>
                    </div>
                    <select
                      value={selectedFolioId}
                      onChange={(event) => setSelectedFolioId(event.target.value)}
                      className="h-11 w-full rounded border border-input bg-background px-3 text-sm font-semibold outline-none transition-colors focus:border-primary"
                    >
                      <option value="">{loadingRooms ? "Loading occupied rooms..." : "Choose room to charge"}</option>
                      {chargeableRooms.map((room) => (
                        <option key={room.folio.id} value={room.folio.id}>
                          Room {room.roomNumber} - {room.guest.firstName} {room.guest.lastName} - {room.folio.folioNumber} - Balance{" "}
                          {formatMoney(Number(room.folio.balance))}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs font-semibold text-muted-foreground">
                      {selectedChargeableRoom
                        ? `Charge will post to ${roomChargeReference(selectedChargeableRoom)}.`
                        : chargeableRooms.length
                          ? "Select the guest room before pressing Pay."
                          : "Only checked-in occupied rooms with open folios appear here."}
                    </p>
                  </div>
                ) : null}

                <label className="mt-3 block space-y-1.5">
                  <span className="text-sm font-medium">Transaction reference</span>
                  <Input
                    value={externalReference}
                    onChange={(event) => setExternalReference(event.target.value)}
                    placeholder={referenceRequired ? "Required" : "Optional"}
                  />
                </label>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Button type="button" variant="secondary" onClick={sendToPrep} disabled={ticket.length === 0 || busy || prepSent}>
                    <BellRing className="h-4 w-4" aria-hidden="true" />
                    Send
                  </Button>
                  <Button disabled={ticket.length === 0 || busy}>
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Pay
                  </Button>
                  <Button type="button" variant="secondary" onClick={clearTicket} disabled={busy}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Clear
                  </Button>
                </div>
              </div>

              <div className="border-t border-border p-4">
                <div className="mb-2 flex items-center gap-2">
                  <BellRing className="h-4 w-4 text-primary" aria-hidden="true" />
                  <h3 className="font-bold">Prep Notifications</h3>
                </div>
                <div className="space-y-2">
                  {prepTickets.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No prep tickets sent.</p>
                  ) : (
                    prepTickets.slice(0, 4).map((prepTicket) => (
                      <div key={prepTicket.id} className="rounded border border-border bg-muted/45 p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-bold">{prepTicket.station}</span>
                          <Badge tone={prepTicket.status === "PRINTED" ? "success" : "warning"}>{prepTicket.status}</Badge>
                        </div>
                        <p className="mt-1 text-xs font-semibold">{prepTicket.ticketNumber}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {prepTicket.lines.map((line) => `${line.quantity} x ${line.name}`).join(", ")}
                        </p>
                        <Button type="button" variant="secondary" className="mt-2 h-8 w-full" onClick={() => printPrepTicket(prepTicket)}>
                          <Printer className="h-4 w-4" aria-hidden="true" />
                          Print ticket
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="border-t border-border p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Printer className="h-4 w-4 text-primary" aria-hidden="true" />
                  <h3 className="font-bold">Last Receipts</h3>
                </div>
                <div className="space-y-2">
                  {receipts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No receipts yet.</p>
                  ) : (
                    receipts.slice(0, 3).map((receipt) => (
                      <div key={receipt.id} className="rounded border border-border bg-muted/45 p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-bold">{receipt.receiptNumber}</span>
                          <span className="font-bold tabular-nums">{formatMoney(receipt.total)}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {receipt.paymentMethod.replace("_", " ")}
                          {receipt.offline ? ` - ${receipt.syncStatus ?? "PENDING SYNC"}` : ""}
                        </p>
                        <Button type="button" variant="secondary" className="mt-2 h-8 w-full" onClick={() => printReceipt(receipt)}>
                          <Printer className="h-4 w-4" aria-hidden="true" />
                          Print receipt
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

function createPrepTickets(
  lines: TicketLine[],
  orderLabel: string,
  existingCount: number,
  outletType?: PosOutletType
): PrepTicket[] {
  const stationLines = new Map<PrepStation, PrepTicket["lines"]>();

  for (const line of lines) {
    const station = getPrepStation(line.product.category, outletType);
    const current = stationLines.get(station) ?? [];
    current.push({
      name: line.product.name,
      quantity: line.quantity
    });
    stationLines.set(station, current);
  }

  return Array.from(stationLines.entries()).map(([station, stationTicketLines], index) => ({
    id: createLocalId("prep-ticket"),
    ticketNumber: `${orderLabel}-${String(existingCount + index + 1).padStart(2, "0")}`,
    station,
    lines: stationTicketLines,
    status: "SENT",
    createdAt: new Date().toISOString()
  }));
}

function getPrepStation(category: string, outletType?: PosOutletType): PrepStation {
  if (outletType === "BAR") {
    return "Bar Printer";
  }

  const normalized = category.toLowerCase();

  if (normalized.includes("drink") || normalized.includes("bar") || normalized.includes("beverage")) {
    return "Bar Printer";
  }

  if (normalized.includes("service")) {
    return "Service Desk";
  }

  return "Restaurant Kitchen";
}

function serviceTypeForOutlet(outlet?: PosOutlet): "TAKEAWAY" | "BAR" {
  return outlet?.outletType === "BAR" ? "BAR" : "TAKEAWAY";
}

function prepDestinationSummary(outlet?: PosOutlet) {
  if (!outlet) return "Choose an outlet after signing in.";
  if (outlet.outletType === "BAR") return "Bar POS: all prep notifications route to Bar Printer.";
  return "Restaurant POS: food routes to kitchen, drinks route to Bar Printer.";
}

function roomChargeReference(room: ChargeableRoom) {
  return `Room ${room.roomNumber} - ${room.guest.firstName} ${room.guest.lastName} - ${room.folio.folioNumber}`;
}

function formatOutletType(value?: PosOutletType | string) {
  if (!value) return "POS";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function readPreferredOutletId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(preferredOutletKey) ?? "";
}

function readPreferredTerminalId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(preferredTerminalKey) ?? "";
}

function rememberPosAssignment(outletId: string, terminalId: string) {
  if (typeof window === "undefined") return;
  if (outletId) window.localStorage.setItem(preferredOutletKey, outletId);
  if (terminalId) window.localStorage.setItem(preferredTerminalKey, terminalId);
}

function mapReceiptLines(lines: TicketLine[]): PaidReceipt["lines"] {
  return lines.map((line) => ({
    name: line.product.name,
    quantity: line.quantity,
    amount: line.product.price * line.quantity
  }));
}

function formatPrepMessage(tickets: PrepTicket[]) {
  if (tickets.length === 0) {
    return "No prep tickets were routed.";
  }

  return `Order sent to ${tickets.map((ticket) => ticket.station).join(", ")}.`;
}

function openPrintWindow(title: string, body: string) {
  const printWindow = window.open("", "_blank", "width=420,height=720");
  if (!printWindow) return;

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; color: #111; }
          h1 { font-size: 18px; margin: 0 0 12px; }
          p { margin: 6px 0; font-size: 13px; }
          hr { border: 0; border-top: 1px dashed #999; margin: 12px 0; }
          .line, .total { display: flex; justify-content: space-between; gap: 12px; margin: 8px 0; font-size: 13px; }
          .total { font-size: 16px; }
          .muted { color: #555; font-size: 11px; }
        </style>
      </head>
      <body>${body}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function mapCatalogItem(item: CatalogItem): TerminalProduct {
  const productName = item.productVariant.product.name;
  const variantName = item.productVariant.name;
  const displayName = variantName && variantName.toLowerCase() !== "regular" ? `${productName} ${variantName}` : productName;

  return {
    id: item.productVariantId,
    productVariantId: item.productVariantId,
    name: displayName,
    category: item.productVariant.product.category?.name ?? "Food",
    price: Number(item.price),
    taxRate: Number(item.taxRate)
  };
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function countPendingOfflineSales() {
  return readOfflineSales().filter((sale) => sale.status !== "SYNCED").length;
}

function isReachabilityError(error: string) {
  return error.toLowerCase().includes("api is not reachable") || error.toLowerCase().includes("failed to fetch");
}

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
