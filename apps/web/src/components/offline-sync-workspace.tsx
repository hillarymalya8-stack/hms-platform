"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Database,
  Printer,
  RefreshCcw,
  RotateCw,
  Router,
  Server,
  Wifi,
  WifiOff
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  enqueueOfflineSale,
  onOfflineQueueChanged,
  readOfflineSales,
  syncQueuedOfflineSales,
  updateOfflineSale,
  type OfflineSale
} from "@/lib/offline-pos";

type TerminalStatus = "ONLINE" | "OFFLINE" | "SYNCING";
type DeviceStatus = "READY" | "OFFLINE" | "PAPER_LOW";

type Terminal = {
  id: string;
  name: string;
  outlet: string;
  status: TerminalStatus;
  lastSeen: string;
  queueDepth: number;
};

type PosDevice = {
  id: string;
  terminalId: string;
  name: string;
  type: "Printer" | "Cash Drawer" | "Scanner";
  status: DeviceStatus;
};

type SyncEvent = {
  id: string;
  action: string;
  detail: string;
  createdAt: string;
};

const demoTerminals: Terminal[] = [
  {
    id: "terminal-rest-1",
    name: "Restaurant POS 01",
    outlet: "Main Restaurant",
    status: "ONLINE",
    lastSeen: "2026-08-31T09:28:00.000Z",
    queueDepth: 0
  },
  {
    id: "terminal-bar-1",
    name: "Bar POS 01",
    outlet: "Bar",
    status: "OFFLINE",
    lastSeen: "2026-08-31T08:43:00.000Z",
    queueDepth: 2
  },
  {
    id: "terminal-room-1",
    name: "Room Service Tablet",
    outlet: "Room Service",
    status: "SYNCING",
    lastSeen: "2026-08-31T09:12:00.000Z",
    queueDepth: 1
  }
];

const demoDevices: PosDevice[] = [
  { id: "dev-printer-rest", terminalId: "terminal-rest-1", name: "Restaurant Receipt Printer", type: "Printer", status: "READY" },
  { id: "dev-drawer-rest", terminalId: "terminal-rest-1", name: "Restaurant Cash Drawer", type: "Cash Drawer", status: "READY" },
  { id: "dev-printer-bar", terminalId: "terminal-bar-1", name: "Bar Receipt Printer", type: "Printer", status: "PAPER_LOW" },
  { id: "dev-scanner-bar", terminalId: "terminal-bar-1", name: "Bar Scanner", type: "Scanner", status: "OFFLINE" }
];

export function OfflineSyncWorkspace() {
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [queue, setQueue] = useState<OfflineSale[]>([]);
  const [devices, setDevices] = useState<PosDevice[]>([]);
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Load sync data to review offline POS operations.");
  const [saleForm, setSaleForm] = useState({
    terminalId: "terminal-bar-1",
    amount: "24.00",
    paymentMethod: "CASH",
    externalReference: "BAR-CASH-NEW"
  });

  const activeTerminals = terminals.length ? terminals : demoTerminals;
  const selectedTerminal = activeTerminals.find((terminal) => terminal.id === saleForm.terminalId) ?? activeTerminals[0];

  const metrics = useMemo(() => {
    const queued = queue.filter((sale) => sale.status === "QUEUED").length;
    const conflicts = queue.filter((sale) => sale.status === "CONFLICT").length;
    const synced = queue.filter((sale) => sale.status === "SYNCED").length;
    const offlineTerminals = activeTerminals.filter((terminal) => terminal.status === "OFFLINE").length;
    return { queued, conflicts, synced, offlineTerminals };
  }, [activeTerminals, queue]);

  useEffect(() => {
    setQueue(readOfflineSales());
    return onOfflineQueueChanged(() => setQueue(readOfflineSales()));
  }, []);

  function loadData() {
    const localQueue = readOfflineSales();
    setTerminals(applyQueueDepth(demoTerminals, localQueue));
    setQueue(localQueue);
    setDevices(demoDevices.map((device) => ({ ...device })));
    setEvents([
      createEvent("Sync monitor loaded", "Terminal health, local offline queue, and device status loaded.")
    ]);
    setMessage(localQueue.length ? "Offline POS sync monitor loaded from this machine." : "No offline POS sales are queued on this machine.");
  }

  function toggleTerminal(terminalId: string) {
    const terminal = activeTerminals.find((entry) => entry.id === terminalId);
    if (!terminal) return;
    const nextStatus: TerminalStatus = terminal.status === "OFFLINE" ? "ONLINE" : "OFFLINE";

    setTerminals((current) =>
      current.map((entry) =>
        entry.id === terminalId
          ? { ...entry, status: nextStatus, lastSeen: new Date().toISOString() }
          : entry
      )
    );
    addEvent("Terminal status changed", `${terminal.name} marked ${nextStatus.toLowerCase()}.`);
    setMessage(`${terminal.name} is now ${nextStatus.toLowerCase()}.`);
  }

  function queueOfflineSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(saleForm.amount);
    const terminal = activeTerminals.find((entry) => entry.id === saleForm.terminalId);

    if (!terminal || amount <= 0) {
      setMessage("Choose a terminal and enter a valid sale amount.");
      return;
    }

    const localNumber = `LOCAL-${terminal.name.replace(/[^A-Z0-9]/gi, "").slice(0, 6).toUpperCase()}-${String(queue.length + 1).padStart(4, "0")}`;
    const sale = enqueueOfflineSale({
      terminalId: terminal.id,
      terminalName: terminal.name,
      outletName: terminal.outlet,
      localOrderNumber: localNumber,
      subtotal: amount,
      tax: 0,
      total: amount,
      paymentMethod: saleForm.paymentMethod as OfflineSale["paymentMethod"],
      externalReference: saleForm.externalReference.trim() || undefined,
      orderIdempotencyKey: `${terminal.id}-manual-order-${Date.now()}`,
      paymentIdempotencyKey: `${terminal.id}-manual-payment-${Date.now()}`,
      lines: []
    });
    updateOfflineSale(sale.id, {
      status: "CONFLICT",
      conflict: "Manual queue records need POS item details before automatic sync."
    });

    setQueue(readOfflineSales());
    setTerminals((current) => applyQueueDepth(current, readOfflineSales()));
    addEvent("Offline sale queued", `${localNumber} saved locally with idempotency key ${sale.orderIdempotencyKey}.`);
    setMessage(`${localNumber} saved for review. Sales created from POS include item details and can sync automatically.`);
  }

  async function syncQueuedSales() {
    const queuedSales = queue.filter((sale) => sale.status === "QUEUED" || sale.status === "CONFLICT");
    if (queuedSales.length === 0) {
      setMessage("There are no queued sales to sync.");
      return;
    }

    setBusy(true);
    setMessage("Syncing queued sales to the shared database...");
    const result = await syncQueuedOfflineSales();
    const nextQueue = readOfflineSales();
    setBusy(false);
    setQueue(nextQueue);
    setTerminals((current) => applyQueueDepth(current, nextQueue));
    addEvent("Queued sales sync attempted", `${result.synced} synced, ${result.conflicts} need review, ${result.remaining} pending.`);
    setMessage(
      result.conflicts
        ? `${result.synced} sales synced. ${result.conflicts} need review.`
        : `${result.synced} sales synced. ${result.remaining} still pending.`
    );
  }

  async function resolveConflict(saleId: string) {
    const sale = queue.find((entry) => entry.id === saleId);
    if (!sale || sale.status !== "CONFLICT") return;

    updateOfflineSale(saleId, { status: "QUEUED", conflict: undefined });
    setQueue(readOfflineSales());
    addEvent("Sync conflict retried", `${sale.localOrderNumber} moved back to the sync queue.`);
    setMessage(`${sale.localOrderNumber} will retry on the next sync.`);
  }

  function markDeviceReady(deviceId: string) {
    const device = devices.find((entry) => entry.id === deviceId);
    if (!device) return;

    setDevices((current) =>
      current.map((entry) => (entry.id === deviceId ? { ...entry, status: "READY" } : entry))
    );
    addEvent("Device status restored", `${device.name} marked ready.`);
    setMessage(`${device.name} is ready.`);
  }

  function addEvent(action: string, detail: string) {
    setEvents((current) => [createEvent(action, detail), ...current]);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">Offline POS Sync Workspace</h3>
            <p className="text-sm text-muted-foreground">Monitor terminal connectivity, local queues, devices, and sync conflicts.</p>
          </div>
          <Button type="button" variant="secondary" onClick={loadData}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Load sync data
          </Button>
        </div>

        <p className="rounded border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">{message}</p>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SyncMetric icon={Database} label="Queued sales" value={String(metrics.queued)} detail="Waiting to sync" />
          <SyncMetric icon={AlertTriangle} label="Conflicts" value={String(metrics.conflicts)} detail="Need review" />
          <SyncMetric icon={CheckCircle2} label="Synced" value={String(metrics.synced)} detail="Posted safely" />
          <SyncMetric icon={WifiOff} label="Offline terminals" value={String(metrics.offlineTerminals)} detail="Disconnected" />
        </div>

        <div className="overflow-hidden rounded border border-border bg-white">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Router className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Terminal Health</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Terminal</th>
                  <th className="px-4 py-3 font-semibold">Outlet</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Queue</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {activeTerminals.map((terminal) => (
                  <tr key={terminal.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{terminal.name}</p>
                      <p className="text-xs text-muted-foreground">Last seen {formatDateTime(terminal.lastSeen)}</p>
                    </td>
                    <td className="px-4 py-3">{terminal.outlet}</td>
                    <td className="px-4 py-3">
                      <Badge tone={terminal.status === "ONLINE" ? "success" : terminal.status === "SYNCING" ? "primary" : "warning"}>
                        {terminal.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{terminal.queueDepth}</td>
                    <td className="px-4 py-3">
                      <Button type="button" variant="secondary" className="h-8 px-3" onClick={() => toggleTerminal(terminal.id)}>
                        {terminal.status === "OFFLINE" ? "Reconnect" : "Go offline"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <form onSubmit={queueOfflineSale} className="rounded border border-border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <CloudOff className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Queue Offline Sale</h4>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              aria-label="Terminal"
              className="h-10 rounded border border-border bg-white px-3 text-sm"
              value={saleForm.terminalId}
              onChange={(event) => setSaleForm({ ...saleForm, terminalId: event.target.value })}
            >
              {activeTerminals.map((terminal) => (
                <option key={terminal.id} value={terminal.id}>
                  {terminal.name}
                </option>
              ))}
            </select>
            <Input
              aria-label="Offline sale amount"
              value={saleForm.amount}
              onChange={(event) => setSaleForm({ ...saleForm, amount: event.target.value })}
              placeholder="Amount"
            />
            <select
              aria-label="Payment method"
              className="h-10 rounded border border-border bg-white px-3 text-sm"
              value={saleForm.paymentMethod}
              onChange={(event) => setSaleForm({ ...saleForm, paymentMethod: event.target.value })}
            >
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="MOBILE_MONEY">Mobile money</option>
              <option value="ROOM_CHARGE">Room charge</option>
            </select>
            <Input
              aria-label="External reference"
              value={saleForm.externalReference}
              onChange={(event) => setSaleForm({ ...saleForm, externalReference: event.target.value })}
              placeholder="External reference"
            />
          </div>
          <Button className="mt-3">
            <CloudOff className="h-4 w-4" aria-hidden="true" />
            Save locally
          </Button>
          {selectedTerminal ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Selected terminal: {selectedTerminal.name} - {selectedTerminal.status.toLowerCase()}
            </p>
          ) : null}
        </form>
      </div>

      <div className="space-y-4">
        <div className="rounded border border-border bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" aria-hidden="true" />
              <h4 className="font-bold">Local Sync Queue</h4>
            </div>
            <Button type="button" variant="secondary" className="h-8 px-3" onClick={syncQueuedSales} disabled={busy}>
              <RotateCw className="h-4 w-4" aria-hidden="true" />
              Sync queue
            </Button>
          </div>
          <div className="divide-y divide-border">
            {queue.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">No local sales queued yet.</div>
            ) : (
              queue.map((sale) => {
                const terminal = activeTerminals.find((entry) => entry.id === sale.terminalId);
                return (
                  <div key={sale.id} className="px-4 py-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold">{sale.localOrderNumber}</p>
                        <p className="text-muted-foreground">{terminal?.name ?? sale.terminalName} - {sale.paymentMethod}</p>
                      </div>
                      <Badge tone={sale.status === "SYNCED" ? "success" : sale.status === "CONFLICT" ? "warning" : sale.status === "SYNCING" ? "primary" : "neutral"}>
                        {sale.status}
                      </Badge>
                    </div>
                    <p className="mt-2 tabular-nums">{formatMoney(sale.total)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Key: {sale.orderIdempotencyKey}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{sale.lines.length} item lines - {formatDateTime(sale.createdAt)}</p>
                    {sale.conflict ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-warning">{sale.conflict}</span>
                        <Button type="button" variant="secondary" className="h-8 px-3" onClick={() => resolveConflict(sale.id)}>
                          Resolve
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded border border-border bg-white">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Printer className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Device Readiness</h4>
          </div>
          <div className="divide-y divide-border">
            {devices.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">No devices loaded yet.</div>
            ) : (
              devices.map((device) => {
                const terminal = activeTerminals.find((entry) => entry.id === device.terminalId);
                return (
                  <div key={device.id} className="px-4 py-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold">{device.name}</p>
                        <p className="text-muted-foreground">{device.type} - {terminal?.name}</p>
                      </div>
                      <Badge tone={device.status === "READY" ? "success" : "warning"}>{device.status}</Badge>
                    </div>
                    {device.status !== "READY" ? (
                      <Button type="button" variant="secondary" className="mt-3 h-8 px-3" onClick={() => markDeviceReady(device.id)}>
                        Mark ready
                      </Button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded border border-border bg-white">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Wifi className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Sync Audit</h4>
          </div>
          <div className="divide-y divide-border">
            {events.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">No sync events loaded yet.</div>
            ) : (
              events.slice(0, 6).map((event) => (
                <div key={event.id} className="px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{event.action}</p>
                      <p className="text-muted-foreground">{event.detail}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</span>
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

function SyncMetric({
  icon: Icon,
  label,
  value,
  detail
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded border border-border bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary" aria-hidden={true} />
      </div>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function createEvent(action: string, detail: string): SyncEvent {
  return {
    id: createLocalId("sync"),
    action,
    detail,
    createdAt: new Date().toISOString()
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

function applyQueueDepth(terminals: Terminal[], queue: OfflineSale[]) {
  return terminals.map((terminal) => {
    const queueDepth = queue.filter((sale) => sale.terminalId === terminal.id && sale.status !== "SYNCED").length;
    return {
      ...terminal,
      queueDepth,
      status: queueDepth > 0 && terminal.status === "ONLINE" ? "SYNCING" : terminal.status
    };
  });
}

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
