"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { readSession } from "@/lib/auth";
import { everydayEntryLines, moneyAccounts, type EverydayEntry, type FinanceAccount } from "@/lib/finance-entry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { InvoiceWorkspace } from "@/components/invoice-workspace";
import { FinanceDaySales } from "@/components/finance-day-sales";

type Balance = {
  rows: Array<{
    accountCode: string;
    accountName: string;
    accountType: string;
    totalDebit: string;
    totalCredit: string;
  }>;
};
type Entry = {
  id: string;
  entryNumber: string;
  description: string | null;
  status: string;
  totalDebit: string;
  sourceNumber: string | null;
  createdAt: string;
  lines: Array<{ description: string | null; accountName: string }>;
};
type Day = { current: { businessDate: string }; draftJournalCount: number };
const emptyEntry: EverydayEntry = {
  kind: "expense",
  moneyAccount: "",
  otherAccount: "",
  amount: "",
  description: "",
  reference: ""
};
const names = { income: "Record income", expense: "Record expense", transfer: "Transfer money" };
const amount = (value: number) =>
  new Intl.NumberFormat("en", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value);

export function SimpleFinanceWorkspace({ active = true }: { active?: boolean }) {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [allBalance, setAllBalance] = useState<Balance | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [day, setDay] = useState<Day | null>(null);
  const [scope, setScope] = useState<"day" | "all">("day");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [form, setForm] = useState<EverydayEntry | null>(null);
  const [pending, setPending] = useState<Entry | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [message, setMessage] = useState("Loading your finance summary…");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const saving = useRef(false);
  const canCreate = permissions.includes("accounting.journals.create");
  const canApprove = permissions.includes("accounting.journals.post");
  const funds = moneyAccounts(accounts);
  const categories =
    form?.kind === "transfer"
      ? funds
      : accounts.filter(
          (account) =>
            account.active &&
            (form?.kind === "income"
              ? account.accountType === "REVENUE"
              : ["EXPENSE", "COST_OF_SALES"].includes(account.accountType))
        );

  useEffect(() => {
    setPermissions(readSession()?.user.permissions ?? []);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [a, b, e, d] = await Promise.all([
      apiRequest<FinanceAccount[]>("/accounting/accounts"),
      apiRequest<Balance>("/accounting/trial-balance"),
      apiRequest<Entry[]>("/accounting/journals?limit=50"),
      apiRequest<Day>("/accounting/business-date")
    ]);
    if (a.ok) setAccounts(a.data);
    if (b.ok) setAllBalance(b.data);
    if (e.ok) setEntries(e.data);
    if (d.ok) setDay(d.data);
    let error = [a, b, e, d].find((result) => !result.ok);
    if (scope === "all") setBalance(b.ok ? b.data : null);
    else if (d.ok) {
      const date = d.data.current.businessDate.slice(0, 10);
      const result = await apiRequest<Balance>(`/accounting/trial-balance?from=${date}&to=${date}`);
      setBalance(result.ok ? result.data : null);
      if (!result.ok) error = result;
    } else setBalance(null);
    setLoading(false);
    if (error && !error.ok) return error.error;
    return null;
  }, [scope]);

  useEffect(() => {
    if (active) void refresh().then((error) => setMessage(error ?? "Finance summary updated."));
  }, [refresh, active]);

  const rows = balance?.rows ?? [];
  const sum = (types: string[], sign: number) =>
    rows
      .filter((row) => types.includes(row.accountType))
      .reduce((total, row) => total + sign * (Number(row.totalDebit) - Number(row.totalCredit)), 0);
  const income = sum(["REVENUE"], -1);
  const expenses = sum(["EXPENSE", "COST_OF_SALES"], 1);

  function openForm(kind: EverydayEntry["kind"]) {
    setForm({ ...emptyEntry, kind });
    setMessage("Choose the category, enter the amount, and describe the transaction.");
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || saving.current || !canCreate) return;
    let lines;
    try {
      lines = everydayEntryLines(form, accounts);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Check the details.");
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      let saved = pending;
      if (!saved) {
        const payload = { memo: form.description.trim(), reference: form.reference.trim() || undefined, lines };
        const fingerprint = JSON.stringify(payload);
        if (attempt.current?.fingerprint !== fingerprint)
          attempt.current = { fingerprint, key: `everyday-${crypto.randomUUID()}` };
        const result = await apiRequest<Entry>("/accounting/journals", {
          method: "POST",
          body: JSON.stringify({ ...payload, idempotencyKey: attempt.current.key })
        });
        if (!result.ok) {
          setMessage(result.error + " Retry with the same details to avoid a duplicate.");
          return;
        }
        saved = result.data;
        setPending(saved);
      }
      if (pending && canApprove) {
        const latest = await apiRequest<Entry[]>("/accounting/journals?limit=200");
        if (!latest.ok) {
          setMessage("Could not confirm the saved entry. Refresh and retry approval. " + latest.error);
          return;
        }
        saved = latest.data.find((entry) => entry.id === pending.id) ?? saved;
      }
      if (canApprove && saved.status === "DRAFT") {
        const result = await apiRequest<Entry>(`/accounting/journals/${saved.id}/post`, { method: "POST" });
        if (!result.ok) {
          const refreshError = await refresh();
          setMessage(
            `Saved as ${saved.entryNumber}, but approval could not be confirmed. Retry approval here or check Recent entries and approvals. ${result.error}${refreshError ? ` ${refreshError}` : ""}`
          );
          return;
        }
      }
      setForm(null);
      setPending(null);
      attempt.current = null;
      const error = await refresh();
      setMessage(
        `${saved.entryNumber}: ${canApprove ? "saved and included in your totals" : "saved for approval; totals update after approval"}.${error ? ` Refresh problem: ${error}` : ""}`
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function approve(entry: Entry) {
    if (saving.current || !canApprove) return;
    saving.current = true;
    setBusy(true);
    try {
      const result = await apiRequest<Entry>(`/accounting/journals/${entry.id}/post`, { method: "POST" });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      if (pending?.id === entry.id) {
        setPending(null);
        setForm(null);
        attempt.current = null;
      }
      const error = await refresh();
      setMessage(error ?? `${entry.entryNumber} approved and included in your totals.`);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function finishDay() {
    if (!day || busy || !canApprove || day.draftJournalCount > 0) return;
    if (!window.confirm(`Finish ${day.current.businessDate.slice(0, 10)} and open the next business day?`)) return;
    setBusy(true);
    const result = await apiRequest("/accounting/business-date/close", { method: "POST", body: "{}" });
    if (!result.ok) {
      setBusy(false);
      setMessage(result.error);
      return;
    }
    const error = await refresh();
    setBusy(false);
    setMessage(error ?? "Day finished. The next business day is now open.");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">Your money at a glance</h3>
          <p className="text-sm text-muted-foreground">
            Record income and expenses, review entries, and finish the day.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={loading || busy}
          onClick={() => void refresh().then((error) => setMessage(error ?? "Finance summary updated."))}
        >
          Refresh
        </Button>
      </div>
      <p role="status" aria-live="polite" className="rounded border border-border bg-white p-3 text-sm">
        {message}
      </p>
      <FinanceDaySales active={active} />
      <h4 className="pt-2 font-bold">Accounting entries</h4>
      <p className="text-sm text-muted-foreground">
        The totals below include approved finance entries only. Room and POS sales appear in Day sales above even
        before an accounting entry is recorded.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={scope === "day" ? "primary" : "secondary"}
          disabled={busy || loading}
          onClick={() => setScope("day")}
        >
          Business day {day?.current.businessDate.slice(0, 10) ?? ""}
        </Button>
        <Button
          type="button"
          variant={scope === "all" ? "primary" : "secondary"}
          disabled={busy || loading}
          onClick={() => setScope("all")}
        >
          All dates
        </Button>
        <span className="text-xs text-muted-foreground">
          Totals follow the date entries were approved. Profit is different from cash available.
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Income recorded", balance ? amount(income) : "—"],
          ["Costs and expenses", balance ? amount(expenses) : "—"],
          ["Profit / loss", balance ? amount(income - expenses) : "—"],
          ["Waiting for approval", day ? String(day.draftJournalCount) : "—"]
        ].map(([label, value]) => (
          <div key={label} className="rounded border border-border bg-white p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-bold">{loading ? "…" : value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {canCreate ? (
          (Object.keys(names) as EverydayEntry["kind"][]).map((kind) => (
            <Button key={kind} type="button" disabled={busy || loading || !!pending} onClick={() => openForm(kind)}>
              {names[kind]}
            </Button>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            You can view finances. Ask an administrator for permission to record transactions.
          </p>
        )}
        <Button type="button" variant="secondary" onClick={() => setShowInvoice(!showInvoice)}>
          {showInvoice ? "Close invoice" : "Make guest invoice"}
        </Button>
      </div>
      {form ? (
        <form onSubmit={saveEntry} className="rounded border border-border bg-white p-4">
          <h4 className="mb-3 font-bold">{names[form.kind]}</h4>
          <fieldset disabled={busy || !!pending} className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              {form.kind === "income" ? "Received into" : "Paid from"}
              <select
                aria-label="Money account"
                className="h-10 rounded border border-border bg-white px-3"
                value={form.moneyAccount}
                onChange={(event) => setForm({ ...form, moneyAccount: event.target.value })}
              >
                <option value="">Choose cash, bank, or wallet</option>
                {funds.map((account) => (
                  <option key={account.id} value={account.accountCode}>
                    {account.accountName}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              {form.kind === "transfer" ? "Move to" : "What is it for?"}
              <select
                aria-label="Transaction category"
                className="h-10 rounded border border-border bg-white px-3"
                value={form.otherAccount}
                onChange={(event) => setForm({ ...form, otherAccount: event.target.value })}
              >
                <option value="">Choose {form.kind === "transfer" ? "destination" : "category"}</option>
                {categories
                  .filter((account) => account.accountCode !== form.moneyAccount)
                  .map((account) => (
                    <option key={account.id} value={account.accountCode}>
                      {account.accountName}
                    </option>
                  ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Amount
              <Input
                aria-label="Transaction amount"
                inputMode="decimal"
                placeholder="e.g. 50000"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Receipt or reference (optional)
              <Input
                aria-label="Transaction reference"
                maxLength={80}
                value={form.reference}
                onChange={(event) => setForm({ ...form, reference: event.target.value })}
              />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              Description
              <Input
                aria-label="Transaction description"
                maxLength={240}
                placeholder="e.g. Electricity payment for the hotel"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </label>
          </fieldset>
          {!funds.length || !categories.length ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Ask your administrator to set up cash/bank accounts and the required income or expense categories in
              Advanced accounting.
            </p>
          ) : null}
          <p className="mt-3 text-sm text-muted-foreground">
            Use the hotel's accounting currency.{" "}
            {canApprove
              ? "Saving includes this entry in your totals."
              : "Your entry will wait for approval before it affects totals."}{" "}
            This form records payments already made; unpaid bills and guest debts need Advanced accounting.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={busy || !funds.length || !categories.length}>
              {busy ? "Saving…" : pending ? "Retry approval" : canApprove ? "Save transaction" : "Send for approval"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setForm(null);
                setPending(null);
              }}
            >
              {pending ? "Leave for later approval" : "Cancel"}
            </Button>
          </div>
        </form>
      ) : null}
      {showInvoice ? <InvoiceWorkspace compact /> : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded border border-border bg-white p-4">
          <h4 className="font-bold">Balances recorded</h4>
          <p className="mb-3 text-xs text-muted-foreground">
            All dates. Based on approved entries; compare with actual cash, bank statements, and unpaid bills.
          </p>
          {allBalance ? (
            <div className="space-y-2">
              {allBalance.rows
                .filter((row) => ["ASSET", "LIABILITY"].includes(row.accountType))
                .map((row) => (
                  <div key={row.accountCode} className="flex justify-between gap-3 text-sm">
                    <span>{row.accountName}</span>
                    <strong>
                      {amount(
                        (Number(row.totalDebit) - Number(row.totalCredit)) * (row.accountType === "LIABILITY" ? -1 : 1)
                      )}
                    </strong>
                  </div>
                ))}
              {!allBalance.rows.some((row) => ["ASSET", "LIABILITY"].includes(row.accountType)) ? (
                <p className="text-sm text-muted-foreground">No balances recorded yet.</p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Balances are unavailable.</p>
          )}
        </section>
        <section className="rounded border border-border bg-white p-4">
          <h4 className="font-bold">Finish the day</h4>
          <p className="mt-2 text-sm">Business date: {day?.current.businessDate.slice(0, 10) ?? "Unavailable"}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Check cash and bank receipts, record missing entries, and have pending entries approved. Finishing opens the
            next business day.
          </p>
          {day && day.draftJournalCount > 0 ? (
            <p className="mt-2 text-sm">{day.draftJournalCount} entries still need approval.</p>
          ) : null}
          {canApprove ? (
            <Button
              type="button"
              className="mt-3"
              disabled={busy || loading || !day || day.draftJournalCount > 0}
              onClick={() => void finishDay()}
            >
              Finish this business day
            </Button>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">An authorised manager must finish the day.</p>
          )}
        </section>
      </div>
      <section className="rounded border border-border bg-white p-4">
        <h4 className="font-bold">Recent entries and approvals</h4>
        <p className="mb-3 text-xs text-muted-foreground">
          Latest 50 entries across all dates. Waiting entries are excluded from the summary.
        </p>
        <div className="divide-y divide-border">
          {entries.map((entry) => (
            <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-semibold">
                  {entry.description ??
                    entry.lines.find((line) => line.description)?.description ??
                    entry.lines.map((line) => line.accountName).join(" → ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {entry.lines.map((line) => line.accountName).join(" · ")}
                  {" — "}
                  {entry.entryNumber}
                  {entry.sourceNumber ? ` · ${entry.sourceNumber}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <strong>{amount(Number(entry.totalDebit))}</strong>
                <Badge tone={entry.status === "DRAFT" ? "warning" : "neutral"}>
                  {entry.status === "DRAFT"
                    ? "Waiting for approval"
                    : entry.status === "POSTED"
                      ? "Included in totals"
                      : entry.status}
                </Badge>
                {entry.status === "DRAFT" && canApprove ? (
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => void approve(entry)}>
                    Approve entry
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          {!entries.length ? <p className="py-3 text-sm text-muted-foreground">No entries recorded yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
