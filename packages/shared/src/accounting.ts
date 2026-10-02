export const accountTypes = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "COST_OF_SALES",
  "EXPENSE"
] as const;

export type AccountType = (typeof accountTypes)[number];

export type JournalLineDraft = {
  accountCode: string;
  debitAmount?: string | number;
  creditAmount?: string | number;
  description?: string;
};
