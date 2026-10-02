import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { UserContext } from "../../common/auth/user-context";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreatePropertyDto } from "./dto/create-property.dto";
import { UpdatePropertySettingsDto } from "./dto/update-property-settings.dto";

@Injectable()
export class PropertiesService {
  constructor(
    private readonly audit: AuditService,
    private readonly prisma: PrismaService
  ) {}

  list(organizationId: string) {
    return this.prisma.property.findMany({
      where: { organizationId },
      include: { propertySettings: true },
      orderBy: { name: "asc" }
    });
  }

  async create(user: UserContext, dto: CreatePropertyDto) {
    const existing = await this.prisma.property.findUnique({
      where: {
        organizationId_code: {
          organizationId: user.organizationId,
          code: dto.code
        }
      }
    });

    if (existing) {
      throw new ConflictException("A property with this code already exists.");
    }

    const property = await this.prisma.property.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name,
        code: dto.code,
        propertySettings: {
          create: {
            fiscalYearStart: new Date(`${new Date().getUTCFullYear()}-01-01T00:00:00.000Z`)
          }
        }
      },
      include: { propertySettings: true }
    });

    await this.audit.record({
      organizationId: user.organizationId,
      propertyId: property.id,
      userId: user.userId,
      module: "properties",
      action: "create",
      recordType: "property",
      recordId: property.id,
      newValue: {
        id: property.id,
        code: property.code,
        name: property.name,
        status: property.status
      } satisfies Prisma.InputJsonValue
    });

    return property;
  }

  async getSettings(user: UserContext, propertyId: string) {
    await this.assertPropertyAccess(user, propertyId);
    return this.prisma.propertySetting.findUniqueOrThrow({
      where: { propertyId }
    });
  }

  async updateSettings(user: UserContext, propertyId: string, dto: UpdatePropertySettingsDto) {
    await this.assertPropertyAccess(user, propertyId);
    const previous = await this.prisma.propertySetting.findUnique({
      where: { propertyId }
    });
    const numberingRules = dto.numberingRules as Prisma.InputJsonValue | undefined;

    const updated = await this.prisma.propertySetting.upsert({
      where: { propertyId },
      update: {
        currencyCode: dto.currencyCode,
        currencySymbol: dto.currencySymbol,
        currencyPrecision: dto.currencyPrecision,
        fiscalYearStart: dto.fiscalYearStart ? new Date(dto.fiscalYearStart) : undefined,
        checkInTime: dto.checkInTime,
        checkOutTime: dto.checkOutTime,
        numberingRules
      },
      create: {
        propertyId,
        currencyCode: dto.currencyCode ?? "USD",
        currencySymbol: dto.currencySymbol ?? "$",
        currencyPrecision: dto.currencyPrecision ?? 2,
        fiscalYearStart: dto.fiscalYearStart
          ? new Date(dto.fiscalYearStart)
          : new Date(`${new Date().getUTCFullYear()}-01-01T00:00:00.000Z`),
        checkInTime: dto.checkInTime ?? "14:00",
        checkOutTime: dto.checkOutTime ?? "11:00",
        numberingRules: numberingRules ?? {}
      }
    });

    await this.audit.record({
      organizationId: user.organizationId,
      propertyId,
      userId: user.userId,
      module: "settings",
      action: "update",
      recordType: "property_settings",
      recordId: updated.id,
      previousValue: previous
        ? ({
            currencyCode: previous.currencyCode,
            currencySymbol: previous.currencySymbol,
            currencyPrecision: previous.currencyPrecision,
            checkInTime: previous.checkInTime,
            checkOutTime: previous.checkOutTime,
            numberingRules: previous.numberingRules
          } satisfies Prisma.InputJsonValue)
        : undefined,
      newValue: {
        currencyCode: updated.currencyCode,
        currencySymbol: updated.currencySymbol,
        currencyPrecision: updated.currencyPrecision,
        checkInTime: updated.checkInTime,
        checkOutTime: updated.checkOutTime,
        numberingRules: updated.numberingRules
      } satisfies Prisma.InputJsonValue
    });

    return updated;
  }

  private async assertPropertyAccess(user: UserContext, propertyId: string) {
    const property = await this.prisma.property.findFirst({
      where: {
        id: propertyId,
        organizationId: user.organizationId
      }
    });

    if (!property) {
      throw new NotFoundException("Property was not found.");
    }
  }
}
