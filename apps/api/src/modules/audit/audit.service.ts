import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

type AuditInput = {
  organizationId: string;
  propertyId?: string | null;
  userId?: string | null;
  module: string;
  action: string;
  recordType: string;
  recordId?: string | null;
  previousValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: AuditInput) {
    return this.prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        propertyId: input.propertyId,
        userId: input.userId,
        module: input.module,
        action: input.action,
        recordType: input.recordType,
        recordId: input.recordId,
        previousValue: input.previousValue,
        newValue: input.newValue,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent
      }
    });
  }

  listRecent(organizationId: string, propertyId?: string) {
    return this.prisma.auditLog.findMany({
      where: {
        organizationId,
        OR: propertyId ? [{ propertyId }, { propertyId: null }] : undefined
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 100
    });
  }
}
