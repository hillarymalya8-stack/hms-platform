// Shared helpers for the front-office day expenses log and Finance day sales.
export type DayExpense = {
  id: string;
  date: string;
  description: string;
  amount: string;
  currencyCode: string;
  paidBy: string | null;
  recordedBy: string;
  createdAt: string;
  voided: boolean;
  voidedBy: string | null;
};

export type CurrencyAmount = { currencyCode: string; amount: string };

export const expensePaidFromOptions = ["Cash", "Mobile money", "Bank", "Card", "Other"];

export function localIsoDate(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export const paymentMethodLabels: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  CREDIT: "Credit",
  MOBILE_MONEY: "Mobile money",
  BANK_TRANSFER: "Bank transfer",
  ROOM_CHARGE: "Charged to room"
};
