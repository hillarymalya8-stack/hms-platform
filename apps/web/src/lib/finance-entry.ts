export type FinanceAccount = {
  id: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  active: boolean;
};

export type EverydayEntry = {
  kind: "income" | "expense" | "transfer";
  moneyAccount: string;
  otherAccount: string;
  amount: string;
  description: string;
  reference: string;
};

export function moneyAccounts(accounts: FinanceAccount[]) {
  return accounts.filter(
    (account) =>
      account.active &&
      account.accountType === "ASSET" &&
      /\b(cash|bank|wallet|mobile money|m-?pesa|tigopesa|selcom|paypal|crdb|nmb)\b/i.test(account.accountName)
  );
}

export function everydayEntryLines(entry: EverydayEntry, accounts: FinanceAccount[]) {
  const amount = entry.amount.trim();
  if (!/^\d+(\.\d{1,4})?$/.test(amount) || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    throw new Error("Enter an amount greater than zero, with up to four decimal places.");
  }
  if (!entry.description.trim()) throw new Error("Describe what this payment is for.");
  const availableMoney = moneyAccounts(accounts);
  if (!availableMoney.some((account) => account.accountCode === entry.moneyAccount)) {
    throw new Error("Choose where the money is received or paid from.");
  }
  const other = accounts.find((account) => account.active && account.accountCode === entry.otherAccount);
  const allowed =
    entry.kind === "transfer"
      ? availableMoney.some((account) => account.accountCode === entry.otherAccount)
      : entry.kind === "income"
        ? other?.accountType === "REVENUE"
        : other?.accountType === "EXPENSE" || other?.accountType === "COST_OF_SALES";
  if (!allowed) throw new Error("Choose a valid category or destination.");
  if (entry.moneyAccount === entry.otherAccount) throw new Error("Choose two different places for a transfer.");
  const debit = entry.kind === "income" ? entry.moneyAccount : entry.otherAccount;
  const credit = entry.kind === "income" ? entry.otherAccount : entry.moneyAccount;
  return [
    { accountCode: debit, debitAmount: amount },
    { accountCode: credit, creditAmount: amount }
  ];
}
