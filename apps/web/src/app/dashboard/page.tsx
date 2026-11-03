import { CreditCard, ReceiptText, Utensils } from "lucide-react";
import { BackendPersistenceWorkspace } from "@/components/backend-persistence-workspace";
import { DashboardDepartments } from "@/components/dashboard-departments";
import { DashboardDisclosure } from "@/components/dashboard-disclosure";
import { RouteGuard } from "@/components/route-guard";
import { SystemStatus } from "@/components/system-status";
import { Badge } from "@/components/ui/badge";
import { MobileNavigation } from "@/components/mobile-navigation";
import {
  DashboardDataProvider,
  DashboardHeaderActions,
  DashboardHeaderBadges,
  DashboardKpiCards,
  HotelCoreCards,
  LatestJournalPanel
} from "@/components/dashboard-live-summary";
import { navigation, paymentPolicies, phaseStatus } from "@/lib/foundation-data";

export default function Home() {
  return (
    <RouteGuard requiredPermissions={["dashboard.view"]}>
      <DashboardDataProvider>
        <main className="responsive-workspace min-h-screen">
          <div className="grid min-h-screen lg:grid-cols-[264px_1fr]">
            <aside className="border-b border-border bg-white/88 px-4 py-4 lg:border-b-0 lg:border-r lg:py-5">
              <div className="mb-3 flex items-center gap-3 lg:mb-7">
                <div className="flex h-10 w-10 items-center justify-center rounded bg-primary text-primary-foreground">
                  <ReceiptText className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-bold">HMS Platform</p>
                  <p className="text-xs text-muted-foreground">Hotel operations</p>
                </div>
              </div>
              <MobileNavigation>
                <nav aria-label="Dashboard sections" className="space-y-1">
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
                <a
                  href="/pos-terminal"
                  className="mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Utensils className="h-4 w-4" aria-hidden="true" />
                  Open POS terminal
                </a>
              </MobileNavigation>
            </aside>
            <section className="min-w-0 px-3 py-4 sm:px-5 sm:py-5 md:px-8">
              <header
                id="dashboard"
                className="mb-6 flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <DashboardHeaderBadges />
                  </div>
                  <h1 className="text-2xl font-bold leading-tight md:text-3xl">Hotel Dashboard</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    A quick overview of your hotel. Open a department below when you need it.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <DashboardHeaderActions />
                </div>
              </header>
              <div className="mb-5">
                <SystemStatus />
              </div>
              <DashboardKpiCards />
              <DashboardDepartments />
              <div className="mt-5 space-y-3">
                <DashboardDisclosure title="Room overview">
                  <HotelCoreCards />
                </DashboardDisclosure>
                <DashboardDisclosure title="Latest accounting entry">
                  <LatestJournalPanel />
                </DashboardDisclosure>
                <DashboardDisclosure title="Payment receipt guide">
                  <div className="mb-3 flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">
                      External receipt IDs are captured separately from system receipts.
                    </p>
                  </div>
                  <div className="divide-y divide-border">
                    {paymentPolicies.map((policy) => (
                      <div key={policy.method} className="flex flex-wrap items-center justify-between gap-3 py-3">
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
                </DashboardDisclosure>
                <DashboardDisclosure title="System information">
                  <div className="mb-5 grid gap-2 sm:grid-cols-2">
                    {phaseStatus.map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between gap-3 rounded border border-border p-3 text-sm"
                      >
                        <span>{item.label}</span>
                        <span className="font-semibold">{item.status}</span>
                      </div>
                    ))}
                  </div>
                  <BackendPersistenceWorkspace />
                </DashboardDisclosure>
              </div>
            </section>
          </div>
        </main>
      </DashboardDataProvider>
    </RouteGuard>
  );
}
