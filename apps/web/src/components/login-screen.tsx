"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, KeyRound, Landmark, LogIn, ShieldCheck, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SystemStatus } from "@/components/system-status";
import {
  demoAuthPassword,
  getApiBaseUrl,
  isDemoAuthEnabled,
  loginWithDemoCredentials,
  resolveHomePath,
  saveSession,
  type LoginResponse
} from "@/lib/auth";

type LoginState = "idle" | "loading" | "success" | "error";

const loginSystems = [
  { label: "POS", detail: "Cashier terminal", icon: Store },
  { label: "Finance", detail: "Accounts and close", icon: Landmark },
  { label: "Operations", detail: "Front office and stores", icon: Building2 },
  { label: "Admin", detail: "Users and permissions", icon: ShieldCheck }
];

export function LoginScreen() {
  const router = useRouter();
  const apiUrl = useMemo(() => getApiBaseUrl(), []);
  const demoMode = useMemo(() => isDemoAuthEnabled(), []);
  const [email, setEmail] = useState("admin@hotel.local");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<LoginState>("idle");
  const [message, setMessage] = useState(
    demoMode ? `Demo mode is ready. Use admin@hotel.local / ${demoAuthPassword}.` : "Use your assigned system credential."
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("loading");
    setMessage("Checking credential and access level...");

    if (demoMode) {
      const result = loginWithDemoCredentials(email, password);

      if (!result) {
        setState("error");
        setMessage(`Use a seeded staff email and password ${demoAuthPassword}.`);
        return;
      }

      saveSession(result);
      setState("success");
      setMessage(`Signed in as ${result.user.fullName}. Opening assigned system...`);

      const nextPath = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
      const target = nextPath && nextPath !== "/" && nextPath !== "/login" ? nextPath : resolveHomePath(result.user);
      router.replace(target);
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        setState("error");
        setMessage("Credential rejected. Check the email, password, and assigned role.");
        return;
      }

      const result = (await response.json()) as LoginResponse;
      saveSession(result);
      setState("success");
      setMessage(`Signed in as ${result.user.fullName}. Opening assigned system...`);

      const nextPath = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
      const target = nextPath && nextPath !== "/" && nextPath !== "/login" ? nextPath : resolveHomePath(result.user);
      router.replace(target);
    } catch {
      setState("error");
      setMessage("The API or database is offline. Start the backend services, then sign in again.");
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-[0.95fr_1.05fr]">
        <section className="flex min-h-[42vh] flex-col justify-between bg-[#163f35] p-6 text-white lg:min-h-screen lg:p-8">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded bg-white/10">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="mt-4 text-sm font-semibold text-white/75">HMS Platform</p>
            <h1 className="mt-3 max-w-xl text-3xl font-bold leading-tight md:text-4xl">Secure hotel system login</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/75">
              One credential opens only the system that staff member is allowed to use: POS, finance, front office,
              inventory, reports, or administration.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {loginSystems.map((system) => (
              <div key={system.label} className="rounded border border-white/15 bg-white/8 p-4">
                <system.icon className="h-5 w-5 text-white" aria-hidden="true" />
                <p className="mt-3 font-bold">{system.label}</p>
                <p className="mt-1 text-sm text-white/70">{system.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center p-5 md:p-8">
          <div className="w-full max-w-xl space-y-4">
            <SystemStatus />

            <form onSubmit={submit} className="rounded border border-border bg-white p-5 shadow-panel">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded bg-primary text-primary-foreground">
                  <KeyRound className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Staff Login</h2>
                  <p className="text-sm text-muted-foreground">Role-based routing is applied after sign in.</p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">Email</span>
                  <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">Password</span>
                  <Input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                  />
                </label>
              </div>

              <Button className="mt-4 w-full" disabled={state === "loading" || !email.trim() || !password}>
                <LogIn className="h-4 w-4" aria-hidden="true" />
                {state === "loading" ? "Signing in" : "Sign in"}
              </Button>

              <p
                className={
                  state === "error"
                    ? "mt-3 text-sm font-medium text-danger"
                    : state === "success"
                      ? "mt-3 text-sm font-medium text-success"
                      : "mt-3 text-sm text-muted-foreground"
                }
              >
                {message}
              </p>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
