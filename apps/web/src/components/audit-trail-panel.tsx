"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCcw, ScrollText, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api-client";
import { formatDateTime, localDayEnd, localDayStart, NOT_RECORDED } from "@/components/stock-history-panel";

type AuditEntry = {
  id: string;
  createdAt: string;
  module: string;
  action: string;
  actionLabel: string;
  recordType: string;
  recordId: string | null;
  staff: { userId: string | null; name: string | null; disabled: boolean };
  itemId: string | null;
  itemName: string | null;
  target: string;
  summary: string | null;
  previousValue: unknown;
  newValue: unknown;
};

type AuditPage = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  entries: AuditEntry[];
};

type AuditFilterOptions = {
  staff: Array<{ id: string; name: string; disabled: boolean }>;
  actions: Array<{ module: string; action: string; label: string }>;
  items: Array<{ id: string; name: string; sku: string; active: boolean }>;
};

const emptyFilters = { q: "", userId: "", itemId: "", action: "", from: "", to: "" };

// Read-only audit trail for staff with the "View audit trail" permission.
export function AuditTrailPanel({ pageSize = 25 }: { pageSize?: number }) {
  const [filters, setFilters] = useState(emptyFilters);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditPage | null>(null);
  const [options, setOptions] = useState<AuditFilterOptions>({ staff: [], actions: [], items: [] });
  const [message, setMessage] = useState("Loading audit trail...");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const request = useRef(0);

  useEffect(() => {
    void apiRequest<AuditFilterOptions>("/audit/filters").then((result) => {
      if (result.ok) setOptions(result.data);
    });
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters]);

  async function load() {
    const id = ++request.current;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (filters.q) params.set("q", filters.q);
    if (filters.userId) params.set("userId", filters.userId);
    if (filters.itemId) params.set("itemId", filters.itemId);
    if (filters.action) {
      const [module, action] = filters.action.split(":");
      params.set("module", module);
      params.set("action", action);
    }
    if (filters.from) params.set("from", localDayStart(filters.from));
    if (filters.to) params.set("to", localDayEnd(filters.to));

    const result = await apiRequest<AuditPage>(`/audit?${params.toString()}`);
    if (id !== request.current) return;
    setLoading(false);
    if (!result.ok) {
      setData(null);
      setMessage(result.error);
      return;
    }
    setData(result.data);
    setMessage(
      result.data.total === 0 ? "No audit entries match these filters." : `${result.data.total} audit entr${result.data.total === 1 ? "y" : "ies"} found.`
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
          <ScrollText className="h-4 w-4 text-primary" aria-hidden="true" />
          <h4 className="font-bold">Audit Trail</h4>
          <span className="text-xs text-muted-foreground">Read-only. Entries cannot be edited or deleted.</span>
        </div>
        <Button type="button" variant="ghost" className="h-8 px-2" onClick={() => void load()} aria-label="Reload audit trail">
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <form
        className="grid gap-2 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-6"
        onSubmit={(event) => {
          event.preventDefault();
          update({ q: search.trim() });
        }}
      >
        <label className="grid gap-1 text-xs font-semibold uppercase text-muted-foreground sm:col-span-2">
          Search
          <div className="flex gap-2">
            <Input
              className="h-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Order number, item, staff, reason..."
              aria-label="Search audit trail"
            />
            <Button className="h-9 px-3" aria-label="Search">
              <Search className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </label>
        <Select label="Staff member" value={filters.userId} onChange={(userId) => update({ userId })} all="All staff">
          {options.staff.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
              {entry.disabled ? " (disabled)" : ""}
            </option>
          ))}
        </Select>
        <Select label="Action" value={filters.action} onChange={(action) => update({ action })} all="All actions">
          {options.actions.map((entry) => (
            <option key={`${entry.module}:${entry.action}`} value={`${entry.module}:${entry.action}`}>
              {entry.label} ({entry.module.replaceAll("_", " ")})
            </option>
          ))}
        </Select>
        <Select label="Stock item" value={filters.itemId} onChange={(itemId) => update({ itemId })} all="All items">
          {options.items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.active ? "" : " (inactive)"}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs font-semibold uppercase text-muted-foreground">
            From
            <Input type="date" className="h-9" value={filters.from} onChange={(event) => update({ from: event.target.value })} />
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase text-muted-foreground">
            To
            <Input type="date" className="h-9" value={filters.to} onChange={(event) => update({ to: event.target.value })} />
          </label>
        </div>
        {Object.values(filters).some(Boolean) ? (
          <Button
            type="button"
            variant="secondary"
            className="h-8 w-fit px-3 sm:col-span-2 lg:col-span-6"
            onClick={() => {
              setSearch("");
              setPage(1);
              setFilters(emptyFilters);
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </form>

      <p role="status" aria-live="polite" className="px-4 pt-3 text-sm text-muted-foreground">
        {loading ? "Loading..." : message}
      </p>

      <div className="divide-y divide-border">
        {(data?.entries ?? []).map((entry) => (
          <div key={entry.id} className="px-4 py-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{entry.actionLabel}</p>
                  <Badge>{entry.module.replaceAll("_", " ")}</Badge>
                </div>
                <p className="text-muted-foreground">
                  {entry.itemName && entry.itemName !== entry.target ? `${entry.itemName} · ` : ""}
                  {entry.target}
                </p>
                {entry.summary ? <p className="mt-1">{entry.summary}</p> : null}
              </div>
              <div className="text-right text-xs">
                <p className="font-semibold">
                  {entry.staff.name ?? <span className="text-muted-foreground">{NOT_RECORDED}</span>}
                  {entry.staff.disabled ? <span className="text-muted-foreground"> (disabled)</span> : null}
                </p>
                <p className="text-muted-foreground">{formatDateTime(entry.createdAt)}</p>
              </div>
            </div>
            {entry.previousValue || entry.newValue ? (
              <button
                type="button"
                className="mt-1 text-xs font-semibold text-primary underline-offset-2 hover:underline"
                onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
              >
                {expanded === entry.id ? "Hide details" : "Show details"}
              </button>
            ) : null}
            {expanded === entry.id ? (
              <div className="mt-2 grid gap-2 lg:grid-cols-2">
                {entry.previousValue ? <Details title="Before" value={entry.previousValue} /> : null}
                {entry.newValue ? <Details title="After" value={entry.newValue} /> : null}
              </div>
            ) : null}
          </div>
        ))}
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

function Select({
  label,
  value,
  onChange,
  all,
  children
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  all: string;
  children: React.ReactNode;
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
        {children}
      </select>
    </label>
  );
}

function Details({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="rounded border border-border bg-background p-2">
      <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}
