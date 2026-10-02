"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Banknote,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  FileText,
  Landmark,
  LockKeyhole,
  RefreshCcw
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InvoiceWorkspace } from "@/components/invoice-workspace";
import { Input } from "@/components/ui/input";

type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";

type Account = {
  code: string;
  name: string;
  type: AccountType;
};

type TrialLine = {
  accountCode: string;
  debit: number;
  credit: number;
};

type PendingJournal = {
  id: string;
  source: string;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  status: "PENDING" | "POSTED";
};

type FinanceEvent = {
  id: string;
  reference: string;
  action: string;
  detail: string;
};

const demoAccounts: Account[] = [
  { code: "1100", name: "Cash on Hand", type: "ASSET" },
  { code: "1110", name: "Bank Account", type: "ASSET" },
  { code: "1200", name: "Accounts Receivable", type: "ASSET" },
  { code: "1300", name: "Inventory", type: "ASSET" },
  { code: "2100", name: "Accounts Payable", type: "LIABILITY" },
  { code: "2200", name: "Tax Payable", type: "LIABILITY" },
  { code: "3000", name: "Owner Equity", type: "EQUITY" },
  { code: "4100", name: "Room Revenue", type: "REVENUE" },
  { code: "4200", name: "Restaurant Revenue", type: "REVENUE" },
  { code: "5100", name: "Cost of Sales", type: "EXPENSE" },
  { code: "6100", name: "Operating Expenses", type: "EXPENSE" }
];

const demoTrialBalance: TrialLine[] = [
  { accountCode: "1100", debit: 2200, credit: 0 },
  { accountCode: "1110", debit: 8400, credit: 0 },
  { accountCode: "1200", debit: 1550, credit: 0 },
  { accountCode: "1300", debit: 3280, credit: 0 },
  { accountCode: "2100", debit: 0, credit: 2100 },
  { accountCode: "2200", debit: 0, credit: 890 },
  { accountCode: "3000", debit: 0, credit: 4100 },
  { accountCode: "4100", debit: 0, credit: 5600 },
  { accountCode: "4200", debit: 0, credit: 2840 },
  { accountCode: "5100", debit: 1980, credit: 0 },
  { accountCode: "6100", debit: 2120, credit: 0 }
];

const demoPendingJournals: PendingJournal[] = [
  {
    id: "journal-pos",
    source: "POS",
    description: "Restaurant paid sales batch",
    debitAccount: "1100",
    creditAccount: "4200",
    amount: 640,
    status: "PENDING"
  },
  {
    id: "journal-room",
    source: "Front Office",
    description: "Checked-in room revenue accrual",
    debitAccount: "1200",
    creditAccount: "4100",
    amount: 380,
    status: "PENDING"
  },
  {
    id: "journal-ap",
    source: "Purchasing",
    description: "Supplier invoice posted to AP",
    debitAccount: "1300",
    creditAccount: "2100",
    amount: 420,
    status: "PENDING"
  }
];

export function FinanceWorkspace() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialLine[]>([]);
  const [pendingJournals, setPendingJournals] = useState<PendingJournal[]>([]);
  const [events, setEvents] = useState<FinanceEvent[]>([]);
  const [businessDate, setBusinessDate] = useState("2026-08-31");
  const [closed, setClosed] = useState(false);
  const [message, setMessage] = useState("Load finance data to review the ledger.");
  const [adjustmentForm, setAdjustmentForm] = useState({
    description: "Bank charges adjustment",
    debitAccount: "6100",
    creditAccount: "1110",
    amount: "35.00"
  });

  const activeAccounts = accounts.length ? accounts : demoAccounts;

  const enrichedTrialBalance = useMemo(
    () =>
      trialBalance.map((line) => ({
        ...line,
        account: activeAccounts.find((account) => account.code === line.accountCode)
      })),
    [activeAccounts, trialBalance]
  );

  const totals = enrichedTrialBalance.reduce(
    (sum, line) => ({
      debit: sum.debit + line.debit,
      credit: sum.credit + line.credit
    }),
    { debit: 0, credit: 0 }
  );

  const profitAndLoss = enrichedTrialBalance.reduce(
    (sum, line) => {
      if (line.account?.type === "REVENUE") {
        return { ...sum, revenue: sum.revenue + line.credit - line.debit };
      }
      if (line.account?.type === "EXPENSE") {
        return { ...sum, expense: sum.expense + line.debit - line.credit };
      }
      return sum;
    },
    { revenue: 0, expense: 0 }
  );

  const balanceSheet = enrichedTrialBalance.reduce(
    (sum, line) => {
      if (line.account?.type === "ASSET") {
        return { ...sum, assets: sum.assets + line.debit - line.credit };
      }
      if (line.account?.type === "LIABILITY") {
        return { ...sum, liabilities: sum.liabilities + line.credit - line.debit };
      }
      if (line.account?.type === "EQUITY") {
        return { ...sum, equity: sum.equity + line.credit - line.debit };
      }
      return sum;
    },
    { assets: 0, liabilities: 0, equity: 0 }
  );

  const netProfit = profitAndLoss.revenue - profitAndLoss.expense;
  const pendingTotal = pendingJournals
    .filter((journal) => journal.status === "PENDING")
    .reduce((sum, journal) => sum + journal.amount, 0);
  const balanced = Math.abs(totals.debit - totals.credit) < 0.01;

  function loadData() {
    setAccounts([...demoAccounts]);
    setTrialBalance(demoTrialBalance.map((line) => ({ ...line })));
    setPendingJournals(demoPendingJournals.map((journal) => ({ ...journal })));
    setEvents([]);
    setClosed(false);
    setMessage("Finance ledger loaded.");
  }

  function postPendingJournals() {
    const pending = pendingJournals.filter((journal) => journal.status === "PENDING");
    if (pending.length === 0) {
      setMessage("There are no pending journals to post.");
      return;
    }

    setTrialBalance((current) => {
      const next = current.map((line) => ({ ...line }));
      pending.forEach((journal) => {
        addAmount(next, journal.debitAccount, "debit", journal.amount);
        addAmount(next, journal.creditAccount, "credit", journal.amount);
      });
      return next;
    });
    setPendingJournals((current) => current.map((journal) => ({ ...journal, status: "POSTED" })));
    setEvents((current) => [
      {
        id: createLocalId("event"),
        reference: `GL-${businessDate}`,
        action: "Posted journal batch",
        detail: `${pending.length} source journals posted into the general ledger.`
      },
      ...current
    ]);
    setMessage(`${pending.length} source journals posted. Trial balance remains balanced.`);
  }

  function createAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(adjustmentForm.amount);
    const debitAccount = activeAccounts.find((account) => account.code === adjustmentForm.debitAccount);
    const creditAccount = activeAccounts.find((account) => account.code === adjustmentForm.creditAccount);

    if (!debitAccount || !creditAccount || amount <= 0 || debitAccount.code === creditAccount.code) {
      setMessage("Choose different debit/credit accounts and a valid adjustment amount.");
      return;
    }

    const journal: PendingJournal = {
      id: createLocalId("journal"),
      source: "Manual",
      description: adjustmentForm.description,
      debitAccount: debitAccount.code,
      creditAccount: creditAccount.code,
      amount,
      status: "PENDING"
    };
    setPendingJournals((current) => [journal, ...current]);
    setMessage("Manual adjustment added to pending journals.");
  }

  function closeBusinessDate() {
    const pending = pendingJournals.some((journal) => journal.status === "PENDING");
    if (pending) {
      setMessage("Post all pending journals before closing the business date.");
      return;
    }
    if (!balanced) {
      setMessage("The trial balance must be balanced before close.");
      return;
    }

    setClosed(true);
    setEvents((current) => [
      {
        id: createLocalId("event"),
        reference: businessDate,
        action: "Business date closed",
        detail: "Revenue, expenses, cash, AR, AP, and inventory control totals were locked for reporting."
      },
      ...current
    ]);
    setMessage(`${formatDate(businessDate)} closed. Reports are ready for management review.`);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">Finance Close Workspace</h3>
            <p className="text-sm text-muted-foreground">Post operational journals, review reports, and close the business date.</p>
          </div>
          <Button type="button" variant="secondary" onClick={loadData}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Load finance
          </Button>
        </div>

        <p className="rounded border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">{message}</p>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded border border-border bg-white p-4">
            <p className="text-sm text-muted-foreground">Revenue</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatMoney(profitAndLoss.revenue)}</p>
          </div>
          <div className="rounded border border-border bg-white p-4">
            <p className="text-sm text-muted-foreground">Expenses</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatMoney(profitAndLoss.expense)}</p>
          </div>
          <div className="rounded border border-border bg-white p-4">
            <p className="text-sm text-muted-foreground">Net profit</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatMoney(netProfit)}</p>
          </div>
          <div className="rounded border border-border bg-white p-4">
            <p className="text-sm text-muted-foreground">Pending journals</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatMoney(pendingTotal)}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded border border-border bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
              <h4 className="font-bold">Trial Balance</h4>
            </div>
            <Badge tone={balanced ? "success" : "danger"}>{balanced ? "Balanced" : "Out of balance"}</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Account</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 text-right font-semibold">Debit</th>
                  <th className="px-4 py-3 text-right font-semibold">Credit</th>
                </tr>
              </thead>
              <tbody>
                {enrichedTrialBalance.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-muted-foreground" colSpan={4}>
                      No finance data loaded yet.
                    </td>
                  </tr>
                ) : (
                  enrichedTrialBalance.map((line) => (
                    <tr key={line.accountCode} className="border-t border-border">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{line.accountCode} {line.account?.name}</p>
                      </td>
                      <td className="px-4 py-3">{line.account?.type}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{line.debit ? formatMoney(line.debit) : "-"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{line.credit ? formatMoney(line.credit) : "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="border-t border-border bg-background/70 font-bold">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>Totals</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(totals.debit)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(totals.credit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <InvoiceWorkspace compact />

        <div className="rounded border border-border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Business Date Close</h4>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Input
              aria-label="Business date"
              type="date"
              value={businessDate}
              onChange={(event) => setBusinessDate(event.target.value)}
            />
            <Badge tone={closed ? "success" : "warning"}>{closed ? "Closed" : "Open"}</Badge>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="secondary" onClick={postPendingJournals}>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Post journals
            </Button>
            <Button type="button" onClick={closeBusinessDate}>
              <LockKeyhole className="h-4 w-4" aria-hidden="true" />
              Close date
            </Button>
          </div>
        </div>

        <form onSubmit={createAdjustment} className="rounded border border-border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Manual Journal Adjustment</h4>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              aria-label="Adjustment description"
              className="sm:col-span-2"
              value={adjustmentForm.description}
              onChange={(event) => setAdjustmentForm({ ...adjustmentForm, description: event.target.value })}
              placeholder="Description"
            />
            <select
              aria-label="Debit account"
              className="h-10 rounded border border-border bg-white px-3 text-sm"
              value={adjustmentForm.debitAccount}
              onChange={(event) => setAdjustmentForm({ ...adjustmentForm, debitAccount: event.target.value })}
            >
              {activeAccounts.map((account) => (
                <option key={account.code} value={account.code}>
                  Dr {account.code} {account.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Credit account"
              className="h-10 rounded border border-border bg-white px-3 text-sm"
              value={adjustmentForm.creditAccount}
              onChange={(event) => setAdjustmentForm({ ...adjustmentForm, creditAccount: event.target.value })}
            >
              {activeAccounts.map((account) => (
                <option key={account.code} value={account.code}>
                  Cr {account.code} {account.name}
                </option>
              ))}
            </select>
            <Input
              aria-label="Adjustment amount"
              className="sm:col-span-2"
              value={adjustmentForm.amount}
              onChange={(event) => setAdjustmentForm({ ...adjustmentForm, amount: event.target.value })}
              placeholder="Amount"
            />
          </div>
          <Button className="mt-3">
            <Banknote className="h-4 w-4" aria-hidden="true" />
            Add adjustment
          </Button>
        </form>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded border border-border bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <Landmark className="h-4 w-4 text-primary" aria-hidden="true" />
              <h4 className="font-bold">Balance Sheet</h4>
            </div>
            <div className="space-y-2 text-sm">
              <Row label="Assets" value={balanceSheet.assets} />
              <Row label="Liabilities" value={balanceSheet.liabilities} />
              <Row label="Equity" value={balanceSheet.equity} />
              <Row label="Retained profit" value={netProfit} strong />
            </div>
          </div>
          <div className="rounded border border-border bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
              <h4 className="font-bold">Profit and Loss</h4>
            </div>
            <div className="space-y-2 text-sm">
              <Row label="Room revenue" value={accountNet(enrichedTrialBalance, "4100", "credit")} />
              <Row label="Restaurant revenue" value={accountNet(enrichedTrialBalance, "4200", "credit")} />
              <Row label="Cost of sales" value={accountNet(enrichedTrialBalance, "5100", "debit")} />
              <Row label="Operating expenses" value={accountNet(enrichedTrialBalance, "6100", "debit")} />
            </div>
          </div>
        </div>

        <div className="rounded border border-border bg-white">
          <div className="border-b border-border px-4 py-3">
            <h4 className="font-bold">Close Audit</h4>
          </div>
          <div className="divide-y divide-border">
            {events.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">No finance events posted yet.</div>
            ) : (
              events.slice(0, 6).map((event) => (
                <div key={event.id} className="px-4 py-3 text-sm">
                  <p className="font-bold">{event.reference}</p>
                  <p className="text-muted-foreground">{event.action}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{event.detail}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-3 border-t border-border pt-2 font-bold" : "flex justify-between gap-3"}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{formatMoney(value)}</span>
    </div>
  );
}

function addAmount(lines: TrialLine[], accountCode: string, side: "debit" | "credit", amount: number) {
  const line = lines.find((entry) => entry.accountCode === accountCode);
  if (!line) {
    lines.push({
      accountCode,
      debit: side === "debit" ? amount : 0,
      credit: side === "credit" ? amount : 0
    });
    return;
  }

  if (side === "debit") {
    line.debit += amount;
  } else {
    line.credit += amount;
  }
}

function accountNet(lines: Array<TrialLine & { account?: Account }>, accountCode: string, naturalSide: "debit" | "credit") {
  const line = lines.find((entry) => entry.accountCode === accountCode);
  if (!line) return 0;
  return naturalSide === "debit" ? line.debit - line.credit : line.credit - line.debit;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
