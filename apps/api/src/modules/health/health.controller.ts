import { Controller, Get } from "@nestjs/common";
import { Public } from "../../common/auth/public.decorator";
import { PrismaService } from "../../common/prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    let database: "connected" | "unavailable" = "connected";

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = "unavailable";
    }

    return {
      status: database === "connected" ? "ok" : "degraded",
      service: "hms-api",
      database,
      mode: "production",
      checkedAt: new Date().toISOString()
    };
  }
}
