import { AccountType } from "@prisma/client";

// Starting chart of accounts for a new hotel. Accounts can be added later from Finance.
export const defaultChartOfAccounts = [
  ["1100", "Cash", AccountType.ASSET, true],
  ["1200", "Bank", AccountType.ASSET, true],
  ["1300", "Accounts Receivable", AccountType.ASSET, true],
  ["1400", "Inventory", AccountType.ASSET, true],
  ["2100", "Accounts Payable", AccountType.LIABILITY, true],
  ["2200", "Tax Payable", AccountType.LIABILITY, true],
  ["2300", "Customer Deposits", AccountType.LIABILITY, true],
  ["3100", "Owner Capital", AccountType.EQUITY, false],
  ["3200", "Retained Earnings", AccountType.EQUITY, false],
  ["4100", "Room Revenue", AccountType.REVENUE, false],
  ["4200", "Restaurant Revenue", AccountType.REVENUE, false],
  ["4300", "Bar Revenue", AccountType.REVENUE, false],
  ["4400", "Other Revenue", AccountType.REVENUE, false],
  ["5100", "Food Cost", AccountType.COST_OF_SALES, false],
  ["5200", "Beverage Cost", AccountType.COST_OF_SALES, false],
  ["6100", "Salaries", AccountType.EXPENSE, false],
  ["6200", "Utilities", AccountType.EXPENSE, false],
  ["6300", "Repairs", AccountType.EXPENSE, false],
  ["6400", "Marketing", AccountType.EXPENSE, false],
  ["6500", "Other Expenses", AccountType.EXPENSE, false]
] as const;

export const defaultNumberingRules = {
  reservation: "RES-{YYYY}-{00000}",
  receipt: "RCT-{YYYY}-{00000}",
  invoice: "INV-{YYYY}-{00000}",
  journal: "JRN-{YYYY}-{00000}"
};

export const defaultStoreTypes = { MAIN: "STORE", BAR: "BAR", KITCHEN: "KITCHEN" } as const;
