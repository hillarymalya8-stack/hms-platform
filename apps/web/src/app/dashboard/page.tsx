import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Cloud,
  CreditCard,
  Database,
  FileBarChart2,
  FileClock,
  Landmark,
  ListChecks,
  ReceiptText,
  ShieldCheck,
  Utensils,
  Wifi,
  Warehouse
} from "lucide-react";
import { AdminWorkspace } from "@/components/admin-workspace";
import { BackendPersistenceWorkspace } from "@/components/backend-persistence-workspace";
import { FinanceWorkspace } from "@/components/finance-workspace";
import { FrontOfficeWorkspace } from "@/components/front-office-workspace";
import { InventoryWorkspace } from "@/components/inventory-workspace";
import { OfflineSyncWorkspace } from "@/components/offline-sync-workspace";
import { PosWorkspace } from "@/components/pos-workspace";
import { PurchasingWorkspace } from "@/components/purchasing-workspace";
import { ReportsWorkspace } from "@/components/reports-workspace";
import { RouteGuard } from "@/components/route-guard";
import { SystemStatus } from "@/components/system-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import {
  foundationCards,
  hotelCoreCards,
  navigation,
  paymentPolicies,
  phaseStatus,
  reservationRules,
  sampleJournal
} from "@/lib/foundation-data";

export default function Home() {
  return (
    <RouteGuard requiredPermissions={["dashboard.view"]}>
      <main className="min-h-screen">
        <div className="grid min-h-screen lg:grid-cols-[264px_1fr]">
        <aside className="border-r border-border bg-white/88 px-4 py-5">
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-primary text-primary-foreground">
              <ReceiptText className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold">HMS Platform</p>
              <p className="text-xs text-muted-foreground">Hotel operations</p>
            </div>
          </div>

          <nav className="space-y-1">
            {navigation.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={
                  item.active
                    ? "inline-flex h-10 w-full items-center justify-start gap-2 rounded border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                    : "inline-flex h-10 w-full items-center justify-start gap-2 rounded px-4 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                }
                aria-current={item.active ? "page" : undefined}
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </a>
            ))}
          </nav>

          <div className="mt-8 rounded-lg border border-border bg-muted/55 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Cloud className="h-4 w-4 text-success" aria-hidden="true" />
              Netlify ready
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Web dashboard and POS terminal are separated, with live database access required for saved work.
            </p>
            <a
              href="/pos-terminal"
              className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Utensils className="h-4 w-4" aria-hidden="true" />
              Open POS terminal
            </a>
          </div>
        </aside>

        <section className="px-5 py-5 md:px-8">
          <header id="dashboard" className="mb-6 scroll-mt-5 flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone="primary">Main Hotel</Badge>
                <Badge>Business date: Aug 31, 2026</Badge>
              </div>
              <h1 className="text-2xl font-bold leading-tight md:text-3xl">
                Hotel Operations System
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                One secured operating system for front office, POS, inventory, purchasing, finance, audit, and reports.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                Open date
              </Button>
              <Button>
                <FileClock className="h-4 w-4" aria-hidden="true" />
                Audit log
              </Button>
            </div>
          </header>

          <div className="mb-5">
            <SystemStatus />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {foundationCards.map((card) => (
              <Panel key={card.label} className="p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-muted-foreground">{card.label}</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded bg-muted">
                    <card.icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                </div>
                <p className="text-xl font-bold">{card.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{card.detail}</p>
              </Panel>
            ))}
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
            <Panel className="p-5">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">System Status</h2>
                  <p className="text-sm text-muted-foreground">Core modules required for daily hotel operations.</p>
                </div>
                <Badge tone="success">Operational build</Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {phaseStatus.map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded border border-border bg-background/70 px-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <item.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="truncate text-sm font-medium">{item.label}</span>
                    </div>
                    <span className="text-xs font-bold text-success">{item.status}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="p-5">
              <div className="mb-4">
                <h2 className="text-lg font-bold">Access Routing</h2>
                <p className="text-sm text-muted-foreground">
                  Staff now sign in from the login page and are routed to the system allowed by their credential.
                </p>
              </div>
              <div className="grid gap-2 text-sm">
                <a className="rounded border border-border bg-background/70 px-3 py-2 font-semibold hover:bg-muted" href="/finance">
                  Open Finance
                </a>
                <a className="rounded border border-border bg-background/70 px-3 py-2 font-semibold hover:bg-muted" href="/pos-terminal">
                  Open POS Terminal
                </a>
                <a className="rounded border border-border bg-background/70 px-3 py-2 font-semibold hover:bg-muted" href="/front-office">
                  Open Front Office
                </a>
              </div>
            </Panel>
          </div>

          <Panel id="front-office" className="mt-5 scroll-mt-5 p-5">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h2 className="text-lg font-bold">Hotel Core</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Rooms, guests, reservations, check-in, check-out, and folio creation are handled through the API.
                </p>
              </div>
              <Badge tone="primary">Live workflow</Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {hotelCoreCards.map((card) => (
                <div key={card.label} className="rounded border border-border bg-background/70 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-muted-foreground">{card.label}</span>
                    <card.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  </div>
                  <p className="text-xl font-bold">{card.value}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{card.detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded border border-border bg-white">
              <div className="border-b border-border px-4 py-3 text-sm font-bold">Reservation control rules</div>
              <div className="grid gap-0 md:grid-cols-2">
                {reservationRules.map((rule) => (
                  <div key={rule} className="flex items-start gap-2 border-b border-border px-4 py-3 text-sm last:border-b-0 md:odd:border-r">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                    <span>{rule}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <FrontOfficeWorkspace />
            </div>
          </Panel>

          <Panel id="pos" className="mt-5 scroll-mt-5 p-5">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Utensils className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h2 className="text-lg font-bold">POS Cashier</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Restaurant outlet sales, order totals, payment receipt IDs, duplicate reference checks, and paid-sale posting.
                </p>
              </div>
              <Badge tone="success">Linked terminal</Badge>
            </div>

            <PosWorkspace />
          </Panel>

          <Panel id="inventory" className="mt-5 scroll-mt-5 p-5">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Warehouse className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h2 className="text-lg font-bold">Inventory Control</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Stock receiving, weighted average cost, department issues, store transfers, reorder alerts, and finance postings.
                </p>
              </div>
              <Badge tone="success">Stock control</Badge>
            </div>

            <InventoryWorkspace />
          </Panel>

          <Panel id="purchasing" className="mt-5 scroll-mt-5 p-5">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h2 className="text-lg font-bold">Purchasing and AP</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Purchase orders, approval, goods receiving, supplier invoice matching, AP balance, and supplier payment postings.
                </p>
              </div>
              <Badge tone="success">Procure to pay</Badge>
            </div>

            <PurchasingWorkspace />
          </Panel>

          <Panel id="finance" className="mt-5 scroll-mt-5 p-5">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h2 className="text-lg font-bold">Finance Close and Reports</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  General ledger posting, trial balance, profit and loss, balance sheet, journal adjustments, and business date close.
                </p>
              </div>
              <Badge tone="success">Accounting control</Badge>
            </div>

            <FinanceWorkspace />
          </Panel>

          <Panel id="reports" className="mt-5 scroll-mt-5 p-5">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <FileBarChart2 className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h2 className="text-lg font-bold">Management Reports</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Occupancy KPIs, revenue mix, AR/AP aging, inventory variance, and export audit for management reporting.
                </p>
              </div>
              <Badge tone="success">Management reporting</Badge>
            </div>

            <ReportsWorkspace />
          </Panel>

          <Panel id="administration" className="mt-5 scroll-mt-5 p-5">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h2 className="text-lg font-bold">Administration and Audit</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  User invites, role permissions, MFA enforcement, property settings, numbering rules, and audit trail controls.
                </p>
              </div>
              <Badge tone="success">Access control</Badge>
            </div>

            <AdminWorkspace />
          </Panel>

          <Panel className="mt-5 p-5">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Wifi className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h2 className="text-lg font-bold">Offline POS and Sync</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Terminal health, offline sale queues, idempotent sync, conflict resolution, device readiness, and sync audit.
                </p>
              </div>
              <Badge tone="success">Terminal resilience</Badge>
            </div>

            <OfflineSyncWorkspace />
          </Panel>

          <Panel className="mt-5 p-5">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Database className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h2 className="text-lg font-bold">Backend Persistence</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Saved API, database, audit, permission, and test coverage for each hotel area.
                </p>
              </div>
              <Badge tone="primary">Database backed</Badge>
            </div>

            <BackendPersistenceWorkspace />
          </Panel>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <Panel className="overflow-hidden">
              <div className="border-b border-border p-5">
                <div className="flex items-center gap-3">
                  <CircleDollarSign className="h-5 w-5 text-primary" aria-hidden="true" />
                  <div>
                    <h2 className="text-lg font-bold">Accounting Validation</h2>
                    <p className="text-sm text-muted-foreground">Operational transactions will post through this balance rule.</p>
                  </div>
                </div>
              </div>
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
                    {sampleJournal.map((line) => (
                      <tr key={line.account} className="border-t border-border">
                        <td className="px-5 py-3 font-medium">{line.account}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{line.debit || "-"}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{line.credit || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border bg-background/70 font-bold">
                    <tr>
                      <td className="px-5 py-3">Totals</td>
                      <td className="px-5 py-3 text-right tabular-nums">100.00</td>
                      <td className="px-5 py-3 text-right tabular-nums">100.00</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="flex items-center gap-2 border-t border-border px-5 py-4 text-sm font-semibold text-success">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Balanced journal accepted
              </div>
            </Panel>

            <Panel className="overflow-hidden">
              <div className="border-b border-border p-5">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-primary" aria-hidden="true" />
                  <div>
                    <h2 className="text-lg font-bold">Payment Receipt Policy</h2>
                    <p className="text-sm text-muted-foreground">External receipt IDs are captured separately from system receipts.</p>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-border">
                {paymentPolicies.map((policy) => (
                  <div key={policy.method} className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <p className="font-semibold">{policy.method}</p>
                      <p className="text-sm text-muted-foreground">{policy.duplicateCheck}</p>
                    </div>
                    <Badge tone={policy.receiptRequired === "Yes" ? "warning" : "neutral"}>
                      Receipt ID: {policy.receiptRequired}
                    </Badge>
                  </div>
                ))}
              </div>
              <div className="flex items-start gap-2 border-t border-border px-5 py-4 text-sm text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                Posted payment reference changes require authorization and an audit record.
              </div>
            </Panel>
          </div>
        </section>
        </div>
      </main>
    </RouteGuard>
  );
}
