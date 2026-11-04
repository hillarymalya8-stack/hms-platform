import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { UserContext } from "../../common/auth/user-context";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateDayExpenseDto } from "./dto/create-day-expense.dto";

// Day expenses noted by reception. Finance reads the same records in its Day sales summary.
@Injectable()
export class DayExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: UserContext, date?: string) {
    const propertyId = requireProperty(user);
    const expenseDate = parseDay(date);
    const rows = await this.prisma.frontOfficeExpense.findMany({
      where: { propertyId, expenseDate },
      orderBy: { createdAt: "asc" }
    });
    return { date: isoDay(expenseDate), expenses: rows.map(serializeExpense), totals: totalsByCurrency(rows) };
  }

  async create(user: UserContext, dto: CreateDayExpenseDto) {
    const propertyId = requireProperty(user);
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0)) throw new BadRequestException("Enter an amount greater than zero.");
    const description = dto.description.trim();
    if (description.length < 2) throw new BadRequestException("Describe what the money was spent on.");

    const expense = await this.prisma.frontOfficeExpense.create({
      data: {
        propertyId,
        expenseDate: parseDay(dto.date),
        description,
        amount,
        currencyCode: dto.currencyCode ?? "TZS",
        paidBy: dto.paidBy?.trim() || null,
        recordedByUserId: user.userId,
        recordedByName: user.fullName
      }
    });
    await this.audit(user, "record_day_expense", expense.id, `Recorded day expense "${description}" (${expense.currencyCode} ${amount.toFixed(2)}).`);
    return serializeExpense(expense);
  }

  async void(user: UserContext, id: string) {
    const propertyId = requireProperty(user);
    const expense = await this.prisma.frontOfficeExpense.findFirst({ where: { id, propertyId } });
    if (!expense) throw new NotFoundException("Expense not found.");
    if (expense.voidedAt) return serializeExpense(expense);
    const updated = await this.prisma.frontOfficeExpense.update({
      where: { id },
      data: { voidedAt: new Date(), voidedByUserId: user.userId, voidedByName: user.fullName }
    });
    await this.audit(
      user,
      "remove_day_expense",
      id,
      `Removed day expense "${expense.description}" (${expense.currencyCode} ${expense.amount.toFixed(2)}), recorded by ${expense.recordedByName ?? "Not recorded"}.`
    );
    return serializeExpense(updated);
  }

  private async audit(user: UserContext, action: string, recordId: string, summary: string) {
    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        propertyId: user.propertyId,
        userId: user.userId,
        actorName: user.fullName,
        module: "front_office",
        action,
        recordType: "front_office_expense",
        recordId,
        summary
      }
    });
  }
}

type ExpenseRow = Prisma.FrontOfficeExpenseGetPayload<object>;

export function serializeExpense(row: ExpenseRow) {
  return {
    id: row.id,
    date: isoDay(row.expenseDate),
    description: row.description,
    amount: row.amount.toFixed(2),
    currencyCode: row.currencyCode,
    paidBy: row.paidBy,
    recordedBy: row.recordedByName ?? "Not recorded",
    createdAt: row.createdAt,
    voided: Boolean(row.voidedAt),
    voidedBy: row.voidedAt ? (row.voidedByName ?? "Not recorded") : null
  };
}

export function totalsByCurrency(rows: ExpenseRow[]) {
  const totals = new Map<string, Prisma.Decimal>();
  for (const row of rows) {
    if (row.voidedAt) continue;
    totals.set(row.currencyCode, (totals.get(row.currencyCode) ?? new Prisma.Decimal(0)).plus(row.amount));
  }
  return [...totals.entries()].map(([currencyCode, amount]) => ({ currencyCode, amount: amount.toFixed(2) }));
}

export function parseDay(value?: string) {
  const datePart = value?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const date = new Date(`${datePart}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new BadRequestException("Date is invalid.");
  return date;
}

export function isoDay(value: Date) {
  return value.toISOString().slice(0, 10);
}

function requireProperty(user: UserContext) {
  if (!user.propertyId) throw new BadRequestException("A property context is required.");
  return user.propertyId;
}
