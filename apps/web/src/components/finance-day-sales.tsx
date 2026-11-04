"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { formatCurrency } from "@/lib/currency";
import { localIsoDate, paymentMethodLabels, type CurrencyAmount, type DayExpense } from "@/lib/day-money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Totals = {
  currencyCode: string;
  roomSales: string;
  roomCollected: string;
  prepaidBookings: string;
  posSales: string;
  posCollected: string;
  posChargedToRooms: string;
  totalSales: string;
  totalCollected: string;
  expenses: string;
  netAfterExpenses: string;
  cashCollected: string;
  cashAfterExpenses: string;
};
type MethodRow = { method: string; totals: CurrencyAmount[] };
type DaySales = {
  date: string;
  totals: Totals[];
  rooms: {
    rows: Array<{
      type: "CHARGE" | "PREPAID";
      description: string;
      room: string;
      guest: string;
      reservationNumber: string;
      amount: string;
      currencyCode: string;
    }>;
    paymentCount: number;
    byMethod: MethodRow[];
  };
  pos: { orderCount: number; byOutlet: Array<{ name: string; orders: number; totals: CurrencyAmount[] }>; byMethod: MethodRow[] };
  expenses: { rows: DayExpense[]; totals: CurrencyAmount[] };
};

const list = (totals: CurrencyAmount[]) =>
  totals.length ? totals.map((total) => formatCurrency(total.amount, total.currencyCode)).join(" + ") : "—";

// Room and POS sales for a day, read directly from Front Office and POS, plus front-office expenses.
export function FinanceDaySales({ active = true }: { active?: boolean }) {
  const [date, setDate] = useState(localIsoDate());
  const [data, setData] = useState<DaySales | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await apiRequest<DaySales>(`/accounting/day-sales?date=${encodeURIComponent(date)}`);
    setLoading(false);
    if (result.ok) {
      setData(result.data);
      setError("");
    } else setError(result.error);
  }, [date]);

  useEffect(() => {
    if (active) void load();
  }, [load, active]);

  return (
    <section aria-label="Day sales" className="space-y-4 rounded border border-border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-lg font-bold">Day sales: rooms, POS and expenses</h4>
          <p className="text-xs text-muted-foreground">
            Taken directly from Front Office and POS for the chosen date, including activity with no accounting entry
            yet.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="Day sales date"
            className="w-auto"
            value={date}
            onChange={(event) => event.target.value && setDate(event.target.value)}
          />
          <Button type="button" variant="secondary" disabled={loading} onClick={() => void load()}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {data?.totals.map((total) => (
        <div key={total.currencyCode} className="space-y-2">
          {data.totals.length > 1 ? <p className="text-sm font-semibold">{total.currencyCode === "USD" ? "USD" : "TSh"}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Room sales", total.roomSales, "Room nights and extra room charges billed"],
              ["Room payments received", plus(total.roomCollected, total.prepaidBookings), "Guest bill payments and prepaid bookings"],
              ["POS sales", total.posSales, `${data.pos.orderCount} orders (voids excluded)`],
              ["POS payments received", total.posCollected, `Excludes ${formatCurrency(total.posChargedToRooms, total.currencyCode)} charged to rooms`],
              ["Total sales", total.totalSales, "Rooms + POS"],
              ["Total money received", total.totalCollected, "Rooms + POS"],
              ["Front office expenses", total.expenses, "Noted by reception"],
              ["Received after expenses", total.netAfterExpenses, `Cash only: ${formatCurrency(total.cashAfterExpenses, total.currencyCode)}`]
            ].map(([label, value, hint]) => (
              <div key={label} className="rounded border border-border p-3">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {loading ? "…" : formatCurrency(value, total.currencyCode)}
                </p>
                <p className="text-xs text-muted-foreground">{hint}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
      {data ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <h5 className="mb-2 font-semibold">Rooms</h5>
            <div className="divide-y divide-border text-sm">
              {data.rooms.rows.map((row, index) => (
                <div key={index} className="flex justify-between gap-3 py-1.5">
                  <span>
                    {row.room ? `Room ${row.room} · ` : ""}
                    {row.guest}
                    <span className="block text-xs text-muted-foreground">
                      {row.type === "PREPAID" ? "Prepaid: " : ""}
                      {row.description}
                    </span>
                  </span>
                  <strong className="tabular-nums">{formatCurrency(row.amount, row.currencyCode)}</strong>
                </div>
              ))}
              {data.rooms.byMethod.map((row) => (
                <div key={row.method} className="flex justify-between gap-3 py-1.5">
                  <span>Paid by {paymentMethodLabels[row.method] ?? row.method}</span>
                  <strong className="tabular-nums">{list(row.totals)}</strong>
                </div>
              ))}
              {!data.rooms.rows.length && !data.rooms.byMethod.length ? (
                <p className="py-1.5 text-muted-foreground">No room sales or payments.</p>
              ) : null}
            </div>
          </div>
          <div>
            <h5 className="mb-2 font-semibold">POS</h5>
            <div className="divide-y divide-border text-sm">
              {data.pos.byOutlet.map((row) => (
                <div key={row.name} className="flex justify-between gap-3 py-1.5">
                  <span>
                    {row.name} <span className="text-xs text-muted-foreground">({row.orders} orders)</span>
                  </span>
                  <strong className="tabular-nums">{list(row.totals)}</strong>
                </div>
              ))}
              {data.pos.byMethod.map((row) => (
                <div key={row.method} className="flex justify-between gap-3 py-1.5">
                  <span>Paid by {paymentMethodLabels[row.method] ?? row.method}</span>
                  <strong className="tabular-nums">{list(row.totals)}</strong>
                </div>
              ))}
              {!data.pos.byOutlet.length ? <p className="py-1.5 text-muted-foreground">No POS sales.</p> : null}
            </div>
          </div>
          <div>
            <h5 className="mb-2 font-semibold">Front office expenses</h5>
            <div className="divide-y divide-border text-sm">
              {data.expenses.rows.map((expense) => (
                <div key={expense.id} className="flex justify-between gap-3 py-1.5">
                  <span className={expense.voided ? "text-muted-foreground line-through" : ""}>
                    {expense.description}
                    <span className="block text-xs text-muted-foreground">
                      {expense.paidBy ? `${expense.paidBy} · ` : ""}
                      {expense.recordedBy}
                      {expense.voided ? ` · removed by ${expense.voidedBy}` : ""}
                    </span>
                  </span>
                  <strong className={expense.voided ? "tabular-nums text-muted-foreground line-through" : "tabular-nums"}>
                    {formatCurrency(expense.amount, expense.currencyCode)}
                  </strong>
                </div>
              ))}
              {!data.expenses.rows.length ? <p className="py-1.5 text-muted-foreground">No expenses noted.</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function plus(a: string, b: string) {
  return (Number(a) + Number(b)).toFixed(2);
}
