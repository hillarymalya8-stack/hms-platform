import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { systemAccessGroups } from "@hms/shared";
import { UserContext } from "../../common/auth/user-context";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { IamService } from "../iam/iam.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

const userSelect = {
  id: true,
  email: true,
  username: true,
  fullName: true,
  defaultPropertyId: true,
  homePath: true,
  mfaEnabled: true,
  status: true,
  createdAt: true,
  userPermissions: {
    include: { permission: true }
  },
  userRoles: {
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true }
          }
        }
      },
      property: true
    }
  }
} satisfies Prisma.UserSelect;

type SelectedUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly audit: AuditService,
    private readonly iam: IamService,
    private readonly prisma: PrismaService
  ) {}

  async getMe(user: UserContext) {
    const record = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { username: true, homePath: true }
    });

    return {
      id: user.userId,
      email: user.email,
      username: record?.username ?? null,
      fullName: user.fullName,
      organizationId: user.organizationId,
      propertyId: user.propertyId,
      defaultPropertyId: user.propertyId,
      homePath: record?.homePath ?? null,
      permissions: user.permissions
    };
  }

  async list(organizationId: string) {
    const users = await this.prisma.user.findMany({
      where: { organizationId },
      select: userSelect,
      orderBy: { fullName: "asc" }
    });

    return users.map(toPublicUser);
  }

  async create(currentUser: UserContext, dto: CreateUserDto) {
    const username = dto.username?.trim().toLowerCase() || null;
    const email = dto.email?.trim().toLowerCase() || (username ? `${username}@staff.local` : null);

    if (!email) {
      throw new BadRequestException("Enter a username or an email address.");
    }

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, ...(username ? [{ username }, { email: username }] : [])] }
    });

    if (existing) {
      throw new ConflictException(
        username && (existing.username === username || existing.email === username)
          ? "That username is already taken."
          : "A user with this email already exists."
      );
    }

    const permissions = await this.resolveGrantedPermissions(currentUser, dto.permissions ?? []);

    if (!dto.roleId && permissions.length === 0) {
      throw new BadRequestException("Choose at least one system this person can open.");
    }

    const permissionIds = await this.findPermissionIds(permissions);
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const propertyId = dto.defaultPropertyId ?? currentUser.propertyId;

    const created = await this.prisma.user.create({
      data: {
        organizationId: currentUser.organizationId,
        defaultPropertyId: propertyId,
        email,
        username,
        homePath: resolveHomePath(dto.homePath, permissions),
        passwordHash,
        fullName: dto.fullName.trim(),
        userRoles: dto.roleId
          ? {
              create: {
                roleId: dto.roleId,
                propertyId
              }
            }
          : undefined,
        userPermissions: permissionIds.length
          ? { createMany: { data: permissionIds.map((permissionId) => ({ permissionId })) } }
          : undefined
      },
      select: userSelect
    });

    const result = toPublicUser(created);

    await this.audit.record({
      organizationId: currentUser.organizationId,
      propertyId: created.defaultPropertyId,
      userId: currentUser.userId,
      module: "users",
      action: "create",
      recordType: "user",
      recordId: created.id,
      newValue: auditSnapshot(result)
    });

    return result;
  }

  async update(currentUser: UserContext, userId: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: currentUser.organizationId },
      select: userSelect
    });

    if (!existing) {
      throw new NotFoundException("User not found.");
    }

    const isSelf = existing.id === currentUser.userId;
    const before = toPublicUser(existing);
    let permissions = before.permissions;

    if (dto.permissions !== undefined) {
      // Access the editor does not hold cannot be granted or taken away by them.
      const requested = await this.resolveGrantedPermissions(currentUser, dto.permissions);
      const untouchable = before.permissions.filter((code) => !currentUser.permissions.includes(code));
      permissions = [...new Set([...requested, ...untouchable])].sort();

      if (permissions.length === 0) {
        throw new BadRequestException("Choose at least one system this person can open.");
      }
      if (isSelf && !permissions.includes("users.manage")) {
        throw new BadRequestException("You cannot remove your own user management access.");
      }
    }

    if (isSelf && dto.status === "SUSPENDED") {
      throw new BadRequestException("You cannot suspend your own account.");
    }

    const homePath = resolveHomePath(dto.homePath !== undefined ? dto.homePath : existing.homePath, permissions);
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 12) : undefined;
    const permissionIds = dto.permissions !== undefined ? await this.findPermissionIds(permissions) : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (permissionIds) {
        // Ticked access replaces role-based access so the person gets exactly what was chosen.
        await tx.userRole.deleteMany({ where: { userId } });
        await tx.userPermission.deleteMany({ where: { userId } });
        await tx.userPermission.createMany({ data: permissionIds.map((permissionId) => ({ userId, permissionId })) });
      }

      if (passwordHash || dto.status === "SUSPENDED") {
        await tx.userSession.updateMany({
          where: { userId, revokedAt: null, ...(isSelf ? { id: { not: currentUser.sessionId } } : {}) },
          data: { revokedAt: new Date() }
        });
      }

      return tx.user.update({
        where: { id: userId },
        data: {
          fullName: dto.fullName?.trim() || undefined,
          status: dto.status,
          passwordHash,
          homePath
        },
        select: userSelect
      });
    });

    const result = toPublicUser(updated);

    await this.audit.record({
      organizationId: currentUser.organizationId,
      propertyId: updated.defaultPropertyId,
      userId: currentUser.userId,
      module: "users",
      action: "update",
      recordType: "user",
      recordId: updated.id,
      previousValue: auditSnapshot(before),
      newValue: { ...auditSnapshot(result), passwordChanged: Boolean(passwordHash) }
    });

    return result;
  }

  private async resolveGrantedPermissions(currentUser: UserContext, requested: string[]) {
    const known = new Set((await this.iam.listPermissions()).map((permission) => permission.code));
    const codes = new Set(requested.filter((code) => known.has(code)));

    // An action inside a system is useless without being able to open that system.
    for (const group of systemAccessGroups) {
      if (group.actions.some((action) => codes.has(action.code))) codes.add(group.viewPermission);
    }

    return [...codes].filter((code) => currentUser.permissions.includes(code)).sort();
  }

  private async findPermissionIds(codes: string[]) {
    if (codes.length === 0) return [];
    const rows = await this.prisma.permission.findMany({ where: { code: { in: codes } }, select: { id: true } });
    return rows.map((row) => row.id);
  }
}

function resolveHomePath(value: string | null | undefined, permissions: string[]) {
  if (!value) return null;
  const group = systemAccessGroups.find((entry) => entry.href === value);
  return group && permissions.includes(group.viewPermission) ? group.href : null;
}

function toPublicUser(user: SelectedUser) {
  const permissions = new Set<string>();
  for (const userRole of user.userRoles) {
    for (const rolePermission of userRole.role.rolePermissions) permissions.add(rolePermission.permission.code);
  }
  for (const userPermission of user.userPermissions) permissions.add(userPermission.permission.code);

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.fullName,
    defaultPropertyId: user.defaultPropertyId,
    homePath: user.homePath,
    mfaEnabled: user.mfaEnabled,
    status: user.status,
    createdAt: user.createdAt,
    customAccess: user.userPermissions.length > 0,
    permissions: [...permissions].sort(),
    userRoles: user.userRoles.map((userRole) => ({
      role: {
        id: userRole.role.id,
        name: userRole.role.name,
        rolePermissions: userRole.role.rolePermissions.map((rolePermission) => ({ permission: rolePermission.permission }))
      },
      property: userRole.property
    }))
  };
}

function auditSnapshot(user: ReturnType<typeof toPublicUser>): Prisma.InputJsonObject {
  return {
    email: user.email,
    username: user.username,
    fullName: user.fullName,
    status: user.status,
    homePath: user.homePath,
    permissions: user.permissions
  };
}
