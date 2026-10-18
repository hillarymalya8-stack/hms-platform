"use client";

import { FormEvent, useState } from "react";
import { Hotel } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LoginResponse } from "@/lib/auth";

const currencies = [
  { code: "TZS", symbol: "TSh", label: "Tanzanian shilling (TZS)" },
  { code: "KES", symbol: "KSh", label: "Kenyan shilling (KES)" },
  { code: "UGX", symbol: "USh", label: "Ugandan shilling (UGX)" },
  { code: "RWF", symbol: "FRw", label: "Rwandan franc (RWF)" },
  { code: "USD", symbol: "$", label: "US dollar (USD)" },
  { code: "EUR", symbol: "€", label: "Euro (EUR)" },
  { code: "GBP", symbol: "£", label: "British pound (GBP)" },
  { code: "ZAR", symbol: "R", label: "South African rand (ZAR)" }
];

type FirstRunSetupProps = {
  apiUrl: string;
  setupKeyRequired: boolean;
  onComplete: (result: LoginResponse) => void;
  onAlreadySetUp: () => void;
};

// One-time setup for a new deployment: creates the hotel, its stores, outlets, chart of accounts, access levels,
// and the first Super Administrator, then signs that administrator in.
export function FirstRunSetup({ apiUrl, setupKeyRequired, onComplete, onAlreadySetUp }: FirstRunSetupProps) {
  const [form, setForm] = useState({
    hotelName: "",
    currencyCode: "TZS",
    adminFullName: "",
    adminEmail: "",
    adminPassword: "",
    confirmPassword: "",
    setupKey: ""
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const currency = currencies.find((entry) => entry.code === form.currencyCode) ?? currencies[0];
  const update = (field: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm({ ...form, [field]: event.target.value });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (form.adminPassword.length < 8) {
      setError("The administrator password must be at least 8 characters.");
      return;
    }
    if (form.adminPassword !== form.confirmPassword) {
      setError("The two passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`${apiUrl}/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelName: form.hotelName.trim(),
          currencyCode: currency.code,
          currencySymbol: currency.symbol,
          adminFullName: form.adminFullName.trim(),
          adminEmail: form.adminEmail.trim(),
          adminPassword: form.adminPassword,
          ...(setupKeyRequired ? { setupKey: form.setupKey } : {})
        })
      });
      const body = await response.json().catch(() => undefined);

      if (response.status === 409) {
        onAlreadySetUp();
        return;
      }
      if (!response.ok) {
        const detail = Array.isArray(body?.message) ? body.message.join(" ") : body?.message;
        setError(detail ?? "Setup could not be completed. Try again.");
        return;
      }

      onComplete(body as LoginResponse);
    } catch {
      setError("The hotel system could not be reached. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded border border-border bg-white p-5 shadow-panel">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded bg-primary text-primary-foreground">
          <Hotel className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Set up your hotel</h2>
          <p className="text-sm text-muted-foreground">
            This system has no accounts yet. Create the hotel and its first administrator to start.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="text-sm font-medium">Hotel name</span>
          <Input value={form.hotelName} onChange={update("hotelName")} required minLength={2} autoComplete="organization" />
        </label>

        <label className="block space-y-1.5 sm:col-span-2">
          <span className="text-sm font-medium">Currency</span>
          <select
            className="h-10 w-full rounded border border-border bg-white px-3 text-sm"
            value={form.currencyCode}
            onChange={update("currencyCode")}
          >
            {currencies.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Administrator name</span>
          <Input value={form.adminFullName} onChange={update("adminFullName")} required autoComplete="name" />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Administrator email</span>
          <Input
            value={form.adminEmail}
            onChange={update("adminEmail")}
            type="email"
            required
            autoCapitalize="none"
            autoComplete="email"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Password</span>
          <Input
            value={form.adminPassword}
            onChange={update("adminPassword")}
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Confirm password</span>
          <Input
            value={form.confirmPassword}
            onChange={update("confirmPassword")}
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>

        {setupKeyRequired ? (
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">Setup key</span>
            <Input value={form.setupKey} onChange={update("setupKey")} type="password" required autoComplete="off" />
          </label>
        ) : null}
      </div>

      <Button className="mt-4 w-full" disabled={busy}>
        {busy ? "Setting up the hotel..." : "Create hotel and sign in"}
      </Button>

      <p className={error ? "mt-3 text-sm font-medium text-danger" : "mt-3 text-sm text-muted-foreground"}>
        {error ||
          "Bar, Restaurant and Main Store, both POS outlets, the chart of accounts and all access levels are created for you. Rooms, menu items and stock are added afterwards."}
      </p>
    </form>
  );
}
