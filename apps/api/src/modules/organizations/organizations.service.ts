import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrent(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        properties: {
          orderBy: { name: "asc" }
        }
      }
    });

    if (!organization) {
      throw new NotFoundException("Organization was not found.");
    }

    return organization;
  }
}
