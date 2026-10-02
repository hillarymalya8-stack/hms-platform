import { Prisma } from "@prisma/client";

export type JournalLineInput = {
  accountCode: string;
  debitAmount?: string | number;
  creditAmount?: string | number;
  description?: string;
};

export type BalancedJournalResult = {
  balanced: true;
  totalDebit: string;
  totalCredit: string;
  lineCount: number;
};

export class JournalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JournalValidationError";
  }
}

export function validateBalancedJournal(lines: JournalLineInput[]): BalancedJournalResult {
  if (lines.length < 2) {
    throw new JournalValidationError("A journal entry must have at least two lines.");
  }

  let totalDebit = new Prisma.Decimal(0);
  let totalCredit = new Prisma.Decimal(0);

  for (const [index, line] of lines.entries()) {
    const debit = toMoneyDecimal(line.debitAmount ?? "0", `lines.${index}.debitAmount`);
    const credit = toMoneyDecimal(line.creditAmount ?? "0", `lines.${index}.creditAmount`);

    if (debit.isNegative() || credit.isNegative()) {
      throw new JournalValidationError("Journal amounts cannot be negative.");
    }

    if (debit.gt(0) && credit.gt(0)) {
      throw new JournalValidationError("A journal line cannot contain both debit and credit amounts.");
    }

    if (debit.eq(0) && credit.eq(0)) {
      throw new JournalValidationError("A journal line must contain either a debit or a credit amount.");
    }

    totalDebit = totalDebit.plus(debit);
    totalCredit = totalCredit.plus(credit);
  }

  if (!totalDebit.eq(totalCredit)) {
    throw new JournalValidationError(
      `Journal entry is not balanced. Debits ${totalDebit.toFixed(4)} do not equal credits ${totalCredit.toFixed(4)}.`
    );
  }

  return {
    balanced: true,
    totalDebit: totalDebit.toFixed(4),
    totalCredit: totalCredit.toFixed(4),
    lineCount: lines.length
  };
}

function toMoneyDecimal(value: string | number, fieldName: string) {
  if (typeof value === "number" && !Number.isInteger(value)) {
    throw new JournalValidationError(`${fieldName} must be sent as a decimal string, not a floating point number.`);
  }

  try {
    return new Prisma.Decimal(value);
  } catch {
    throw new JournalValidationError(`${fieldName} is not a valid decimal amount.`);
  }
}
