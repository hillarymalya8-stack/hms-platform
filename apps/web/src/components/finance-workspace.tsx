"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  BarChart3,
  BookPlus,
  CalendarCheck,
  CheckCircle2,
  FileText,
  Landmark,
  LockKeyhole,
  Plus,
  RefreshCcw,
  Trash2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InvoiceWorkspace } from "@/components/invoice-workspace";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api-client";
import { readSession } from "@/lib/auth";

type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "COST_OF_SALES" | "EXPENSE";

const accountTypes: Array<{ value: AccountType; label: string }> = [
  { value: "ASSET", label: "Asset" },
  { value: "LIABILITY", label: "Liability" },
  { value: "EQUITY", label: "Equity" },
  { value: "REVENUE", label: "Revenue" },
  { value: "COST_OF_SALES", label: "Cost of sales" },
  { value: "EXPENSE", label: "Expense" }
];

type Account = {
  id: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  isControlAccount: boolean;
  active: boolean;
};

type TrialBalanceRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType | null;
  totalDebit: string;
  totalCredit: string;
  debitBalance: string;
  creditBalance: string;
};

type TrialBalance = {
  from: string | null;
  to: string | null;
  generatedAt: string;
  rows: TrialBalanceRow[];
  totals: { totalDebit: string; totalCredit: string; debitBalance: string; creditBalance: string };
  balanced: boolean;
};

type JournalStatus = "DRAFT" | "POSTED" | "REVERSED" | "VOID";

type Journal = {
  id: string;
  entryNumber: string;
  sourceType: string;
  sourceNumber: string | null;
  status: JournalStatus;
  description: string | null;
  createdAt: string;
  postedAt: string | null;
  totalDebit: string;
  totalCredit: string;
  lines: Array<{
    id: string;
    accountCode: string;
    accountName: string;
    debitAmount: string;
    creditAmount: string;
    description: string | null;
  }>;
};

type BusinessDateRecord = {
  id: string;
  businessDate: string;
  status: "OPEN" | "CLOSED" | "REOPENED";
  openedAt: string;
  openedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
};

type BusinessDateResponse = {
  current: BusinessDateRecord;
  draftJournalCount: number;
  history: BusinessDateRecord[];
};

type JournalFormLine = { key: string; accountCode: string; debitAmount: string; creditAmount: string };

type JournalFilter = "DRAFT" | "POSTED" | "ALL";

const amountPattern = /^\d+(\.\d{1,4})?$/;

export function FinanceWorkspace() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalance | null>(null);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [businessDate, setBusinessDate] = useState<BusinessDateResponse | null>(null);
  const [businessDateError, setBusinessDateError] = useState("");
  const [journalFilter, setJournalFilter] = useState<JournalFilter>("DRAFT");
  const [range, setRange] = useState({ from: "", to: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading finance data...");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [accountForm, setAccountForm] = useState({
    accountCode: "",
    accountName: "",
    accountType: "ASSET" as AccountType,
    isControlAccount: false
  });
  const [journalForm, setJournalForm] = useState({ memo: "", reference: "" });
  const [journalLines, setJournalLines] = useState<JournalFormLine[]>([newFormLine(), newFormLine()]);

  useEffect(() => {
    setPermissions(readSession()?.user.permissions ?? []);
  }, []);

  const can = useCallback((code: string) => permissions.includes(code), [permissions]);

  const loadJournals = useCallback(async (filter: JournalFilter) => {
    const query = filter === "ALL" ? "" : `?status=${filter}`;
    const result = await apiRequest<Journal[]>(`/accounting/journals${query}`);
    if (!result.ok) return result.error;
    setJournals(result.data);
    return null;
  }, []);

  const loadTrialBalance = useCallback(async (from: string, to: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const query = params.toString();
    const result = await apiRequest<TrialBalance>(`/accounting/trial-balance${query ? `?${query}` : ""}`);
    if (!result.ok) return result.error;
    setTrialBalance(result.data);
    return null;
  }, []);

  const loadBusinessDate = useCallback(async () => {
    const result = await apiRequest<BusinessDateResponse>("/accounting/business-date");
    if (!result.ok) {
      setBusinessDate(null);
      setBusinessDateError(result.error);
      return result.error;
    }
    setBusinessDate(result.data);
    setBusinessDateError("");
    return null;
  }, []);

  const loadAll = useCallback(
    async (filter: JournalFilter, from: string, to: string) => {
      setLoading(true);
      const accountsResult = await apiRequest<Account[]>("/accounting/accounts");
      if (accountsResult.ok) setAccounts(accountsResult.data);

      const errors = [
        accountsResult.ok ? null : accountsResult.error,
        ...(await Promise.all([loadTrialBalance(from, to), loadJournals(filter), loadBusinessDate()]))
      ].filter((error): error is string => Boolean(error));

      setLoading(false);
      if (errors.length) {
        setMessage(errors[0]);
      } else if (accountsResult.ok && accountsResult.data.length === 0) {
        setMessage("No chart of accounts is set up for this property yet. Add accounts to start posting journals.");
      } else {
        setMessage("Finance data is up to date.");
      }
    },
    [loadBusinessDate, loadJournals, loadTrialBalance]
  );

  useEffect(() => {
    void loadAll("DRAFT", "", "");
  }, [loadAll]);

  const summary = useMemo(() => {
    const rows = trialBalance?.rows ?? [];
    const net = (row: TrialBalanceRow) => Number(row.totalDebit) - Number(row.totalCredit);
    const sumBy = (types: AccountType[], sign: 1 | -1) =>
      rows.filter((row) => row.accountType && types.includes(row.accountType)).reduce((sum, row) => sum + sign * net(row), 0);

    const revenue = sumBy(["REVENUE"], -1);
    const costOfSales = sumBy(["COST_OF_SALES"], 1);
    const expenses = sumBy(["EXPENSE"], 1);
    return {
      revenue,
      costOfSales,
      expenses,
      netProfit: revenue - costOfSales - expenses,
      assets: sumBy(["ASSET"], 1),
      liabilities: sumBy(["LIABILITY"], -1),
      equity: sumBy(["EQUITY"], -1),
      revenueRows: rows.filter((row) => row.accountType === "REVENUE"),
      expenseRows: rows.filter((row) => row.accountType === "COST_OF_SALES" || row.accountType === "EXPENSE")
    };
  }, [trialBalance]);

  const draftJournals = journals.filter((journal) => journal.status === "DRAFT");
  const draftCount = businessDate?.draftJournalCount ?? draftJournals.length;

  const formTotals = useMemo(() => {
    const toCents = (value: string) => (amountPattern.test(value.trim()) ? Math.round(Number(value) * 100) : 0);
    const debit = journalLines.reduce((sum, line) => sum + toCents(line.debitAmount), 0);
    const credit = journalLines.reduce((sum, line) => sum + toCents(line.creditAmount), 0);
    return { debit: debit / 100, credit: credit / 100, balanced: debit > 0 && debit === credit };
  }, [journalLines]);

  async function changeJournalFilter(filter: JournalFilter) {
    setJournalFilter(filter);
    const error = await loadJournals(filter);
    if (error) setMessage(error);
  }

  async function applyRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (range.from && range.to && range.from > range.to) {
      setMessage("The start date must be on or before the end date.");
      return;
    }
    const error = await loadTrialBalance(range.from, range.to);
    setMessage(error ?? "Trial balance updated for the selected dates.");
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountForm.accountCode.trim() || !accountForm.accountName.trim()) {
      setMessage("Enter an account code and account name.");
      return;
    }

    setBusy(true);
    const result = await apiRequest<Account>("/accounting/accounts", {
      method: "POST",
      body: JSON.stringify({
        accountCode: accountForm.accountCode.trim(),
        accountName: accountForm.accountName.trim(),
        accountType: accountForm.accountType,
        isControlAccount: accountForm.isControlAccount
      })
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setAccounts((current) =>
      [...current, result.data].sort((a, b) => a.accountCode.localeCompare(b.accountCode))
    );
    setAccountForm({ accountCode: "", accountName: "", accountType: accountForm.accountType, isControlAccount: false });
    setMessage(`Account ${result.data.accountCode} ${result.data.accountName} added.`);
  }

  function updateLine(key: string, patch: Partial<JournalFormLine>) {
    setJournalLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function createJournal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lines = journalLines.filter((line) => line.accountCode || line.debitAmount.trim() || line.creditAmount.trim());

    if (lines.length < 2) {
      setMessage("A journal needs at least two lines.");
      return;
    }
    for (const [index, line] of lines.entries()) {
      const debit = line.debitAmount.trim();
      const credit = line.creditAmount.trim();
      if (!line.accountCode) {
        setMessage(`Choose an account on line ${index + 1}.`);
        return;
      }
      if ((debit && !amountPattern.test(debit)) || (credit && !amountPattern.test(credit))) {
        setMessage(`Line ${index + 1} has an invalid amount. Use numbers like 125.50.`);
        return;
      }
      if ((Number(debit || 0) > 0) === (Number(credit || 0) > 0)) {
        setMessage(`Line ${index + 1} must have either a debit or a credit amount.`);
        return;
      }
    }
    if (!formTotals.balanced) {
      setMessage(`Debits (${formatMoney(formTotals.debit)}) must equal credits (${formatMoney(formTotals.credit)}).`);
      return;
    }

    setBusy(true);
    const result = await apiRequest<Journal>("/accounting/journals", {
      method: "POST",
      body: JSON.stringify({
        memo: journalForm.memo.trim() || undefined,
        reference: journalForm.reference.trim() || undefined,
        idempotencyKey: `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        lines: lines.map((line) => ({
          accountCode: line.accountCode,
          debitAmount: line.debitAmount.trim() || undefined,
          creditAmount: line.creditAmount.trim() || undefined
        }))
      })
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setJournalForm({ memo: "", reference: "" });
    setJournalLines([newFormLine(), newFormLine()]);
    setJournalFilter("DRAFT");
    await Promise.all([loadJournals("DRAFT"), loadBusinessDate()]);
    setMessage(`Draft journal ${result.data.entryNumber} saved. Post it to update the ledger.`);
  }

  async function postJournal(journal: Journal) {
    setBusy(true);
    const result = await apiRequest<Journal>(`/accounting/journals/${journal.id}/post`, { method: "POST" });
    if (!result.ok) {
      setBusy(false);
      setMessage(result.error);
      return;
    }
    await Promise.all([loadJournals(journalFilter), loadTrialBalance(range.from, range.to), loadBusinessDate()]);
    setBusy(false);
    setMessage(`Journal ${result.data.entryNumber} posted to the general ledger.`);
  }

  async function closeBusinessDate() {
    if (!businessDate) return;
    const closingDate = businessDate.current.businessDate;
    if (!window.confirm(`Close business date ${formatDate(closingDate)} and open the next day?`)) return;

    setBusy(true);
    const result = await apiRequest<{ closed: BusinessDateRecord; current: BusinessDateRecord }>(
      "/accounting/business-date/close",
      { method: "POST", body: JSON.stringify({}) }
    );
    if (!result.ok) {
      setBusy(false);
      setMessage(result.error);
      return;
    }
    await loadBusinessDate();
    setBusy(false);
    setMessage(`${formatDate(result.data.closed.businessDate)} closed. Business date is now ${formatDate(result.data.current.businessDate)}.`);
  }

  const tbRows = trialBalance?.rows ?? [];

  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">Finance Close Workspace</h3>
            <p className="text-sm text-muted-foreground">Post journals, review the ledger, and close the business date.</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={loading || busy}
            onClick={() => void loadAll(journalFilter, range.from, range.to)}
          >
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>

        <p className="rounded border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground" role="status">
          {message}
        </p>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Revenue" value={formatMoney(summary.revenue)} />
          <Stat label="Costs and expenses" value={formatMoney(summary.costOfSales + summary.expenses)} />
          <Stat label="Net profit" value={formatMoney(summary.netProfit)} />
          <Stat label="Draft journals" value={String(draftCount)} />
        </div>

        <div className="overflow-hidden rounded border border-border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
              <h4 className="font-bold">Trial Balance</h4>
            </div>
            {trialBalance && tbRows.length > 0 ? (
              <Badge tone={trialBalance.balanced ? "success" : "danger"}>
                {trialBalance.balanced ? "Balanced" : "Out of balance"}
              </Badge>
            ) : null}
          </div>
          <form onSubmit={applyRange} className="flex flex-wrap items-end gap-2 border-b border-border px-4 py-3">
            <label className="grid gap-1 text-xs text-muted-foreground">
              Posted from
              <Input type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Posted to
              <Input type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} />
            </label>
            <Button type="submit" variant="secondary" disabled={busy}>
              Apply
            </Button>
            {range.from || range.to ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setRange({ from: "", to: "" });
                  void loadTrialBalance("", "");
                }}
              >
                All dates
              </Button>
            ) : null}
          </form>
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
                {tbRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-muted-foreground" colSpan={4}>
                      {loading ? "Loading trial balance..." : "No posted journals yet. Posted activity will appear here."}
                    </td>
                  </tr>
                ) : (
                  tbRows.map((row) => (
                    <tr key={row.accountId} className="border-t border-border">
                      <td className="px-4 py-3 font-semibold">
                        {row.accountCode} {row.accountName}
                      </td>
                      <td className="px-4 py-3">{row.accountType ? accountTypeLabel(row.accountType) : "-"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {Number(row.debitBalance) ? formatMoney(Number(row.debitBalance)) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {Number(row.creditBalance) ? formatMoney(Number(row.creditBalance)) : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="border-t border-border bg-background/70 font-bold">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>
                    Totals
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(Number(trialBalance?.totals.debitBalance ?? 0))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(Number(trialBalance?.totals.creditBalance ?? 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded border border-border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
              <h4 className="font-bold">Journals</h4>
            </div>
            <div className="flex gap-1" role="tablist" aria-label="Journal status">
              {(["DRAFT", "POSTED", "ALL"] as JournalFilter[]).map((filter) => (
                <Button
                  key={filter}
                  type="button"
                  role="tab"
                  aria-selected={journalFilter === filter}
                  variant={journalFilter === filter ? "primary" : "ghost"}
                  className="h-8 px-3"
                  onClick={() => void changeJournalFilter(filter)}
                >
                  {filter === "ALL" ? "All" : filter === "DRAFT" ? "Drafts" : "Posted"}
                </Button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-border">
            {journals.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">
                {loading
                  ? "Loading journals..."
                  : journalFilter === "DRAFT"
                    ? "No draft journals are waiting to be posted."
                    : "No journals found."}
              </div>
            ) : (
              journals.map((journal) => (
                <div key={journal.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold">
                        {journal.entryNumber}
                        {journal.sourceNumber ? <span className="font-normal text-muted-foreground"> / {journal.sourceNumber}</span> : null}
                      </p>
                      <p className="text-muted-foreground">
                        {journal.description ?? sourceLabel(journal.sourceType)} - {formatDateTime(journal.postedAt ?? journal.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{formatMoney(Number(journal.totalDebit))}</span>
                      <Badge tone={journalTone(journal.status)}>{journal.status}</Badge>
                      {journal.status === "DRAFT" && can("accounting.journals.post") ? (
                        <Button type="button" className="h-8 px-3" disabled={busy} onClick={() => void postJournal(journal)}>
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          Post
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <table className="mt-2 w-full text-xs">
                    <tbody>
                      {journal.lines.map((line) => (
                        <tr key={line.id} className="text-muted-foreground">
                          <td className="py-0.5 pr-2">
                            {line.accountCode} {line.accountName}
                          </td>
                          <td className="w-24 py-0.5 text-right tabular-nums">
                            {Number(line.debitAmount) ? formatMoney(Number(line.debitAmount)) : ""}
                          </td>
                          <td className="w-24 py-0.5 text-right tabular-nums">
                            {Number(line.creditAmount) ? formatMoney(Number(line.creditAmount)) : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
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
          {businessDate ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xl font-bold">{formatDate(businessDate.current.businessDate)}</p>
                  <p className="text-xs text-muted-foreground">
                    Opened {formatDateTime(businessDate.current.openedAt)}
                    {businessDate.current.openedBy ? ` by ${businessDate.current.openedBy}` : ""}
                  </p>
                </div>
                <Badge tone={businessDate.current.status === "CLOSED" ? "success" : "warning"}>{businessDate.current.status}</Badge>
              </div>
              {businessDate.draftJournalCount > 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  {businessDate.draftJournalCount} draft journal{businessDate.draftJournalCount === 1 ? "" : "s"} must be posted before closing.
                </p>
              ) : null}
              {can("accounting.journals.post") ? (
                <Button
                  type="button"
                  className="mt-3 w-full"
                  disabled={busy || businessDate.draftJournalCount > 0}
                  onClick={() => void closeBusinessDate()}
                >
                  <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                  Close {formatDate(businessDate.current.businessDate)}
                </Button>
              ) : null}
              {businessDate.history.some((entry) => entry.status === "CLOSED") ? (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Recently closed</p>
                  <ul className="space-y-1 text-sm">
                    {businessDate.history
                      .filter((entry) => entry.status === "CLOSED")
                      .slice(0, 5)
                      .map((entry) => (
                        <li key={entry.id} className="flex justify-between gap-3">
                          <span>{formatDate(entry.businessDate)}</span>
                          <span className="text-muted-foreground">
                            {entry.closedBy ?? "Closed"}
                            {entry.closedAt ? `, ${formatDateTime(entry.closedAt)}` : ""}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{loading ? "Loading business date..." : businessDateError || "No business date available."}</p>
          )}
        </div>

        {can("accounting.journals.create") ? (
          <form onSubmit={createJournal} className="rounded border border-border bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <Banknote className="h-4 w-4 text-primary" aria-hidden="true" />
              <h4 className="font-bold">Manual Journal</h4>
            </div>
            {accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add accounts to the chart of accounts before creating journals.</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    aria-label="Journal memo"
                    value={journalForm.memo}
                    maxLength={240}
                    onChange={(event) => setJournalForm({ ...journalForm, memo: event.target.value })}
                    placeholder="Memo, e.g. Bank charges"
                  />
                  <Input
                    aria-label="Journal reference"
                    value={journalForm.reference}
                    maxLength={80}
                    onChange={(event) => setJournalForm({ ...journalForm, reference: event.target.value })}
                    placeholder="Reference (optional)"
                  />
                </div>
                <div className="mt-3 space-y-2">
                  {journalLines.map((line, index) => (
                    <div key={line.key} className="grid gap-2 sm:grid-cols-[1fr_6.5rem_6.5rem_auto]">
                      <select
                        aria-label={`Line ${index + 1} account`}
                        className="h-10 rounded border border-border bg-white px-3 text-sm"
                        value={line.accountCode}
                        onChange={(event) => updateLine(line.key, { accountCode: event.target.value })}
                      >
                        <option value="">Choose account</option>
                        {accounts
                          .filter((account) => account.active)
                          .map((account) => (
                            <option key={account.id} value={account.accountCode}>
                              {account.accountCode} {account.accountName}
                            </option>
                          ))}
                      </select>
                      <Input
                        aria-label={`Line ${index + 1} debit`}
                        inputMode="decimal"
                        value={line.debitAmount}
                        onChange={(event) => updateLine(line.key, { debitAmount: event.target.value, creditAmount: event.target.value ? "" : line.creditAmount })}
                        placeholder="Debit"
                      />
                      <Input
                        aria-label={`Line ${index + 1} credit`}
                        inputMode="decimal"
                        value={line.creditAmount}
                        onChange={(event) => updateLine(line.key, { creditAmount: event.target.value, debitAmount: event.target.value ? "" : line.debitAmount })}
                        placeholder="Credit"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        className="px-3"
                        aria-label={`Remove line ${index + 1}`}
                        disabled={journalLines.length <= 2}
                        onClick={() => setJournalLines((current) => current.filter((entry) => entry.key !== line.key))}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <Button type="button" variant="secondary" onClick={() => setJournalLines((current) => [...current, newFormLine()])}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add line
                  </Button>
                  <span className={formTotals.balanced ? "font-semibold text-success" : "text-muted-foreground"}>
                    Dr {formatMoney(formTotals.debit)} / Cr {formatMoney(formTotals.credit)}
                  </span>
                </div>
                <Button className="mt-3" disabled={busy}>
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Save as draft
                </Button>
              </>
            )}
          </form>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded border border-border bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <Landmark className="h-4 w-4 text-primary" aria-hidden="true" />
              <h4 className="font-bold">Balance Sheet</h4>
            </div>
            <div className="space-y-2 text-sm">
              <Row label="Assets" value={summary.assets} />
              <Row label="Liabilities" value={summary.liabilities} />
              <Row label="Equity" value={summary.equity} />
              <Row label="Current profit" value={summary.netProfit} strong />
            </div>
          </div>
          <div className="rounded border border-border bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
              <h4 className="font-bold">Profit and Loss</h4>
            </div>
            <div className="space-y-2 text-sm">
              {summary.revenueRows.length === 0 && summary.expenseRows.length === 0 ? (
                <p className="text-muted-foreground">No posted revenue or expenses yet.</p>
              ) : (
                <>
                  {summary.revenueRows.map((row) => (
                    <Row key={row.accountId} label={row.accountName} value={Number(row.totalCredit) - Number(row.totalDebit)} />
                  ))}
                  {summary.expenseRows.map((row) => (
                    <Row key={row.accountId} label={row.accountName} value={-(Number(row.totalDebit) - Number(row.totalCredit))} />
                  ))}
                  <Row label="Net profit" value={summary.netProfit} strong />
                </>
              )}
            </div>
          </div>
        </div>

        <div className="rounded border border-border bg-white">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <BookPlus className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Chart of Accounts</h4>
            <span className="ml-auto text-xs text-muted-foreground">{accounts.length} accounts</span>
          </div>
          {can("accounting.accounts.manage") ? (
            <form onSubmit={createAccount} className="grid gap-2 border-b border-border p-4 sm:grid-cols-[6rem_1fr]">
              <Input
                aria-label="Account code"
                value={accountForm.accountCode}
                maxLength={20}
                onChange={(event) => setAccountForm({ ...accountForm, accountCode: event.target.value })}
                placeholder="Code"
              />
              <Input
                aria-label="Account name"
                value={accountForm.accountName}
                maxLength={160}
                onChange={(event) => setAccountForm({ ...accountForm, accountName: event.target.value })}
                placeholder="Account name"
              />
              <select
                aria-label="Account type"
                className="h-10 rounded border border-border bg-white px-3 text-sm sm:col-span-2"
                value={accountForm.accountType}
                onChange={(event) => setAccountForm({ ...accountForm, accountType: event.target.value as AccountType })}
              >
                {accountTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={accountForm.isControlAccount}
                  onChange={(event) => setAccountForm({ ...accountForm, isControlAccount: event.target.checked })}
                />
                Control account
              </label>
              <Button className="sm:col-span-2" disabled={busy}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add account
              </Button>
            </form>
          ) : null}
          <div className="max-h-80 divide-y divide-border overflow-y-auto">
            {accounts.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">
                {loading ? "Loading accounts..." : "No accounts have been set up for this property."}
              </div>
            ) : (
              accounts.map((account) => (
                <div key={account.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{account.accountCode}</span> {account.accountName}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {accountTypeLabel(account.accountType)}
                    {account.isControlAccount ? " / control" : ""}
                    {account.active ? "" : " / inactive"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-white p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-3 border-t border-border pt-2 font-bold" : "flex justify-between gap-3"}>
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="tabular-nums">{formatMoney(value)}</span>
    </div>
  );
}

function newFormLine(): JournalFormLine {
  return { key: `line-${Date.now()}-${Math.random().toString(16).slice(2)}`, accountCode: "", debitAmount: "", creditAmount: "" };
}

function accountTypeLabel(type: AccountType) {
  return accountTypes.find((entry) => entry.value === type)?.label ?? type;
}

function sourceLabel(sourceType: string) {
  return sourceType === "MANUAL" ? "Manual journal" : sourceType;
}

function journalTone(status: JournalStatus) {
  if (status === "POSTED") return "success" as const;
  if (status === "DRAFT") return "warning" as const;
  if (status === "VOID") return "danger" as const;
  return "neutral" as const;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${value.slice(0, 10)}T00:00:00.000Z`)
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
