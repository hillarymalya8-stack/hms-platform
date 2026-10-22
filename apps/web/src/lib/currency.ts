// The hotel sells rooms and POS items in two currencies: Tanzanian shillings (the primary
// price) and US dollars (an optional second price set alongside it).
export type SaleCurrency = "TZS" | "USD";

export const saleCurrencies: Array<{ code: SaleCurrency; label: string }> = [
  { code: "TZS", label: "TSh" },
  { code: "USD", label: "USD" }
];

export function currencyLabel(code: string) {
  return code === "USD" ? "USD" : "TSh";
}

export function formatCurrency(value: string | number | null | undefined, code: string) {
  const amount = typeof value === "number" ? value : Number(value);
  const safe = Number.isFinite(amount) ? amount : 0;

  if (code === "USD") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(safe);
  }

  return `TSh ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(safe)}`;
}
