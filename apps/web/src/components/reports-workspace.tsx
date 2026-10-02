"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  BarChart3,
  BedDouble,
  Download,
  FileBarChart2,
  Printer,
  RefreshCcw,
  TrendingUp,
  WalletCards,
  Warehouse
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api-client";

type RevenueLine = {
  label: string;
  amount: number;
  target: number;
};

type AgingLine = {
  bucket: string;
  ar: number;
  ap: number;
};

type InventoryVariance = {
  item: string;
  systemQty: number;
  countedQty: number;
  unitCost: number;
};

type ExportLog = {
  id: string;
  reportName: string;
  range: string;
  format: string;
  createdAt: string;
};

type DailyReportType = "room-chart" | "pos";

type DailyReports = {
  date: string;
  generatedAt: string;
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
    rows: Array<{
      roomNumber: string;
      roomType: string;
      floor: string;
      occupancyStatus: string;
      housekeepingStatus: string;
      maintenanceStatus: string;
      guestName: string;
      reservationNumber: string;
      arrivalDate: string | null;
      departureDate: string | null;
      folioNumber: string;
      balance: string;
    }>;
  };
  pos: {
    summary: {
      orderCount: number;
      grossSales: string;
      paidSales: string;
      taxTotal: string;
      averageOrder: string;
    };
    outletTotals: Array<{ name: string; amount: string }>;
    paymentTotals: Array<{ method: string; amount: string }>;
    rows: Array<{
      orderNumber: string;
      outletName: string;
      terminalName: string;
      tableNumber: string;
      serviceType: string;
      status: string;
      itemCount: number;
      subtotal: string;
      taxTotal: string;
      grandTotal: string;
      paidTotal: string;
      createdAt: string;
      payments: Array<{
        method: string;
        amount: string;
        receiptNumber: string;
        externalReceiptNumber?: string | null;
        externalReference?: string | null;
      }>;
    }>;
  };
};

const demoRevenue: RevenueLine[] = [
  { label: "Room revenue", amount: 5600, target: 6200 },
  { label: "Restaurant revenue", amount: 2840, target: 2600 },
  { label: "Bar revenue", amount: 930, target: 900 },
  { label: "Other revenue", amount: 410, target: 500 }
];

const demoAging: AgingLine[] = [
  { bucket: "0-30 days", ar: 940, ap: 680 },
  { bucket: "31-60 days", ar: 410, ap: 320 },
  { bucket: "61-90 days", ar: 160, ap: 240 },
  { bucket: "90+ days", ar: 40, ap: 860 }
];

const demoInventoryVariance: InventoryVariance[] = [
  { item: "Chicken Fillets", systemQty: 18, countedQty: 17.5, unitCost: 5.4 },
  { item: "Coffee Beans", systemQty: 5, countedQty: 4.25, unitCost: 8.2 },
  { item: "Laundry Detergent", systemQty: 14, countedQty: 14, unitCost: 3.1 }
];

const reportTypes = [
  "Daily manager report",
  "Daily room chart",
  "Daily POS report",
  "Revenue summary",
  "Occupancy report",
  "AR and AP aging",
  "Inventory variance",
  "Finance close pack"
];

const dailyReportOptions: Array<{ label: string; value: DailyReportType }> = [
  { label: "Room chart of the day", value: "room-chart" },
  { label: "POS report of the day", value: "pos" }
];

export function ReportsWorkspace() {
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("Load reports to review management analytics.");
  const [busy, setBusy] = useState(false);
  const [dateRange, setDateRange] = useState({
    from: "2026-08-01",
    to: "2026-08-31"
  });
  const [dailyDate, setDailyDate] = useState(todayInputValue());
  const [dailyReportType, setDailyReportType] = useState<DailyReportType>("room-chart");
  const [dailyReports, setDailyReports] = useState<DailyReports | null>(null);
  const [reportForm, setReportForm] = useState({
    reportName: "Daily manager report",
    format: "PDF"
  });
  const [exports, setExports] = useState<ExportLog[]>([]);

  const revenue = loaded ? demoRevenue : [];
  const aging = loaded ? demoAging : [];
  const inventoryVariance = loaded ? demoInventoryVariance : [];

  const totals = useMemo(() => {
    const revenueTotal = revenue.reduce((sum, line) => sum + line.amount, 0);
    const targetTotal = revenue.reduce((sum, line) => sum + line.target, 0);
    const arTotal = aging.reduce((sum, line) => sum + line.ar, 0);
    const apTotal = aging.reduce((sum, line) => sum + line.ap, 0);
    const inventoryVarianceValue = inventoryVariance.reduce(
      (sum, line) => sum + (line.countedQty - line.systemQty) * line.unitCost,
      0
    );

    return { revenueTotal, targetTotal, arTotal, apTotal, inventoryVarianceValue };
  }, [aging, inventoryVariance, revenue]);

  const occupancy = loaded ? 72 : 0;
  const availableRooms = 62;
  const occupiedRooms = Math.round((availableRooms * occupancy) / 100);
  const adr = occupiedRooms ? totals.revenueTotal / occupiedRooms : 0;
  const revPar = totals.revenueTotal / availableRooms;
  const targetProgress = totals.targetTotal ? Math.round((totals.revenueTotal / totals.targetTotal) * 100) : 0;

  async function loadReports() {
    setLoaded(true);
    await loadDailyReports();
  }

  async function loadDailyReports() {
    setBusy(true);
    const result = await apiRequest<DailyReports>(`/reports/daily?date=${encodeURIComponent(dailyDate)}`);
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setLoaded(true);
    setDailyReports(result.data);
    setMessage(`${selectedDailyReportLabel(dailyReportType)} loaded for ${formatReportDate(result.data.date)}.`);
  }

  function exportReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!loaded) {
      setMessage("Load report data before creating an export.");
      return;
    }

    const exportLog: ExportLog = {
      id: createLocalId("report"),
      reportName: reportForm.reportName,
      range: `${dateRange.from} to ${dateRange.to}`,
      format: reportForm.format,
      createdAt: new Date().toISOString()
    };
    setExports((current) => [exportLog, ...current]);
    setMessage(`${reportForm.reportName} queued as ${reportForm.format}.`);
  }

  function printDailyReport() {
    if (!dailyReports) {
      setMessage("Load the daily report before printing.");
      return;
    }

    if (dailyReportType === "room-chart") {
      openPrintWindow(
        `Room Chart ${dailyReports.date}`,
        renderRoomChartReport(dailyReports),
        "Room Chart Report"
      );
      return;
    }

    openPrintWindow(`POS Report ${dailyReports.date}`, renderPosReport(dailyReports), "POS Report");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">Management Reports Workspace</h3>
            <p className="text-sm text-muted-foreground">Review KPIs, aging, inventory variance, and report exports.</p>
          </div>
          <Button type="button" variant="secondary" onClick={loadReports}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Load reports
          </Button>
        </div>

        <p className="rounded border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">{message}</p>

        <div className="rounded border border-border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <FileBarChart2 className="h-4 w-4 text-primary" aria-hidden="true" />
              <h4 className="font-bold">Daily Printable Reports</h4>
            </div>
            <Badge>{dailyReports ? formatReportDate(dailyReports.date) : "Not loaded"}</Badge>
          </div>
          <div className="grid gap-3 p-4 lg:grid-cols-[180px_1fr_auto_auto] lg:items-end">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Business date</span>
              <Input type="date" value={dailyDate} onChange={(event) => setDailyDate(event.target.value)} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Report</span>
              <select
                aria-label="Daily report type"
                className="h-10 w-full rounded border border-border bg-white px-3 text-sm"
                value={dailyReportType}
                onChange={(event) => setDailyReportType(event.target.value as DailyReportType)}
              >
                {dailyReportOptions.map((report) => (
                  <option key={report.value} value={report.value}>
                    {report.label}
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" variant="secondary" onClick={() => void loadDailyReports()} disabled={busy}>
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
              Load day
            </Button>
            <Button type="button" onClick={printDailyReport} disabled={!dailyReports}>
              <Printer className="h-4 w-4" aria-hidden="true" />
              Print
            </Button>
          </div>
          <div className="border-t border-border p-4">
            {!dailyReports ? (
              <p className="text-sm text-muted-foreground">Choose a date and report, then load the day.</p>
            ) : dailyReportType === "room-chart" ? (
              <DailyRoomChartPreview report={dailyReports} />
            ) : (
              <DailyPosPreview report={dailyReports} />
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={BedDouble} label="Occupancy" value={`${occupancy}%`} detail={`${occupiedRooms}/${availableRooms} rooms`} />
          <MetricCard icon={TrendingUp} label="ADR" value={formatMoney(adr)} detail="Average daily rate" />
          <MetricCard icon={BarChart3} label="RevPAR" value={formatMoney(revPar)} detail="Revenue per available room" />
          <MetricCard icon={WalletCards} label="Revenue target" value={`${targetProgress}%`} detail={formatMoney(totals.revenueTotal)} />
        </div>

        <div className="rounded border border-border bg-white">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Revenue Mix</h4>
          </div>
          <div className="space-y-3 p-4">
            {revenue.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">No revenue report loaded yet.</p>
            ) : (
              revenue.map((line) => {
                const percent = totals.revenueTotal ? Math.round((line.amount / totals.revenueTotal) * 100) : 0;
                const targetPercent = line.target ? Math.round((line.amount / line.target) * 100) : 0;
                return (
                  <div key={line.label}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold">{line.label}</span>
                      <span className="tabular-nums">{formatMoney(line.amount)} - {targetPercent}% of target</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${Math.min(100, percent)}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded border border-border bg-white">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <FileBarChart2 className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">AR and AP Aging</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Bucket</th>
                  <th className="px-4 py-3 text-right font-semibold">AR</th>
                  <th className="px-4 py-3 text-right font-semibold">AP</th>
                  <th className="px-4 py-3 font-semibold">Priority</th>
                </tr>
              </thead>
              <tbody>
                {aging.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-muted-foreground" colSpan={4}>
                      No aging data loaded yet.
                    </td>
                  </tr>
                ) : (
                  aging.map((line) => (
                    <tr key={line.bucket} className="border-t border-border">
                      <td className="px-4 py-3 font-semibold">{line.bucket}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(line.ar)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(line.ap)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={line.bucket === "90+ days" ? "warning" : "neutral"}>
                          {line.bucket === "90+ days" ? "Escalate" : "Monitor"}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="border-t border-border bg-background/70 font-bold">
                <tr>
                  <td className="px-4 py-3">Totals</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(totals.arTotal)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(totals.apTotal)}</td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <form onSubmit={exportReport} className="rounded border border-border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Report Export</h4>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              aria-label="Report from date"
              type="date"
              value={dateRange.from}
              onChange={(event) => setDateRange({ ...dateRange, from: event.target.value })}
            />
            <Input
              aria-label="Report to date"
              type="date"
              value={dateRange.to}
              onChange={(event) => setDateRange({ ...dateRange, to: event.target.value })}
            />
            <select
              aria-label="Report type"
              className="h-10 rounded border border-border bg-white px-3 text-sm"
              value={reportForm.reportName}
              onChange={(event) => setReportForm({ ...reportForm, reportName: event.target.value })}
            >
              {reportTypes.map((report) => (
                <option key={report} value={report}>
                  {report}
                </option>
              ))}
            </select>
            <select
              aria-label="Report format"
              className="h-10 rounded border border-border bg-white px-3 text-sm"
              value={reportForm.format}
              onChange={(event) => setReportForm({ ...reportForm, format: event.target.value })}
            >
              <option value="PDF">PDF</option>
              <option value="XLSX">Excel</option>
              <option value="CSV">CSV</option>
            </select>
          </div>
          <Button className="mt-3">
            <Download className="h-4 w-4" aria-hidden="true" />
            Queue export
          </Button>
        </form>

        <div className="rounded border border-border bg-white">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Warehouse className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Inventory Variance</h4>
          </div>
          <div className="divide-y divide-border">
            {inventoryVariance.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">No inventory variance loaded yet.</div>
            ) : (
              inventoryVariance.map((line) => {
                const varianceQty = line.countedQty - line.systemQty;
                const varianceValue = varianceQty * line.unitCost;
                return (
                  <div key={line.item} className="px-4 py-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold">{line.item}</p>
                        <p className="text-muted-foreground">
                          System {line.systemQty.toFixed(2)} - Counted {line.countedQty.toFixed(2)}
                        </p>
                      </div>
                      <Badge tone={Math.abs(varianceValue) > 5 ? "warning" : "success"}>
                        {formatMoney(varianceValue)}
                      </Badge>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="border-t border-border px-4 py-3 text-sm font-semibold">
            Net variance: {formatMoney(totals.inventoryVarianceValue)}
          </div>
        </div>

        <div className="rounded border border-border bg-white">
          <div className="border-b border-border px-4 py-3">
            <h4 className="font-bold">Export Audit</h4>
          </div>
          <div className="divide-y divide-border">
            {exports.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">No report exports queued yet.</div>
            ) : (
              exports.map((entry) => (
                <div key={entry.id} className="px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{entry.reportName}</p>
                      <p className="text-muted-foreground">{entry.range}</p>
                    </div>
                    <Badge tone="primary">{entry.format}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Queued {formatDateTime(entry.createdAt)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DailyRoomChartPreview({ report }: { report: DailyReports }) {
  const summary = report.roomChart.summary;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <ReportFact label="Rooms" value={String(summary.totalRooms)} />
        <ReportFact label="Occupied" value={`${summary.occupied} / ${summary.occupancyPercent}%`} />
        <ReportFact label="Dirty" value={String(summary.dirty)} />
        <ReportFact label="Open balance" value={formatMoney(summary.openBalance)} />
      </div>
      <div className="max-h-[360px] overflow-auto rounded border border-border">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">Room</th>
              <th className="px-3 py-2 font-semibold">Type</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Guest</th>
              <th className="px-3 py-2 font-semibold">Folio</th>
              <th className="px-3 py-2 text-right font-semibold">Balance</th>
            </tr>
          </thead>
          <tbody>
            {report.roomChart.rows.map((room) => (
              <tr key={room.roomNumber} className="border-t border-border">
                <td className="px-3 py-2 font-semibold">Room {room.roomNumber}</td>
                <td className="px-3 py-2">{room.roomType}</td>
                <td className="px-3 py-2">{room.occupancyStatus}</td>
                <td className="px-3 py-2">{room.guestName || "-"}</td>
                <td className="px-3 py-2">{room.folioNumber || "-"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(room.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DailyPosPreview({ report }: { report: DailyReports }) {
  const summary = report.pos.summary;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <ReportFact label="Orders" value={String(summary.orderCount)} />
        <ReportFact label="Gross sales" value={formatMoney(summary.grossSales)} />
        <ReportFact label="Paid" value={formatMoney(summary.paidSales)} />
        <ReportFact label="Average order" value={formatMoney(summary.averageOrder)} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded border border-border p-3">
          <p className="mb-2 text-sm font-bold">By Outlet</p>
          {report.pos.outletTotals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No outlet sales for this day.</p>
          ) : (
            report.pos.outletTotals.map((line) => (
              <div key={line.name} className="flex justify-between gap-3 text-sm">
                <span>{line.name}</span>
                <span className="font-semibold tabular-nums">{formatMoney(line.amount)}</span>
              </div>
            ))
          )}
        </div>
        <div className="rounded border border-border p-3">
          <p className="mb-2 text-sm font-bold">By Payment</p>
          {report.pos.paymentTotals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed payments for this day.</p>
          ) : (
            report.pos.paymentTotals.map((line) => (
              <div key={line.method} className="flex justify-between gap-3 text-sm">
                <span>{line.method.replaceAll("_", " ")}</span>
                <span className="font-semibold tabular-nums">{formatMoney(line.amount)}</span>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="max-h-[360px] overflow-auto rounded border border-border">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">Order</th>
              <th className="px-3 py-2 font-semibold">Outlet</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 text-right font-semibold">Items</th>
              <th className="px-3 py-2 text-right font-semibold">Total</th>
              <th className="px-3 py-2 text-right font-semibold">Paid</th>
              <th className="px-3 py-2 font-semibold">Time</th>
            </tr>
          </thead>
          <tbody>
            {report.pos.rows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-muted-foreground" colSpan={7}>
                  No POS orders for this day.
                </td>
              </tr>
            ) : (
              report.pos.rows.map((order) => (
                <tr key={order.orderNumber} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold">{order.orderNumber}</td>
                  <td className="px-3 py-2">{order.outletName}</td>
                  <td className="px-3 py-2">{order.status}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{order.itemCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(order.grandTotal)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(order.paidTotal)}</td>
                  <td className="px-3 py-2">{formatTime(order.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-background px-3 py-2">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-bold">{value}</p>
    </div>
  );
}

function MetricCard({
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

function formatMoney(value: number | string) {
  const amount = typeof value === "number" ? value : Number(value);
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatReportDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function selectedDailyReportLabel(reportType: DailyReportType) {
  return dailyReportOptions.find((report) => report.value === reportType)?.label ?? "Daily report";
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function renderRoomChartReport(report: DailyReports) {
  const summary = report.roomChart.summary;
  return `
    <section class="summary">
      <div><span>Total rooms</span><strong>${summary.totalRooms}</strong></div>
      <div><span>Occupied</span><strong>${summary.occupied}</strong></div>
      <div><span>Available</span><strong>${summary.available}</strong></div>
      <div><span>Reserved</span><strong>${summary.reserved}</strong></div>
      <div><span>Dirty</span><strong>${summary.dirty}</strong></div>
      <div><span>Open balance</span><strong>${formatMoney(summary.openBalance)}</strong></div>
    </section>
    <table>
      <thead>
        <tr>
          <th>Room</th>
          <th>Type</th>
          <th>Status</th>
          <th>Housekeeping</th>
          <th>Guest</th>
          <th>Folio</th>
          <th class="num">Balance</th>
        </tr>
      </thead>
      <tbody>
        ${report.roomChart.rows
          .map(
            (room) => `
              <tr>
                <td>Room ${escapeHtml(room.roomNumber)}</td>
                <td>${escapeHtml(room.roomType)}</td>
                <td>${escapeHtml(room.occupancyStatus)}</td>
                <td>${escapeHtml(room.housekeepingStatus)}</td>
                <td>${escapeHtml(room.guestName || "-")}</td>
                <td>${escapeHtml(room.folioNumber || "-")}</td>
                <td class="num">${formatMoney(room.balance)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderPosReport(report: DailyReports) {
  const summary = report.pos.summary;
  return `
    <section class="summary">
      <div><span>Orders</span><strong>${summary.orderCount}</strong></div>
      <div><span>Gross sales</span><strong>${formatMoney(summary.grossSales)}</strong></div>
      <div><span>Paid sales</span><strong>${formatMoney(summary.paidSales)}</strong></div>
      <div><span>Tax</span><strong>${formatMoney(summary.taxTotal)}</strong></div>
      <div><span>Average order</span><strong>${formatMoney(summary.averageOrder)}</strong></div>
    </section>
    <h2>Outlet Totals</h2>
    <table>
      <tbody>
        ${
          report.pos.outletTotals.length
            ? report.pos.outletTotals
                .map((line) => `<tr><td>${escapeHtml(line.name)}</td><td class="num">${formatMoney(line.amount)}</td></tr>`)
                .join("")
            : `<tr><td colspan="2">No outlet sales for this day.</td></tr>`
        }
      </tbody>
    </table>
    <h2>Orders</h2>
    <table>
      <thead>
        <tr>
          <th>Order</th>
          <th>Outlet</th>
          <th>Service</th>
          <th>Status</th>
          <th class="num">Items</th>
          <th class="num">Total</th>
          <th class="num">Paid</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        ${
          report.pos.rows.length
            ? report.pos.rows
                .map(
                  (order) => `
                    <tr>
                      <td>${escapeHtml(order.orderNumber)}</td>
                      <td>${escapeHtml(order.outletName)}</td>
                      <td>${escapeHtml(order.serviceType)}</td>
                      <td>${escapeHtml(order.status)}</td>
                      <td class="num">${order.itemCount}</td>
                      <td class="num">${formatMoney(order.grandTotal)}</td>
                      <td class="num">${formatMoney(order.paidTotal)}</td>
                      <td>${escapeHtml(formatTime(order.createdAt))}</td>
                    </tr>
                  `
                )
                .join("")
            : `<tr><td colspan="8">No POS orders for this day.</td></tr>`
        }
      </tbody>
    </table>
  `;
}

function openPrintWindow(title: string, body: string, heading: string) {
  const printWindow = window.open("", "_blank", "width=960,height=720");
  if (!printWindow) return;

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { color: #111; font-family: Arial, sans-serif; margin: 24px; }
          h1 { font-size: 22px; margin: 0; }
          h2 { font-size: 15px; margin: 24px 0 8px; }
          .meta { color: #555; font-size: 12px; margin: 6px 0 20px; }
          .summary { display: grid; gap: 8px; grid-template-columns: repeat(3, 1fr); margin: 16px 0 20px; }
          .summary div { border: 1px solid #ddd; padding: 10px; }
          .summary span { color: #666; display: block; font-size: 11px; text-transform: uppercase; }
          .summary strong { display: block; font-size: 16px; margin-top: 4px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; font-size: 12px; padding: 7px; text-align: left; }
          th { background: #f1f5f3; color: #333; text-transform: uppercase; }
          .num { text-align: right; }
          @media print { body { margin: 12mm; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(heading)}</h1>
        <p class="meta">${escapeHtml(title)} - Printed ${escapeHtml(new Date().toLocaleString())}</p>
        ${body}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
