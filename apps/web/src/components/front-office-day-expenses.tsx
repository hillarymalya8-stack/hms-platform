"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ReceiptText, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { formatCurrency, saleCurrencies, type SaleCurrency } from "@/lib/currency";
import { expensePaidFromOptions, localIsoDate, type CurrencyAmount, type DayExpense } from "@/lib/day-money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DayExpenses = { date: string; expenses: DayExpense[]; totals: CurrencyAmount[] };

const emptyForm = { description: "", amount: "", currencyCode: "TZS" as SaleCurrency, paidBy: "Cash" };

// Reception notes what was spent during the day; Finance sees the same list in Day sales.
export function FrontOfficeDayExpenses() {
  const [date, setDate] = useState(localIsoDate());
  const [data, setData] = useState<DayExpenses | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const result = await apiRequest<DayExpenses>(`/front-office/expenses?date=${encodeURIComponent(date)}`);
    if (result.ok) setData(result.data);
    else setMessage(result.error);
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const amount = form.amount.replace(/,/g, "").trim();
    if (form.description.trim().length < 2) return setMessage("Write what the money was spent on.");
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return setMessage("Enter a valid amount.");
    setBusy(true);
    const result = await apiRequest<DayExpense>("/front-office/expenses", {
      method: "POST",
      body: JSON.stringify({ ...form, description: form.description.trim(), amount, date })
    });
    setBusy(false);
    if (!result.ok) return setMessage(result.error);
    setForm({ ...emptyForm, currencyCode: form.currencyCode, paidBy: form.paidBy });
    setMessage(`Expense noted: ${result.data.description}.`);
    await load();
  }

  async function remove(expense: DayExpense) {
    if (busy || !window.confirm(`Remove "${expense.description}"?`)) return;
    setBusy(true);
    const result = await apiRequest(`/front-office/expenses/${expense.id}`, { method: "DELETE" });
    setBusy(false);
    setMessage(result.ok ? "Expense removed." : result.error);
    await load();
  }

  return (
    <section aria-label="Day expenses" className="rounded border border-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <ReceiptText className="h-4 w-4 text-primary" aria-hidden="true" />
          <h4 className="font-bold">Day expenses</h4>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(data?.totals ?? []).map((total) => (
            <Badge key={total.currencyCode} tone="warning">
              {formatCurrency(total.amount, total.currencyCode)} spent
            </Badge>
          ))}
          <Input
            type="date"
            aria-label="Expense date"
            className="w-auto"
            value={date}
            onChange={(event) => event.target.value && setDate(event.target.value)}
          />
        </div>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">
          Note any money spent today (for example petty cash). Finance sees these in Day sales.
        </p>
        <form onSubmit={save} className="grid gap-2 sm:grid-cols-[2fr_1fr_auto_auto_auto]">
          <Input
            aria-label="Expense description"
            placeholder="What was it for? e.g. Gas refill"
            maxLength={200}
            value={form.description}
            disabled={busy}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
          <Input
            aria-label="Expense amount"
            inputMode="decimal"
            placeholder="Amount"
            value={form.amount}
            disabled={busy}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
          />
          <select
            aria-label="Expense currency"
            className="h-10 rounded border border-border bg-white px-3 text-sm"
            value={form.currencyCode}
            disabled={busy}
            onChange={(event) => setForm({ ...form, currencyCode: event.target.value as SaleCurrency })}
          >
            {saleCurrencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Paid from"
            className="h-10 rounded border border-border bg-white px-3 text-sm"
            value={form.paidBy}
            disabled={busy}
            onChange={(event) => setForm({ ...form, paidBy: event.target.value })}
          >
            {expensePaidFromOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <Button disabled={busy}>{busy ? "Saving…" : "Add expense"}</Button>
        </form>
        {message ? (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}
        <div className="divide-y divide-border">
          {(data?.expenses ?? []).map((expense) => (
            <div key={expense.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
              <div>
                <p className={expense.voided ? "font-semibold line-through text-muted-foreground" : "font-semibold"}>
                  {expense.description}
                </p>
                <p className="text-xs text-muted-foreground">
                  {expense.paidBy ? `${expense.paidBy} · ` : ""}
                  {expense.recordedBy} ·{" "}
                  {new Date(expense.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {expense.voided ? ` · removed by ${expense.voidedBy}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <strong className="tabular-nums">{formatCurrency(expense.amount, expense.currencyCode)}</strong>
                {!expense.voided ? (
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Remove ${expense.description}`}
                    disabled={busy}
                    onClick={() => void remove(expense)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          {data && !data.expenses.length ? (
            <p className="py-2 text-sm text-muted-foreground">No expenses noted for {data.date}.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
