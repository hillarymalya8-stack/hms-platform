import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { UserContext } from "../../common/auth/user-context";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateUserDto } from "./dto/create-user.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly audit: AuditService,
    private readonly prisma: PrismaService
  ) {}

  getMe(user: UserContext) {
    return {
      id: user.userId,
      email: user.email,
      fullName: user.fullName,
      organizationId: user.organizationId,
      propertyId: user.propertyId,
      permissions: user.permissions
    };
  }

  list(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        email: true,
        fullName: true,
        defaultPropertyId: true,
        mfaEnabled: true,
        status: true,
        createdAt: true,
        userRoles: {
          include: {
            role: true,
            property: true
          }
        }
      },
      orderBy: { fullName: "asc" }
    });
  }

  async create(currentUser: UserContext, dto: CreateUserDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      throw new ConflictException("A user with this email already exists.");
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const created = await this.prisma.user.create({
      data: {
        organizationId: currentUser.organizationId,
        defaultPropertyId: dto.defaultPropertyId ?? currentUser.propertyId,
        email,
        passwordHash,
        fullName: dto.fullName,
        userRoles: dto.roleId
          ? {
              create: {
                roleId: dto.roleId,
                propertyId: dto.defaultPropertyId ?? currentUser.propertyId
              }
            }
          : undefined
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        defaultPropertyId: true,
        mfaEnabled: true,
        status: true,
        createdAt: true
      }
    });

    await this.audit.record({
      organizationId: currentUser.organizationId,
      propertyId: created.defaultPropertyId,
      userId: currentUser.userId,
      module: "users",
      action: "create",
      recordType: "user",
      recordId: created.id,
      newValue: created as unknown as Prisma.InputJsonValue
    });

    return created;
  }
}
