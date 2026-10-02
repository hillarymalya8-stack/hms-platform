import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { UserContext } from "../../common/auth/user-context";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateAccountDto } from "./dto/create-account.dto";
import { ValidateJournalDto } from "./dto/validate-journal.dto";
import { JournalValidationError, validateBalancedJournal } from "./journal-balancer";

@Injectable()
export class AccountingService {
  constructor(
    private readonly audit: AuditService,
    private readonly prisma: PrismaService
  ) {}

  listAccounts(user: UserContext) {
    return this.prisma.account.findMany({
      where: {
        organizationId: user.organizationId,
        OR: user.propertyId ? [{ propertyId: user.propertyId }, { propertyId: null }] : undefined
      },
      orderBy: [{ accountCode: "asc" }]
    });
  }

  async createAccount(user: UserContext, dto: CreateAccountDto) {
    const existing = await this.prisma.account.findFirst({
      where: {
        organizationId: user.organizationId,
        propertyId: user.propertyId,
        accountCode: dto.accountCode
      }
    });

    if (existing) {
      throw new ConflictException("An account with this code already exists for this property.");
    }

    const account = await this.prisma.account.create({
      data: {
        organizationId: user.organizationId,
        propertyId: user.propertyId,
        parentId: dto.parentId,
        accountCode: dto.accountCode,
        accountName: dto.accountName,
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
    try {
      return validateBalancedJournal(dto.lines);
    } catch (error) {
      if (error instanceof JournalValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
