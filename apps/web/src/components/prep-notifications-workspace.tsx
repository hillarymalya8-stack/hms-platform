"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, ChefHat, Clock, Printer, RefreshCcw, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type PrepTicket = {
  id: string;
  ticketNumber: string;
  orderNumber: string;
  orderStatus: string;
  station: "Restaurant Kitchen" | "Bar Printer" | "Service Desk";
  outletName: string;
  outletType: string;
  terminalName: string;
  tableNumber?: string | null;
  serviceType: string;
  createdAt: string;
  lines: Array<{
    name: string;
    quantity: string;
    category: string;
  }>;
};

type PrepNotificationsResponse = {
  generatedAt: string;
  tickets: PrepTicket[];
  totals: {
    restaurant: number;
    bar: number;
    service: number;
  };
};

const stations = [
  { key: "Restaurant Kitchen", label: "Restaurant Kitchen", icon: ChefHat },
  { key: "Bar Printer", label: "Bar Printer", icon: Printer },
  { key: "Service Desk", label: "Service Desk", icon: BellRing }
] as const;

export function PrepNotificationsWorkspace() {
  const [tickets, setTickets] = useState<PrepTicket[]>([]);
  const [totals, setTotals] = useState<PrepNotificationsResponse["totals"]>({ restaurant: 0, bar: 0, service: 0 });
  const [activeStation, setActiveStation] = useState<PrepTicket["station"] | "ALL">("ALL");
  const [message, setMessage] = useState("Loading prep notifications...");
  const [busy, setBusy] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");

  const visibleTickets = useMemo(
    () => tickets.filter((ticket) => activeStation === "ALL" || ticket.station === activeStation),
    [activeStation, tickets]
  );

  useEffect(() => {
    void loadNotifications(false);
    const interval = window.setInterval(() => {
      void loadNotifications(false);
    }, 4000);

    return () => window.clearInterval(interval);
  }, []);

  async function loadNotifications(showLoading = true) {
    if (showLoading) setBusy(true);
    const result = await apiRequest<PrepNotificationsResponse>("/pos/prep-notifications");
    if (showLoading) setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setTickets(result.data.tickets);
    setTotals(result.data.totals);
    setLastUpdated(new Date(result.data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    setMessage(result.data.tickets.length ? "Prep notifications are live." : "No POS orders have reached prep yet.");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={activeStation === "ALL" ? "primary" : "secondary"} onClick={() => setActiveStation("ALL")}>
            <BellRing className="h-4 w-4" aria-hidden="true" />
            All
          </Button>
          {stations.map((station) => (
            <Button
              key={station.key}
              type="button"
              variant={activeStation === station.key ? "primary" : "secondary"}
              onClick={() => setActiveStation(station.key)}
            >
              <station.icon className="h-4 w-4" aria-hidden="true" />
              {station.label}
            </Button>
          ))}
        </div>
        <Button type="button" variant="secondary" onClick={() => void loadNotifications()} disabled={busy}>
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <p className="rounded border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">
        {message}
        {lastUpdated ? ` Last update ${lastUpdated}.` : ""}
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <QueueMetric label="Restaurant" value={totals.restaurant} icon={ChefHat} />
        <QueueMetric label="Bar" value={totals.bar} icon={Printer} />
        <QueueMetric label="Service" value={totals.service} icon={BellRing} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {stations.map((station) => {
          const stationTickets = visibleTickets.filter((ticket) => ticket.station === station.key);
          return (
            <section key={station.key} className="rounded border border-border bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <station.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  <h3 className="font-bold">{station.label}</h3>
                </div>
                <Badge tone={stationTickets.length ? "warning" : "success"}>{stationTickets.length} tickets</Badge>
              </div>
              <div className="space-y-3 p-4">
                {stationTickets.length === 0 ? (
                  <p className="rounded border border-dashed border-border px-3 py-6 text-sm text-muted-foreground">Queue clear.</p>
                ) : (
                  stationTickets.map((ticket) => <PrepTicketCard key={ticket.id} ticket={ticket} />)
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function QueueMetric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof BellRing }) {
  return (
    <div className="rounded border border-border bg-white p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function PrepTicketCard({ ticket }: { ticket: PrepTicket }) {
  return (
    <article
      className={cn(
        "rounded border p-3 text-sm",
        ticket.station === "Bar Printer" ? "border-sky-200 bg-sky-50" : "border-amber-200 bg-amber-50"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">{ticket.ticketNumber}</p>
          <p className="mt-1 text-xs text-muted-foreground">{ticket.orderNumber}</p>
        </div>
        <Badge tone={ticket.orderStatus === "PAID" ? "success" : "warning"}>{ticket.orderStatus}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded bg-white px-2 py-1">
          <Store className="h-3.5 w-3.5" aria-hidden="true" />
          {ticket.outletName}
        </span>
        <span className="inline-flex items-center gap-1 rounded bg-white px-2 py-1">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {new Date(ticket.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        {ticket.tableNumber ? <span className="rounded bg-white px-2 py-1">Table {ticket.tableNumber}</span> : null}
      </div>
      <div className="mt-3 divide-y divide-border rounded border border-border bg-white">
        {ticket.lines.map((line) => (
          <div key={`${ticket.id}-${line.name}`} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="font-semibold">{line.name}</span>
            <span className="tabular-nums">{formatQuantity(line.quantity)}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function formatQuantity(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return amount.toLocaleString("en", { maximumFractionDigits: 2 });
}
