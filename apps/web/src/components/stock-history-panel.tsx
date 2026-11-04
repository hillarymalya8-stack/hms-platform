"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, History, RefreshCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api-client";

export const NOT_RECORDED = "Not recorded";

type StoreSide = { name: string; quantityBefore: number | null; quantityAfter: number | null } | null;

export type StockHistoryMovement = {
  id: string;
  type: "RECEIPT" | "ISSUE" | "TRANSFER" | "ADJUSTMENT" | "COUNT_VARIANCE";
  action: string;
  reference: string;
  itemId: string | null;
  itemName: string;
  sku: string | null;
  unit: string | null;
  locationName: string;
  quantity: number;
  value: number;
  staffName: string | null;
  reason: string | null;
  source: string | null;
  createdAt: string;
  from: StoreSide;
  to: StoreSide;
};

type HistoryResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  staff: Array<{ id: string; name: string }>;
  movements: StockHistoryMovement[];
};

type Option = { id: string; name: string };

const movementTypes = [
  { value: "", label: "All actions" },
  { value: "RECEIPT", label: "Received" },
  { value: "ISSUE", label: "Issued / sold" },
  { value: "TRANSFER", label: "Transferred" },
  { value: "ADJUSTMENT", label: "Adjusted / returned" }
];

export function StockHistoryPanel({ items, locations }: { items: Option[]; locations: Option[] }) {
  const [filters, setFilters] = useState({ itemId: "", locationId: "", type: "", userId: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [staff, setStaff] = useState<Option[]>([]);
  const [message, setMessage] = useState("Loading stock history...");
  const [loading, setLoading] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    void load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters]);

  async function load(nextPage: number) {
    const id = ++request.current;
    setLoading(true);
    const params = new URLSearchParams({ page: String(nextPage), pageSize: "25" });
    if (filters.itemId) params.set("itemId", filters.itemId);
    if (filters.locationId) params.set("locationId", filters.locationId);
    if (filters.type) params.set("type", filters.type);
    if (filters.userId) params.set("userId", filters.userId);
    if (filters.from) params.set("from", localDayStart(filters.from));
    if (filters.to) params.set("to", localDayEnd(filters.to));
    const result = await apiRequest<HistoryResponse>(`/inventory/history?${params.toString()}`);
    if (id !== request.current) return;
    setLoading(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setData(result.data);
    setStaff((current) => mergeStaff(current, result.data.staff));
    setMessage(
      result.data.total === 0
        ? "No stock movements match these filters."
        : `${result.data.total} movement${result.data.total === 1 ? "" : "s"} found.`
    );
  }

  function update(patch: Partial<typeof filters>) {
    setPage(1);
    setFilters((current) => ({ ...current, ...patch }));
  }

  return (
    <div className="rounded border border-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" aria-hidden="true" />
          <h4 className="font-bold">Stock History</h4>
        </div>
        <Button type="button" variant="ghost" className="h-8 px-2" onClick={() => void load(page)} aria-label="Reload stock history">
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="grid gap-2 border-b border-border p-4 sm:grid-cols-3 lg:grid-cols-6">
        <FilterSelect label="Item" value={filters.itemId} onChange={(itemId) => update({ itemId })} options={items} all="All items" />
        <FilterSelect
          label="Store"
          value={filters.locationId}
          onChange={(locationId) => update({ locationId })}
          options={locations}
          all="All my stores"
        />
        <label className="grid gap-1 text-xs font-semibold uppercase text-muted-foreground">
          Action
          <select
            className="h-9 rounded border border-border bg-white px-2 text-sm font-normal normal-case text-foreground"
            value={filters.type}
            onChange={(event) => update({ type: event.target.value })}
          >
            {movementTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <FilterSelect label="Staff" value={filters.userId} onChange={(userId) => update({ userId })} options={staff} all="All staff" />
        <label className="grid gap-1 text-xs font-semibold uppercase text-muted-foreground">
          From
          <Input type="date" className="h-9" value={filters.from} onChange={(event) => update({ from: event.target.value })} />
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase text-muted-foreground">
          To
          <Input type="date" className="h-9" value={filters.to} onChange={(event) => update({ to: event.target.value })} />
        </label>
      </div>
      <p role="status" aria-live="polite" className="px-4 pt-3 text-sm text-muted-foreground">
        {loading ? "Loading..." : message}
      </p>
      <div className="overflow-x-auto p-4">
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">Date / time</th>
              <th className="px-3 py-2 font-semibold">Staff</th>
              <th className="px-3 py-2 font-semibold">Item</th>
              <th className="px-3 py-2 font-semibold">Action</th>
              <th className="px-3 py-2 text-right font-semibold">Qty</th>
              <th className="px-3 py-2 font-semibold">Store: before → after</th>
              <th className="px-3 py-2 font-semibold">Reason / source</th>
            </tr>
          </thead>
          <tbody>
            {(data?.movements ?? []).map((movement) => (
              <tr key={movement.id} className="border-t border-border align-top">
                <td className="whitespace-nowrap px-3 py-2">{formatDateTime(movement.createdAt)}</td>
                <td className="px-3 py-2">
                  {movement.staffName ?? <span className="text-muted-foreground">{NOT_RECORDED}</span>}
                </td>
                <td className="px-3 py-2">
                  <span className="font-semibold">{movement.itemName}</span>
                  {movement.sku ? <span className="block text-xs text-muted-foreground">{movement.sku}</span> : null}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={toneFor(movement.type)}>{movement.action}</Badge>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {movement.quantity.toFixed(2)} {movement.unit ?? ""}
                </td>
                <td className="px-3 py-2">
                  <StoreChange side={movement.from} sign="-" />
                  <StoreChange side={movement.to} sign="+" />
                </td>
                <td className="px-3 py-2 text-muted-foreground">{movement.reason ?? movement.source ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm">
          <Button type="button" variant="secondary" className="h-8 px-3" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Newer
          </Button>
          <span className="text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </span>
          <Button
            type="button"
            variant="secondary"
            className="h-8 px-3"
            disabled={page >= data.totalPages || loading}
            onClick={() => setPage(page + 1)}
          >
            Older
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function StoreChange({ side, sign }: { side: StoreSide; sign: "+" | "-" }) {
  if (!side) return null;
  const known = side.quantityBefore !== null && side.quantityAfter !== null;
  return (
    <p className="whitespace-nowrap">
      <span className="font-semibold">{side.name}</span>{" "}
      <span className={sign === "+" ? "text-success" : "text-warning"}>({sign})</span>{" "}
      <span className="tabular-nums text-muted-foreground">
        {known ? `${side.quantityBefore!.toFixed(2)} → ${side.quantityAfter!.toFixed(2)}` : NOT_RECORDED}
      </span>
    </p>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  all
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  all: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold uppercase text-muted-foreground">
      {label}
      <select
        className="h-9 rounded border border-border bg-white px-2 text-sm font-normal normal-case text-foreground"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{all}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function mergeStaff(current: Option[], next: Option[]) {
  const map = new Map(current.map((entry) => [entry.id, entry]));
  for (const entry of next) map.set(entry.id, entry);
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function toneFor(type: StockHistoryMovement["type"]) {
  if (type === "RECEIPT") return "success" as const;
  if (type === "TRANSFER") return "primary" as const;
  if (type === "ADJUSTMENT") return "neutral" as const;
  return "warning" as const;
}

// Date inputs are local hotel dates; send exact local-midnight boundaries to the API.
export function localDayStart(date: string) {
  return new Date(`${date}T00:00:00`).toISOString();
}

export function localDayEnd(date: string) {
  const end = new Date(`${date}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return end.toISOString();
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
