"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getApiBaseUrl, isDemoAuthEnabled } from "@/lib/auth";

type HealthResponse = {
  status: "ok" | "degraded";
  service: string;
  database?: "connected" | "unavailable";
  mode?: string;
  checkedAt?: string;
};

type StatusState =
  | { state: "checking" }
  | { state: "ready"; health: HealthResponse }
  | { state: "offline"; message: string };

export function SystemStatus() {
  const apiUrl = useMemo(() => getApiBaseUrl(), []);
  const demoMode = useMemo(() => isDemoAuthEnabled(), []);
  const [status, setStatus] = useState<StatusState>({ state: "checking" });

  useEffect(() => {
    if (demoMode) {
      return;
    }

    let cancelled = false;

    async function loadStatus() {
      try {
        const response = await fetch(`${apiUrl}/health`, { cache: "no-store" });
        const body = (await response.json()) as HealthResponse;

        if (!cancelled) {
          setStatus({ state: "ready", health: body });
        }
      } catch {
        if (!cancelled) {
          setStatus({ state: "offline", message: "API is not reachable from this browser." });
        }
      }
    }

    void loadStatus();
    const interval = window.setInterval(loadStatus, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [apiUrl, demoMode]);

  if (demoMode) {
    return (
      <div className="grid gap-3 rounded border border-warning/50 bg-warning/10 p-4 md:grid-cols-[auto_1fr_auto] md:items-center">
        <Server className="h-5 w-5 text-warning" aria-hidden="true" />
        <div>
          <p className="font-bold">Netlify demo mode</p>
          <p className="text-sm text-muted-foreground">
            The web system is open without a live API. Demo login works here; live hotel records need an API URL later.
          </p>
        </div>
        <Badge tone="warning">Demo</Badge>
      </div>
    );
  }

  if (status.state === "checking") {
    return (
      <div className="grid gap-3 rounded border border-border bg-white p-4 md:grid-cols-[auto_1fr_auto] md:items-center">
        <Server className="h-5 w-5 text-primary" aria-hidden="true" />
        <div>
          <p className="font-bold">Checking live system connection</p>
          <p className="text-sm text-muted-foreground">Verifying API and database status.</p>
        </div>
        <Badge>Checking</Badge>
      </div>
    );
  }

  if (status.state === "offline") {
    return (
      <div className="grid gap-3 rounded border border-danger/40 bg-danger/10 p-4 md:grid-cols-[auto_1fr_auto] md:items-center">
        <AlertTriangle className="h-5 w-5 text-danger" aria-hidden="true" />
        <div>
          <p className="font-bold">Backend connection required</p>
          <p className="text-sm text-muted-foreground">{status.message} Start the API, database, and Redis before using live hotel records.</p>
        </div>
        <Badge tone="danger">Offline</Badge>
      </div>
    );
  }

  const databaseReady = status.health.database === "connected";

  return (
    <div
      className={`grid gap-3 rounded border p-4 md:grid-cols-[auto_1fr_auto] md:items-center ${
        databaseReady ? "border-success/40 bg-success/10" : "border-warning/50 bg-warning/10"
      }`}
    >
      {databaseReady ? (
        <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
      ) : (
        <Database className="h-5 w-5 text-warning" aria-hidden="true" />
      )}
      <div>
        <p className="font-bold">{databaseReady ? "Live system connected" : "Database connection required"}</p>
        <p className="text-sm text-muted-foreground">
          {databaseReady
            ? "API and database are available for saved hotel operations."
            : "The API is running, but PostgreSQL is not connected, so saved records are unavailable."}
        </p>
      </div>
      <Badge tone={databaseReady ? "success" : "warning"}>{databaseReady ? "Operational" : "Setup needed"}</Badge>
    </div>
  );
}
