import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";

const secretKey = "jwt_secret";

// Uses JWT_SECRET when it is configured; otherwise generates one random secret per database and keeps it there,
// so a Netlify deployment signs tokens securely without any manual secret setup.
@Injectable()
export class JwtSecretService {
  private cached?: Promise<string>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  getSecret(): Promise<string> {
    if (!this.cached) {
      this.cached = this.resolve().catch((error) => {
        this.cached = undefined;
        throw error;
      });
    }

    return this.cached;
  }

  private async resolve() {
    const configured = this.config.get<string>("JWT_SECRET")?.trim();
    if (configured && configured.length >= 32) return configured;

    const existing = await this.prisma.systemSecret.findUnique({ where: { key: secretKey } });
    if (existing) return existing.value;

    // createMany with skipDuplicates keeps concurrent cold starts from overwriting each other's secret.
    await this.prisma.systemSecret.createMany({
      data: [{ key: secretKey, value: randomBytes(48).toString("base64url") }],
      skipDuplicates: true
    });
    const stored = await this.prisma.systemSecret.findUniqueOrThrow({ where: { key: secretKey } });
    return stored.value;
  }
}
