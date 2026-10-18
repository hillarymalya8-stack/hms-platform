import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { BusinessDateStatus, FinancialPeriodStatus, JournalStatus, Prisma } from "@prisma/client";
import { UserContext } from "../../common/auth/user-context";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CloseBusinessDateDto } from "./dto/close-business-date.dto";
import { CreateAccountDto } from "./dto/create-account.dto";
import { CreateJournalDto } from "./dto/create-journal.dto";
import { ValidateJournalDto } from "./dto/validate-journal.dto";
import { JournalLineInput, JournalValidationError, validateBalancedJournal } from "./journal-balancer";

const MANUAL_SOURCE_TYPE = "MANUAL";
const OPEN_BUSINESS_DATE_STATUSES = [BusinessDateStatus.OPEN, BusinessDateStatus.REOPENED];
const LEDGER_STATUSES = [JournalStatus.POSTED, JournalStatus.REVERSED];

const journalInclude = {
  lines: {
    include: {
      account: {
        select: { id: true, accountCode: true, accountName: true, accountType: true }
      }
    },
    orderBy: { createdAt: "asc" }
  },
  financialPeriod: {
    select: { id: true, startDate: true, endDate: true, status: true }
  }
} satisfies Prisma.JournalEntryInclude;

type JournalWithLines = Prisma.JournalEntryGetPayload<{ include: typeof journalInclude }>;

@Injectable()
export class AccountingService {
  constructor(
    private readonly audit: AuditService,
    private readonly prisma: PrismaService
  ) {}

  // ---------------------------------------------------------------------------
  // Chart of accounts
  // ---------------------------------------------------------------------------

  listAccounts(user: UserContext) {
    // An empty chart of accounts simply yields an empty list; property setup seeds it elsewhere.
    return this.prisma.account.findMany({
      where: this.accountScope(user),
      orderBy: [{ accountCode: "asc" }]
    });
  }

  async createAccount(user: UserContext, dto: CreateAccountDto) {
    const accountCode = dto.accountCode.trim();
    const accountName = dto.accountName.trim();
    if (!accountCode || !accountName) {
      throw new BadRequestException("Account code and account name are required.");
    }

    const existing = await this.prisma.account.findFirst({
      where: {
        organizationId: user.organizationId,
        propertyId: user.propertyId ?? null,
        accountCode
      }
    });

    if (existing) {
      throw new ConflictException("An account with this code already exists for this property.");
    }

    if (dto.parentId) {
      const parent = await this.prisma.account.findFirst({
        where: { id: dto.parentId, ...this.accountScope(user) }
      });
      if (!parent) {
        throw new BadRequestException("The parent account was not found.");
      }
    }

    const account = await this.prisma.account.create({
      data: {
        organizationId: user.organizationId,
        propertyId: user.propertyId,
        parentId: dto.parentId,
        accountCode,
        accountName,
        accountType: dto.accountType,
        isControlAccount: dto.isControlAccount ?? false
      }
    });

    await this.audit.record({
      organizationId: user.organizationId,
      propertyId: user.propertyId,
      userId: user.userId,
      module: "accounting",
      action: "create_account",
      recordType: "account",
      recordId: account.id,
      newValue: {
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        isControlAccount: account.isControlAccount
      } satisfies Prisma.InputJsonValue
    });

    return account;
  }

  validateJournal(dto: ValidateJournalDto) {
    return this.assertBalanced(dto.lines);
  }

  // ---------------------------------------------------------------------------
  // Trial balance
  // ---------------------------------------------------------------------------

  async trialBalance(user: UserContext, from?: string, to?: string) {
    const propertyId = this.requireProperty(user);
    const fromDate = from ? parseDateOnly(from, "from") : undefined;
    const toDate = to ? parseDateOnly(to, "to") : undefined;
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException("The start date must be on or before the end date.");
    }
    const toExclusive = toDate ? addDays(toDate, 1) : undefined;

    const grouped = await this.prisma.journalLine.groupBy({
      by: ["accountId"],
      where: {
        journalEntry: {
          propertyId,
          status: { in: LEDGER_STATUSES },
          postedAt: fromDate || toExclusive ? { gte: fromDate, lt: toExclusive } : undefined
        }
      },
      _sum: { debitAmount: true, creditAmount: true }
    });

    const accounts = grouped.length
      ? await this.prisma.account.findMany({
          where: { id: { in: grouped.map((row) => row.accountId) } },
          select: { id: true, accountCode: true, accountName: true, accountType: true }
        })
      : [];
    const accountById = new Map(accounts.map((account) => [account.id, account]));

    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);
    let balanceDebit = new Prisma.Decimal(0);
    let balanceCredit = new Prisma.Decimal(0);

    const rows = grouped
      .map((row) => {
        const account = accountById.get(row.accountId);
        const debit = row._sum.debitAmount ?? new Prisma.Decimal(0);
        const credit = row._sum.creditAmount ?? new Prisma.Decimal(0);
        const net = debit.minus(credit);
        const debitBalance = net.gt(0) ? net : new Prisma.Decimal(0);
        const creditBalance = net.lt(0) ? net.negated() : new Prisma.Decimal(0);

        totalDebit = totalDebit.plus(debit);
        totalCredit = totalCredit.plus(credit);
        balanceDebit = balanceDebit.plus(debitBalance);
        balanceCredit = balanceCredit.plus(creditBalance);

        return {
          accountId: row.accountId,
          accountCode: account?.accountCode ?? "",
          accountName: account?.accountName ?? "Unknown account",
          accountType: account?.accountType ?? null,
          totalDebit: money(debit),
          totalCredit: money(credit),
          debitBalance: money(debitBalance),
          creditBalance: money(creditBalance)
        };
      })
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    return {
      from: fromDate ? isoDate(fromDate) : null,
      to: toDate ? isoDate(toDate) : null,
      generatedAt: new Date().toISOString(),
      rows,
      totals: {
        totalDebit: money(totalDebit),
        totalCredit: money(totalCredit),
        debitBalance: money(balanceDebit),
        creditBalance: money(balanceCredit)
      },
      balanced: totalDebit.eq(totalCredit)
    };
  }

  // ---------------------------------------------------------------------------
  // Journals
  // ---------------------------------------------------------------------------

  async listJournals(user: UserContext, status?: string, limit?: string) {
    const propertyId = this.requireProperty(user);
    const statusFilter = parseJournalStatus(status);
    const take = Math.min(Math.max(Number.parseInt(limit ?? "", 10) || 50, 1), 200);

    const journals = await this.prisma.journalEntry.findMany({
      where: { propertyId, status: statusFilter },
      include: journalInclude,
      orderBy: [{ createdAt: "desc" }],
      take
    });

    return journals.map(serializeJournal);
  }

  async createJournal(user: UserContext, dto: CreateJournalDto) {
    const propertyId = this.requireProperty(user);
    const totals = this.assertBalanced(dto.lines);
    const idempotencyKey = dto.idempotencyKey?.trim() || undefined;

    if (idempotencyKey) {
      const existing = await this.prisma.journalEntry.findUnique({
        where: { propertyId_idempotencyKey: { propertyId, idempotencyKey } },
        include: journalInclude
      });
      if (existing) {
        return serializeJournal(existing);
      }
    }

    const codes = [...new Set(dto.lines.map((line) => line.accountCode.trim()))];
    const accounts = await this.prisma.account.findMany({
      where: { ...this.accountScope(user), accountCode: { in: codes } }
    });
    // Prefer the property-level account when an organization-level account shares the same code.
    const accountByCode = new Map<string, (typeof accounts)[number]>();
    for (const account of accounts) {
      const current = accountByCode.get(account.accountCode);
      if (!current || (current.propertyId === null && account.propertyId !== null)) {
        accountByCode.set(account.accountCode, account);
      }
    }

    const missing = codes.filter((code) => !accountByCode.has(code));
    if (missing.length) {
      throw new BadRequestException(`Unknown account code(s): ${missing.join(", ")}.`);
    }
    const inactive = codes.filter((code) => !accountByCode.get(code)!.active);
    if (inactive.length) {
      throw new BadRequestException(`Inactive account code(s) cannot be used: ${inactive.join(", ")}.`);
    }

    const memo = dto.memo?.trim() || undefined;
    const reference = dto.reference?.trim() || undefined;
    const businessDate = await this.currentOrInitialBusinessDate(user, propertyId);

    const journal = await this.withEntryNumberRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const period = await this.resolveOpenPeriod(tx, propertyId, businessDate.businessDate);
        const entryNumber = await nextEntryNumber(tx, propertyId, businessDate.businessDate);

        return tx.journalEntry.create({
          data: {
            propertyId,
            financialPeriodId: period.id,
            entryNumber,
            sourceType: MANUAL_SOURCE_TYPE,
            sourceNumber: reference,
            status: JournalStatus.DRAFT,
            idempotencyKey,
            lines: {
              create: dto.lines.map((line) => ({
                accountId: accountByCode.get(line.accountCode.trim())!.id,
                debitAmount: new Prisma.Decimal(line.debitAmount?.trim() || "0"),
                creditAmount: new Prisma.Decimal(line.creditAmount?.trim() || "0"),
                description: line.description?.trim() || memo
              }))
            }
          },
          include: journalInclude
        });
      })
    );

    await this.audit.record({
      organizationId: user.organizationId,
      propertyId,
      userId: user.userId,
      module: "accounting",
      action: "create_journal",
      recordType: "journal_entry",
      recordId: journal.id,
      newValue: {
        entryNumber: journal.entryNumber,
        status: journal.status,
        reference: reference ?? null,
        memo: memo ?? null,
        businessDate: isoDate(businessDate.businessDate),
        totalDebit: totals.totalDebit,
        totalCredit: totals.totalCredit,
        lineCount: totals.lineCount
      } satisfies Prisma.InputJsonValue
    });

    return serializeJournal(journal);
  }

  async postJournal(user: UserContext, journalId: string) {
    const propertyId = this.requireProperty(user);
    const journal = await this.prisma.journalEntry.findFirst({
      where: { id: journalId, propertyId },
      include: journalInclude
    });

    if (!journal) {
      throw new NotFoundException("Journal entry not found.");
    }
    if (journal.status !== JournalStatus.DRAFT) {
      throw new ConflictException(`Only draft journals can be posted. This journal is ${journal.status.toLowerCase()}.`);
    }
    if (journal.financialPeriod.status !== FinancialPeriodStatus.OPEN) {
      throw new ConflictException("The financial period for this journal is closed. Reopen it before posting.");
    }

    // Re-check the stored lines before they reach the ledger.
    this.assertBalanced(
      journal.lines.map((line) => ({
        accountCode: line.account.accountCode,
        debitAmount: line.debitAmount.toString(),
        creditAmount: line.creditAmount.toString()
      }))
    );

    const postedAt = new Date();
    const updated = await this.prisma.journalEntry.updateMany({
      where: { id: journal.id, propertyId, status: JournalStatus.DRAFT },
      data: { status: JournalStatus.POSTED, postedAt }
    });
    if (updated.count === 0) {
      throw new ConflictException("This journal was already posted by someone else.");
    }

    const posted = await this.prisma.journalEntry.findUniqueOrThrow({
      where: { id: journal.id },
      include: journalInclude
    });

    await this.audit.record({
      organizationId: user.organizationId,
      propertyId,
      userId: user.userId,
      module: "accounting",
      action: "post_journal",
      recordType: "journal_entry",
      recordId: journal.id,
      previousValue: { status: journal.status } satisfies Prisma.InputJsonValue,
      newValue: {
        entryNumber: posted.entryNumber,
        status: posted.status,
        postedAt: postedAt.toISOString()
      } satisfies Prisma.InputJsonValue
    });

    return serializeJournal(posted);
  }

  // ---------------------------------------------------------------------------
  // Business date
  // ---------------------------------------------------------------------------

  async getBusinessDate(user: UserContext) {
    const propertyId = this.requireProperty(user);
    const current = await this.currentOrInitialBusinessDate(user, propertyId);
    const [history, draftJournalCount] = await Promise.all([
      this.prisma.businessDate.findMany({
        where: { propertyId },
        include: businessDateInclude,
        orderBy: { businessDate: "desc" },
        take: 10
      }),
      this.prisma.journalEntry.count({ where: { propertyId, status: JournalStatus.DRAFT } })
    ]);

    return {
      current: serializeBusinessDate(current),
      draftJournalCount,
      history: history.map(serializeBusinessDate)
    };
  }

  async closeBusinessDate(user: UserContext, dto: CloseBusinessDateDto) {
    const propertyId = this.requireProperty(user);

    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.businessDate.findFirst({
        where: { propertyId, status: { in: OPEN_BUSINESS_DATE_STATUSES } },
        orderBy: { businessDate: "desc" }
      });
      if (!current) {
        throw new ConflictException("There is no open business date to close.");
      }

      if (!dto.allowDraftJournals) {
        const drafts = await tx.journalEntry.count({ where: { propertyId, status: JournalStatus.DRAFT } });
        if (drafts > 0) {
          throw new ConflictException(
            `${drafts} draft journal${drafts === 1 ? " is" : "s are"} waiting to be posted. Post them before closing the business date.`
          );
        }
      }

      const closedAt = new Date();
      const closed = await tx.businessDate.updateMany({
        where: { id: current.id, status: { in: OPEN_BUSINESS_DATE_STATUSES } },
        data: { status: BusinessDateStatus.CLOSED, closedAt, closedById: user.userId }
      });
      if (closed.count === 0) {
        throw new ConflictException("This business date was already closed.");
      }

      const nextDate = addDays(current.businessDate, 1);
      const existingNext = await tx.businessDate.findUnique({
        where: { propertyId_businessDate: { propertyId, businessDate: nextDate } }
      });

      let next;
      if (existingNext) {
        if (existingNext.status === BusinessDateStatus.CLOSED) {
          throw new ConflictException(`${isoDate(nextDate)} is already closed. Reopen it before closing ${isoDate(current.businessDate)}.`);
        }
        next = existingNext;
      } else {
        next = await tx.businessDate.create({
          data: {
            propertyId,
            businessDate: nextDate,
            status: BusinessDateStatus.OPEN,
            openedById: user.userId,
            openedAt: closedAt
          }
        });
      }

      return { closedId: current.id, closedDate: current.businessDate, nextId: next.id };
    });

    const [closedRecord, openRecord] = await Promise.all([
      this.prisma.businessDate.findUniqueOrThrow({ where: { id: result.closedId }, include: businessDateInclude }),
      this.prisma.businessDate.findUniqueOrThrow({ where: { id: result.nextId }, include: businessDateInclude })
    ]);

    await this.audit.record({
      organizationId: user.organizationId,
      propertyId,
      userId: user.userId,
      module: "accounting",
      action: "close_business_date",
      recordType: "business_date",
      recordId: result.closedId,
      previousValue: { businessDate: isoDate(result.closedDate), status: "OPEN" } satisfies Prisma.InputJsonValue,
      newValue: {
        businessDate: isoDate(result.closedDate),
        status: BusinessDateStatus.CLOSED,
        nextBusinessDate: isoDate(openRecord.businessDate),
        allowDraftJournals: Boolean(dto.allowDraftJournals)
      } satisfies Prisma.InputJsonValue
    });

    return {
      closed: serializeBusinessDate(closedRecord),
      current: serializeBusinessDate(openRecord)
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private accountScope(user: UserContext): Prisma.AccountWhereInput {
    return {
      organizationId: user.organizationId,
      OR: user.propertyId ? [{ propertyId: user.propertyId }, { propertyId: null }] : undefined
    };
  }

  private requireProperty(user: UserContext) {
    if (!user.propertyId) {
      throw new BadRequestException("A property context is required.");
    }
    return user.propertyId;
  }

  private assertBalanced(lines: JournalLineInput[]) {
    try {
      return validateBalancedJournal(lines);
    } catch (error) {
      if (error instanceof JournalValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  /**
   * Returns the property's open business date. A property that has never had a business date
   * gets one opened for today so finance work can start; this is recorded in the audit log.
   */
  private async currentOrInitialBusinessDate(user: UserContext, propertyId: string) {
    const current = await this.prisma.businessDate.findFirst({
      where: { propertyId, status: { in: OPEN_BUSINESS_DATE_STATUSES } },
      include: businessDateInclude,
      orderBy: { businessDate: "desc" }
    });
    if (current) {
      return current;
    }

    const anyDate = await this.prisma.businessDate.findFirst({
      where: { propertyId },
      orderBy: { businessDate: "desc" }
    });
    if (anyDate) {
      throw new ConflictException(
        `No business date is open. The last business date (${isoDate(anyDate.businessDate)}) is closed and must be reopened.`
      );
    }

    const today = parseDateOnly(new Date().toISOString().slice(0, 10), "date");
    const created = await this.prisma.businessDate.upsert({
      where: { propertyId_businessDate: { propertyId, businessDate: today } },
      update: {},
      create: { propertyId, businessDate: today, status: BusinessDateStatus.OPEN, openedById: user.userId },
      include: businessDateInclude
    });

    await this.audit.record({
      organizationId: user.organizationId,
      propertyId,
      userId: user.userId,
      module: "accounting",
      action: "open_business_date",
      recordType: "business_date",
      recordId: created.id,
      newValue: { businessDate: isoDate(created.businessDate), status: created.status } satisfies Prisma.InputJsonValue
    });

    return created;
  }

  /** Finds the financial period that contains the date, opening a calendar-month period when none exists. */
  private async resolveOpenPeriod(tx: Prisma.TransactionClient, propertyId: string, date: Date) {
    const period = await tx.financialPeriod.findFirst({
      where: { propertyId, startDate: { lte: date }, endDate: { gte: date } },
      orderBy: { startDate: "desc" }
    });

    if (period) {
      if (period.status !== FinancialPeriodStatus.OPEN) {
        throw new ConflictException(
          `The financial period ${isoDate(period.startDate)} to ${isoDate(period.endDate)} is ${period.status.toLowerCase()}.`
        );
      }
      return period;
    }

    const startDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const endDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    return tx.financialPeriod.upsert({
      where: { propertyId_startDate_endDate: { propertyId, startDate, endDate } },
      update: {},
      create: { propertyId, startDate, endDate, status: FinancialPeriodStatus.OPEN }
    });
  }

  private async withEntryNumberRetry<T>(work: () => Promise<T>) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await work();
      } catch (error) {
        const isUniqueClash =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          String(error.meta?.target ?? "").includes("entry_number");
        if (!isUniqueClash || attempt >= 2) {
          throw error;
        }
      }
    }
  }
}

const businessDateInclude = {
  openedBy: { select: { id: true, fullName: true } },
  closedBy: { select: { id: true, fullName: true } }
} satisfies Prisma.BusinessDateInclude;

type BusinessDateWithUsers = Prisma.BusinessDateGetPayload<{ include: typeof businessDateInclude }>;

function serializeBusinessDate(record: BusinessDateWithUsers) {
  return {
    id: record.id,
    businessDate: isoDate(record.businessDate),
    status: record.status,
    openedAt: record.openedAt.toISOString(),
    openedBy: record.openedBy?.fullName ?? null,
    closedAt: record.closedAt?.toISOString() ?? null,
    closedBy: record.closedBy?.fullName ?? null
  };
}

function serializeJournal(journal: JournalWithLines) {
  const totalDebit = journal.lines.reduce((sum, line) => sum.plus(line.debitAmount), new Prisma.Decimal(0));
  const totalCredit = journal.lines.reduce((sum, line) => sum.plus(line.creditAmount), new Prisma.Decimal(0));

  return {
    id: journal.id,
    entryNumber: journal.entryNumber,
    sourceType: journal.sourceType,
    sourceId: journal.sourceId,
    sourceNumber: journal.sourceNumber,
    status: journal.status,
    description: journal.lines.find((line) => line.description)?.description ?? null,
    createdAt: journal.createdAt.toISOString(),
    postedAt: journal.postedAt?.toISOString() ?? null,
    financialPeriod: {
      id: journal.financialPeriod.id,
      startDate: isoDate(journal.financialPeriod.startDate),
      endDate: isoDate(journal.financialPeriod.endDate),
      status: journal.financialPeriod.status
    },
    totalDebit: money(totalDebit),
    totalCredit: money(totalCredit),
    lines: journal.lines.map((line) => ({
      id: line.id,
      accountId: line.accountId,
      accountCode: line.account.accountCode,
      accountName: line.account.accountName,
      accountType: line.account.accountType,
      debitAmount: money(line.debitAmount),
      creditAmount: money(line.creditAmount),
      description: line.description
    }))
  };
}

async function nextEntryNumber(tx: Prisma.TransactionClient, propertyId: string, date: Date) {
  const prefix = `JE-${date.getUTCFullYear()}-`;
  const latest = await tx.journalEntry.findFirst({
    where: { propertyId, entryNumber: { startsWith: prefix } },
    orderBy: { entryNumber: "desc" },
    select: { entryNumber: true }
  });
  const lastSequence = latest ? Number.parseInt(latest.entryNumber.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(lastSequence + 1).padStart(5, "0")}`;
}

function parseJournalStatus(value?: string) {
  if (!value || value.toUpperCase() === "ALL") return undefined;
  const status = value.toUpperCase();
  if (!(Object.values(JournalStatus) as string[]).includes(status)) {
    throw new BadRequestException(`Unknown journal status "${value}".`);
  }
  return status as JournalStatus;
}

function parseDateOnly(value: string, fieldName: string) {
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    throw new BadRequestException(`${fieldName} must be a date in YYYY-MM-DD format.`);
  }
  const date = new Date(`${datePart}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${fieldName} is not a valid date.`);
  }
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function money(value: Prisma.Decimal) {
  return value.toFixed(2);
}
