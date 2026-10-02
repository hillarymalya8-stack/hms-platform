"use client";

import { FormEvent, useMemo, useState } from "react";
import { LogIn, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiBaseUrl, isDemoAuthEnabled, loginWithDemoCredentials, saveSession } from "@/lib/auth";

type LoginState = "idle" | "loading" | "success" | "error";
const defaultEmail = "admin@hotel.local";

export function LoginPanel() {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [state, setState] = useState<LoginState>("idle");
  const demoMode = useMemo(() => isDemoAuthEnabled(), []);
  const [message, setMessage] = useState(demoMode ? "Demo sign-in is available on Netlify." : "Sign in with a live system account.");

  const apiUrl = useMemo(() => getApiBaseUrl(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("loading");
    setMessage("Checking credentials...");

    if (demoMode) {
      const result = loginWithDemoCredentials(email, password);

      if (!result) {
        setState("error");
        setMessage("Demo credentials were rejected.");
        return;
      }

      saveSession(result);
      setState("success");
      setMessage(`Signed in as ${result.user.fullName}`);
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
        setMessage("Credentials were rejected by the API.");
        return;
      }

      const result = await response.json();
      saveSession(result);
      setState("success");
      setMessage(`Signed in as ${result.user.fullName}`);
    } catch {
      setState("error");
      setMessage("The API or database is offline. Start the backend services, then sign in again.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded bg-primary text-primary-foreground">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-bold">Administrator Login</h2>
          <p className="text-sm text-muted-foreground">Protected system access</p>
        </div>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Email</span>
        <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Password</span>
        <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
      </label>

      <Button className="w-full" disabled={state === "loading"}>
        <LogIn className="h-4 w-4" aria-hidden="true" />
        {state === "loading" ? "Signing in" : "Sign in"}
      </Button>

      <p
        className={
          state === "error"
            ? "text-sm font-medium text-danger"
            : state === "success"
              ? "text-sm font-medium text-success"
              : "text-sm text-muted-foreground"
        }
      >
        {message}
      </p>
    </form>
  );
}
