"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileText,
  RefreshCcw,
  Save,
  Server,
  ShieldCheck
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type PersistenceState = "PREVIEW" | "SCHEMA_READY" | "API_READY" | "DB_READY" | "BLOCKED";
type PreflightState = "PASS" | "ACTION" | "WAITING";

type PersistenceModule = {
  id: string;
  name: string;
  owner: string;
  datastore: string;
  apiSurface: string;
  state: PersistenceState;
  checks: string[];
};

type PreflightCheck = {
  id: string;
  label: string;
  detail: string;
  state: PreflightState;
};

type TransitionEvent = {
  id: string;
  action: string;
  detail: string;
  createdAt: string;
};

const demoModules: PersistenceModule[] = [
  {
    id: "front-office",
    name: "Front Office",
    owner: "Rooms team",
    datastore: "Guests, reservations, folios, room status",
    apiSurface: "/front-office/*",
    state: "DB_READY",
    checks: ["Prisma models exist", "Overlap validation", "Folio audit records", "Permission guard"]
  },
  {
    id: "pos",
    name: "POS Cashier",
    owner: "F&B cashier",
    datastore: "Outlets, orders, order items, payments",
    apiSurface: "/pos/*",
    state: "DB_READY",
    checks: ["Order endpoint", "Payment endpoint", "External receipt duplicate check", "Paid-sale journal hook"]
  },
  {
    id: "inventory",
    name: "Inventory Control",
    owner: "Stores",
    datastore: "Items, locations, stock balances, movements",
    apiSurface: "/inventory/*",
    state: "SCHEMA_READY",
    checks: ["Stock movement schema", "Weighted average cost service", "Issue/transfer endpoints", "Variance audit"]
  },
  {
    id: "purchasing",
    name: "Purchasing and AP",
    owner: "Procurement",
    datastore: "Suppliers, purchase orders, GRN, invoices",
    apiSurface: "/purchasing/*",
    state: "SCHEMA_READY",
    checks: ["Supplier schema", "PO approval route", "Invoice matching service", "AP posting audit"]
  },
  {
    id: "finance",
    name: "Finance Close",
    owner: "Finance",
    datastore: "Accounts, periods, journals, journal lines",
    apiSurface: "/accounting/*",
    state: "DB_READY",
    checks: ["Balanced journals", "Period lock validation", "Posting status", "Close audit event"]
  },
  {
    id: "reports",
    name: "Management Reports",
    owner: "General manager",
    datastore: "Report snapshots and export queue",
    apiSurface: "/reports/*",
    state: "SCHEMA_READY",
    checks: ["KPI query views", "Export queue table", "Format permissions", "Export audit"]
  },
  {
    id: "admin",
    name: "Administration",
    owner: "System admin",
    datastore: "Users, roles, permissions, settings, audit",
    apiSurface: "/users, /iam, /properties, /audit",
    state: "API_READY",
    checks: ["Role APIs", "Settings APIs", "Audit search", "MFA policy hook"]
  },
  {
    id: "offline-sync",
    name: "Offline POS Sync",
    owner: "Outlet supervisor",
    datastore: "Terminals, devices, sync queue, conflicts",
    apiSurface: "/sync/*",
    state: "SCHEMA_READY",
    checks: ["Terminal schema", "Idempotency ledger", "Conflict resolution route", "Retry audit"]
  }
];

const initialPreflight: PreflightCheck[] = [
  {
    id: "schema",
    label: "Schema coverage",
    detail: "Foundation, front office, POS, accounting, and audit schema exist.",
    state: "PASS"
  },
  {
    id: "migrations",
    label: "Migration run",
    detail: "Migration source exists; apply it once PostgreSQL is running.",
    state: "WAITING"
  },
  {
    id: "api",
    label: "API readiness map",
    detail: "Persistence status and transition endpoints are available for saved workflows.",
    state: "PASS"
  },
  {
    id: "client",
    label: "Generated database client",
    detail: "Prisma client regenerated with POS, inventory, purchasing, reports, sync, and persistence models.",
    state: "PASS"
  },
  {
    id: "tests",
    label: "Save-and-reload tests",
    detail: "Add module tests that create records, reload them, and verify audit history.",
    state: "ACTION"
  }
];

const fallbackEvents: TransitionEvent[] = [
  {
    id: "waiting",
    action: "Waiting",
    detail: "Load the persistence map to review database readiness.",
    createdAt: "Pending"
  }
];

const stateWeight: Record<PersistenceState, number> = {
  PREVIEW: 25,
  SCHEMA_READY: 45,
  API_READY: 65,
  DB_READY: 100,
  BLOCKED: 0
};

const stateLabels: Record<PersistenceState, string> = {
  PREVIEW: "Needs API",
  SCHEMA_READY: "Schema ready",
  API_READY: "API ready",
  DB_READY: "Database ready",
  BLOCKED: "Needs decision"
};

const stateTone: Record<PersistenceState, "primary" | "success" | "warning" | "danger" | "neutral"> = {
  PREVIEW: "neutral",
  SCHEMA_READY: "warning",
  API_READY: "primary",
  DB_READY: "success",
  BLOCKED: "danger"
};

const preflightTone: Record<PreflightState, "primary" | "success" | "warning" | "danger" | "neutral"> = {
  PASS: "success",
  ACTION: "warning",
  WAITING: "neutral"
};

export function BackendPersistenceWorkspace() {
  const [modules, setModules] = useState<PersistenceModule[]>([]);
  const [selectedId, setSelectedId] = useState("pos");
  const [preflight, setPreflight] = useState(initialPreflight);
  const [events, setEvents] = useState<TransitionEvent[]>([]);
  const [message, setMessage] = useState("Load the persistence map to review saved database workflow coverage.");

  const activeModules = modules.length ? modules : demoModules;
  const selectedModule = activeModules.find((module) => module.id === selectedId) ?? activeModules[0];

  const metrics = useMemo(() => {
    const databaseReady = activeModules.filter((module) => module.state === "DB_READY").length;
    const apiReady = activeModules.filter((module) => module.state === "API_READY").length;
    const schemaReady = activeModules.filter((module) => module.state === "SCHEMA_READY").length;
    const previewOnly = activeModules.filter((module) => module.state === "PREVIEW").length;
    const score = Math.round(
      activeModules.reduce((total, module) => total + stateWeight[module.state], 0) / activeModules.length
    );

    return { databaseReady, apiReady, schemaReady, previewOnly, score };
  }, [activeModules]);

  function loadPersistenceMap() {
    setModules(demoModules.map(cloneModule));
    setPreflight(initialPreflight.map((check) => ({ ...check })));
    setEvents([
      createEvent("Persistence map loaded", "Module status, API surfaces, and database readiness checks loaded.")
    ]);
    setMessage("Persistence map loaded.");
  }

  function runPreflight() {
    setPreflight((current) =>
      current.map((check) =>
        check.id === "api"
          ? { ...check, detail: "Persistence status endpoint and transition endpoint are ready in the API source.", state: "PASS" }
          : check
      )
    );
    addEvent("Preflight checked", "Schema, migration, client, API, and test readiness reviewed.");
    setMessage("Preflight finished. Start PostgreSQL, apply the migration, then add save-and-reload tests.");
  }

  function markApiReady(moduleId: string) {
    const module = activeModules.find((entry) => entry.id === moduleId);
    if (!module) return;

    setModules((current) =>
      baseModules(current).map((entry) =>
        entry.id === moduleId && entry.state === "PREVIEW" ? { ...entry, state: "API_READY" } : entry
      )
    );
    addEvent("API contract marked ready", `${module.name} is queued for persisted saves through ${module.apiSurface}.`);
    setMessage(`${module.name} API contract marked ready.`);
  }

  function markDatabaseReady(moduleId: string) {
    const module = activeModules.find((entry) => entry.id === moduleId);
    if (!module) return;

    if (module.state === "PREVIEW") {
      setMessage(`${module.name} still needs its API contract before it can be marked database ready.`);
      addEvent("Database step blocked", `${module.name} needs API routes and validation before database readiness.`);
      return;
    }

    setModules((current) =>
      baseModules(current).map((entry) => (entry.id === moduleId ? { ...entry, state: "DB_READY" } : entry))
    );
    addEvent("Database readiness confirmed", `${module.name} is marked ready for persisted create, update, reload, and audit tests.`);
    setMessage(`${module.name} marked database ready for testing.`);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded border border-border bg-background/70 p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-muted-foreground">Readiness</span>
            <Database className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <p className="text-2xl font-bold">{metrics.score}%</p>
          <p className="mt-1 text-sm text-muted-foreground">Average module persistence score</p>
        </div>
        <div className="rounded border border-border bg-background/70 p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-muted-foreground">Database ready</span>
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
          </div>
          <p className="text-2xl font-bold">{metrics.databaseReady}</p>
          <p className="mt-1 text-sm text-muted-foreground">Persisted workflows</p>
        </div>
        <div className="rounded border border-border bg-background/70 p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-muted-foreground">API ready</span>
            <Server className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <p className="text-2xl font-bold">{metrics.apiReady}</p>
          <p className="mt-1 text-sm text-muted-foreground">Routes before migrations</p>
        </div>
        <div className="rounded border border-border bg-background/70 p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-muted-foreground">Schema ready</span>
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
          </div>
          <p className="text-2xl font-bold">{metrics.schemaReady}</p>
          <p className="mt-1 text-sm text-muted-foreground">Need endpoint work</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded border border-border bg-muted/45 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold">{message}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Each hotel area is tracked against saved API, database, audit, permission, and test coverage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={loadPersistenceMap}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Load map
          </Button>
          <Button onClick={runPreflight}>
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
            Run preflight
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded border border-border bg-white">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-bold">Module persistence map</h3>
          </div>
          <div className="grid gap-0 sm:grid-cols-2">
            {activeModules.map((module) => {
              const selected = module.id === selectedModule.id;
              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => setSelectedId(module.id)}
                  className={`border-b border-border px-4 py-4 text-left transition-colors sm:odd:border-r ${
                    selected ? "bg-primary/10" : "bg-white hover:bg-muted/45"
                  }`}
                  aria-pressed={selected}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{module.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{module.owner}</p>
                    </div>
                    <Badge tone={stateTone[module.state]}>{stateLabels[module.state]}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{module.datastore}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded border border-border bg-white">
          <div className="border-b border-border px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold">{selectedModule.name} transition</h3>
                <p className="mt-1 text-sm text-muted-foreground">{selectedModule.apiSurface}</p>
              </div>
              <Badge tone={stateTone[selectedModule.state]}>{stateLabels[selectedModule.state]}</Badge>
            </div>
          </div>
          <div className="space-y-4 p-4">
            <div className="rounded border border-border bg-background/70 p-4">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                <p className="text-sm font-bold">Required checks</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {selectedModule.checks.map((check) => (
                  <div key={check} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                    <span>{check}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="secondary" onClick={() => markApiReady(selectedModule.id)}>
                <Server className="h-4 w-4" aria-hidden="true" />
                Mark API ready
              </Button>
              <Button onClick={() => markDatabaseReady(selectedModule.id)}>
                <Save className="h-4 w-4" aria-hidden="true" />
                Mark database ready
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_0.85fr]">
        <div className="rounded border border-border bg-white">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-bold">Persistence preflight</h3>
          </div>
          <div className="divide-y divide-border">
            {preflight.map((check) => (
              <div key={check.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">{check.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{check.detail}</p>
                  </div>
                </div>
                <Badge tone={preflightTone[check.state]}>{check.state}</Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded border border-border bg-white">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-bold">Transition log</h3>
          </div>
          <div className="max-h-[320px] divide-y divide-border overflow-y-auto">
            {(events.length ? events : fallbackEvents).map((event) => (
              <div key={event.id} className="px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{event.action}</p>
                  <span className="text-xs font-medium text-muted-foreground">{event.createdAt}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{event.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  function addEvent(action: string, detail: string) {
    setEvents((current) => [createEvent(action, detail), ...current].slice(0, 8));
  }
}

function baseModules(current: PersistenceModule[]) {
  return (current.length ? current : demoModules).map(cloneModule);
}

function cloneModule(module: PersistenceModule): PersistenceModule {
  return { ...module, checks: [...module.checks] };
}

function createEvent(action: string, detail: string): TransitionEvent {
  return {
    id: `${action.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
    action,
    detail,
    createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  };
}
