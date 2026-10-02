import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class IamService {
  constructor(private readonly prisma: PrismaService) {}

  async getPermissionCodes(userId: string, propertyId?: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: {
        userId,
        OR: propertyId ? [{ propertyId }, { propertyId: null }] : [{ propertyId: null }]
      },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true
              }
            }
          }
        }
      }
    });

    const permissionCodes = new Set<string>();
    for (const userRole of userRoles) {
      for (const rolePermission of userRole.role.rolePermissions) {
        permissionCodes.add(rolePermission.permission.code);
      }
    }

    return [...permissionCodes].sort();
  }

  listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ module: "asc" }, { action: "asc" }]
    });
  }

  listRoles(organizationId: string, propertyId?: string) {
    return this.prisma.role.findMany({
      where: {
        organizationId,
        OR: propertyId ? [{ propertyId }, { propertyId: null }] : undefined
      },
      include: {
        rolePermissions: {
          include: {
            permission: true
          }
        }
      },
      orderBy: {
        name: "asc"
      }
    });
  }
}
