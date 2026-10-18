"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import {
  AlertTriangle,
  BedDouble,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  FileClock,
  Landmark,
  ReceiptText,
  Sparkles,
  Store,
  UserCheck,
  Wrench
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { apiRequest } from "@/lib/api-client";
import { readSession } from "@/lib/auth";

type DailyReport = {
  date: string;
  roomChart: {
    summary: {
      totalRooms: number;
      occupied: number;
      reserved: number;
      available: number;
      dirty: number;
      outOfService: number;
      occupancyPercent: number;
      openBalance: string;
    };
  };
  pos: {
    summary: {
      orderCount: number;
      grossSales: string;
      paidSales: string;
      taxTotal: string;
      averageOrder: string;
    };
  };
};

type JournalSummary = {
  id: string;
  entryNumber: string;
  sourceType: string;
  sourceNumber: string | null;
  status: string;
  description: string | null;
  postedAt: string | null;
  createdAt: string;
  totalDebit: string;
  totalCredit: string;
  lines: Array<{ id: string; accountCode: string; accountName: string; debitAmount: string; creditAmount: string }>;
};

type BusinessDateInfo = {
  current: { businessDate: string; status: string };
  draftJournalCount: number;
};

type Section<T> = { status: "loading" | "ready" | "denied" | "error"; data: T | null; error?: string };

type DashboardData = {
  propertyName: string | null;
  report: Section<DailyReport>;
  latestJournal: Section<JournalSummary | null>;
  businessDate: Section<BusinessDateInfo>;
};

const loadingSection = { status: "loading", data: null } as const;

const DashboardDataContext = createContext<DashboardData>({
  propertyName: null,
  report: loadingSection,
  latestJournal: loadingSection,
  businessDate: loadingSection
});

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardData>({
    propertyName: null,
    report: loadingSection,
    latestJournal: loadingSection,
    businessDate: loadingSection
  });

  useEffect(() => {
    let cancelled = false;
    const session = readSession();
    const permissions = session?.user.permissions ?? [];
    const has = (code: string) => permissions.includes(code);
    const update = (patch: Partial<DashboardData>) => {
      if (!cancelled) setData((current) => ({ ...current, ...patch }));
    };

    async function section<T>(permission: string, path: string, pick?: (value: never) => T): Promise<Section<T>> {
      if (!has(permission)) return { status: "denied", data: null };
      const result = await apiRequest<T>(path);
      if (!result.ok) return { status: "error", data: null, error: result.error };
      return { status: "ready", data: pick ? pick(result.data as never) : result.data };
    }

    void section<DailyReport>("reports.view", `/reports/daily?date=${localIsoDate()}`).then((report) => update({ report }));
    void section<JournalSummary | null>(
      "accounting.view",
      "/accounting/journals?status=POSTED&limit=1",
      (journals: JournalSummary[]) => journals[0] ?? null
    ).then((latestJournal) => update({ latestJournal }));
    void section<BusinessDateInfo>("accounting.view", "/accounting/business-date").then((businessDate) => update({ businessDate }));

    if (has("properties.view") && session?.user.defaultPropertyId) {
      void apiRequest<Array<{ id: string; name: string }>>("/properties").then((result) => {
        if (!result.ok) return;
        const property = result.data.find((entry) => entry.id === session.user.defaultPropertyId);
        if (property) update({ propertyName: property.name });
      });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return <DashboardDataContext.Provider value={data}>{children}</DashboardDataContext.Provider>;
}

function useDashboardData() {
  return useContext(DashboardDataContext);
}

export function DashboardHeaderBadges() {
  const { propertyName, businessDate } = useDashboardData();
  const label =
    businessDate.status === "ready" && businessDate.data
      ? `Business date: ${formatDate(businessDate.data.current.businessDate)}`
      : businessDate.status === "loading"
        ? "Business date: loading..."
        : null;

  return (
    <>
      {propertyName ? <Badge tone="primary">{propertyName}</Badge> : null}
      {label ? <Badge>{label}</Badge> : null}
    </>
  );
}

export function DashboardHeaderActions() {
  const linkClass =
    "inline-flex h-10 items-center justify-center gap-2 rounded px-4 text-sm font-semibold transition-colors";
  return (
    <>
      <a href="/finance" className={`${linkClass} border border-border bg-card text-foreground hover:bg-muted`}>
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
        Business date
      </a>
      <a href="/administration" className={`${linkClass} bg-primary text-primary-foreground hover:bg-primary/90`}>
        <FileClock className="h-4 w-4" aria-hidden="true" />
        Audit log
      </a>
    </>
  );
}

export function DashboardKpiCards() {
  const { report, latestJournal, businessDate } = useDashboardData();
  const rooms = report.data?.roomChart.summary;
  const pos = report.data?.pos.summary;

  const cards = [
    {
      label: "Occupancy",
      value: rooms ? `${rooms.occupancyPercent}%` : sectionPlaceholder(report),
      detail: rooms ? `${rooms.occupied} of ${rooms.totalRooms} rooms occupied` : sectionDetail(report, "Room occupancy"),
      icon: BedDouble
    },
    {
      label: "POS sales today",
      value: pos ? formatMoney(pos.grossSales) : sectionPlaceholder(report),
      detail: pos ? `${pos.orderCount} orders, ${formatMoney(pos.paidSales)} paid` : sectionDetail(report, "Outlet sales"),
      icon: Store
    },
    {
      label: "Open folio balance",
      value: rooms ? formatMoney(rooms.openBalance) : sectionPlaceholder(report),
      detail: rooms ? "Outstanding on in-house guest folios" : sectionDetail(report, "Guest folios"),
      icon: CircleDollarSign
    },
    {
      label: "Draft journals",
      value: businessDate.data ? String(businessDate.data.draftJournalCount) : sectionPlaceholder(businessDate),
      detail:
        businessDate.data
          ? latestJournal.data
            ? `Last posted ${latestJournal.data.entryNumber}`
            : "No journals posted yet"
          : sectionDetail(businessDate, "Ledger activity"),
      icon: Landmark
    }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Panel key={card.label} className="p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-muted-foreground">{card.label}</span>
            <div className="flex h-9 w-9 items-center justify-center rounded bg-muted">
              <card.icon className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <p className="text-xl font-bold tabular-nums">{card.value}</p>
          <p className="mt-1 text-sm text-muted-foreground">{card.detail}</p>
        </Panel>
      ))}
    </div>
  );
}

export function HotelCoreCards() {
  const { report } = useDashboardData();
  const rooms = report.data?.roomChart.summary;

  const cards = [
    { label: "Rooms", value: rooms?.totalRooms, detail: "Active rooms in inventory", icon: Building2 },
    { label: "In house", value: rooms?.occupied, detail: rooms ? `${rooms.reserved} more reserved` : "Occupied rooms", icon: UserCheck },
    { label: "Available", value: rooms?.available, detail: "Ready to sell tonight", icon: Sparkles },
    {
      label: "Dirty / out of service",
      value: rooms ? `${rooms.dirty} / ${rooms.outOfService}` : undefined,
      detail: "Housekeeping and maintenance",
      icon: Wrench
    }
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded border border-border bg-background/70 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-muted-foreground">{card.label}</span>
            <card.icon className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <p className="text-xl font-bold tabular-nums">{card.value ?? sectionPlaceholder(report)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{rooms ? card.detail : sectionDetail(report, card.detail)}</p>
        </div>
      ))}
    </div>
  );
}

export function LatestJournalPanel() {
  const { latestJournal } = useDashboardData();
  const journal = latestJournal.data;
  const balanced = journal ? Number(journal.totalDebit) === Number(journal.totalCredit) : false;

  return (
    <Panel className="overflow-hidden">
      <div className="border-b border-border p-5">
        <div className="flex items-center gap-3">
          <ReceiptText className="h-5 w-5 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-bold">Latest Posted Journal</h2>
            <p className="text-sm text-muted-foreground">
              {journal
                ? `${journal.entryNumber}${journal.description ? ` - ${journal.description}` : ""}${journal.postedAt ? `, posted ${formatDateTime(journal.postedAt)}` : ""}`
                : "Every posted journal must balance debits and credits."}
            </p>
          </div>
        </div>
      </div>
      {journal ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-semibold">Account</th>
                  <th className="px-5 py-3 text-right font-semibold">Debit</th>
                  <th className="px-5 py-3 text-right font-semibold">Credit</th>
                </tr>
              </thead>
              <tbody>
                {journal.lines.map((line) => (
                  <tr key={line.id} className="border-t border-border">
                    <td className="px-5 py-3 font-medium">
                      {line.accountCode} {line.accountName}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{Number(line.debitAmount) ? formatMoney(line.debitAmount) : "-"}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{Number(line.creditAmount) ? formatMoney(line.creditAmount) : "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border bg-background/70 font-bold">
                <tr>
                  <td className="px-5 py-3">Totals</td>
                  <td className="px-5 py-3 text-right tabular-nums">{formatMoney(journal.totalDebit)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{formatMoney(journal.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div
            className={`flex items-center gap-2 border-t border-border px-5 py-4 text-sm font-semibold ${balanced ? "text-success" : "text-danger"}`}
          >
            {balanced ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
            {balanced ? "Balanced journal posted" : "Journal is out of balance"}
          </div>
        </>
      ) : (
        <div className="px-5 py-8 text-sm text-muted-foreground">
          {latestJournal.status === "loading"
            ? "Loading journals..."
            : latestJournal.status === "denied"
              ? "You do not have access to accounting journals."
              : latestJournal.status === "error"
                ? latestJournal.error
                : "No journals have been posted yet."}{" "}
          {latestJournal.status === "ready" ? (
            <a className="font-semibold text-primary hover:underline" href="/finance">
              Open Finance
            </a>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function sectionPlaceholder(section: Section<unknown>) {
  return section.status === "loading" ? "..." : "-";
}

function sectionDetail(section: Section<unknown>, fallback: string) {
  if (section.status === "loading") return "Loading...";
  if (section.status === "denied") return "Not available for your role";
  if (section.status === "error") return section.error ?? "Could not load";
  return fallback;
}

function localIsoDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function formatMoney(value: string | number) {
  return new Intl.NumberFormat("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${value.slice(0, 10)}T00:00:00.000Z`)
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
