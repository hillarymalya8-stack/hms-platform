import { createHash, randomUUID } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import bcrypt from "bcryptjs";
import jwt, { Secret, SignOptions } from "jsonwebtoken";
import { PrismaService } from "../../common/prisma/prisma.service";
import { IamService } from "../iam/iam.service";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly iam: IamService,
    private readonly prisma: PrismaService
  ) {}

  async login(dto: LoginDto, metadata: { ipAddress?: string; userAgent?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() }
    });

    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException("Invalid email or password.");
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    const sessionId = randomUUID();
    const expiresAt = this.resolveExpiry();
    const secret = (this.config.get<string>("JWT_SECRET") ?? "change-this-before-production") as Secret;
    const signOptions: SignOptions = {
      expiresIn: (this.config.get<string>("JWT_EXPIRES_IN") ?? "8h") as SignOptions["expiresIn"]
    };
    const token = jwt.sign(
      {
        sub: user.id,
        sid: sessionId,
        organizationId: user.organizationId,
        email: user.email
      },
      secret,
      signOptions
    );

    await this.prisma.userSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent
      }
    });

    const permissions = await this.iam.getPermissionCodes(user.id, user.defaultPropertyId ?? undefined);

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        propertyId: user.defaultPropertyId,
        userId: user.id,
        module: "auth",
        action: "login",
        recordType: "user_session",
        recordId: sessionId,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        newValue: {
          email: user.email
        }
      }
    });

    return {
      accessToken: token,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        organizationId: user.organizationId,
        defaultPropertyId: user.defaultPropertyId,
        permissions
      }
    };
  }

  private resolveExpiry() {
    const value = this.config.get<string>("JWT_EXPIRES_IN") ?? "8h";
    const match = value.match(/^(\d+)([hm])$/);
    if (!match) {
      return new Date(Date.now() + 8 * 60 * 60 * 1000);
    }

    const amount = Number(match[1]);
    const unit = match[2];
    const multiplier = unit === "h" ? 60 * 60 * 1000 : 60 * 1000;
    return new Date(Date.now() + amount * multiplier);
  }
}
