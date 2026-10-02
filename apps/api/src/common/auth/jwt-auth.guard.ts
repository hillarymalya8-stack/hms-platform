import { createHash } from "node:crypto";
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { PrismaService } from "../prisma/prisma.service";
import { IamService } from "../../modules/iam/iam.service";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { UserContext } from "./user-context";

type HmsJwtPayload = JwtPayload & {
  sub: string;
  sid: string;
  organizationId: string;
  email: string;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly iam: IamService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: UserContext }>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException("Missing bearer token.");
    }

    const secret = this.config.get<string>("JWT_SECRET") ?? "change-this-before-production";
    let payload: HmsJwtPayload;

    try {
      payload = jwt.verify(token, secret) as HmsJwtPayload;
    } catch {
      throw new UnauthorizedException("Invalid or expired token.");
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const session = await this.prisma.userSession.findFirst({
      where: {
        id: payload.sid,
        tokenHash,
        revokedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      include: {
        user: true
      }
    });

    if (!session || session.user.status !== "ACTIVE") {
      throw new UnauthorizedException("Session is no longer active.");
    }

    const requestedPropertyId = this.getHeaderValue(request, "x-property-id");
    const propertyId = requestedPropertyId ?? session.user.defaultPropertyId ?? undefined;
    const permissions = await this.iam.getPermissionCodes(session.user.id, propertyId);

    request.user = {
      userId: session.user.id,
      sessionId: session.id,
      organizationId: session.user.organizationId,
      propertyId,
      email: session.user.email,
      fullName: session.user.fullName,
      permissions
    };

    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      return undefined;
    }

    return authorization.slice("Bearer ".length).trim();
  }

  private getHeaderValue(request: Request, name: string): string | undefined {
    const value = request.headers[name];
    if (Array.isArray(value)) {
      return value[0];
    }

    return value;
  }
}
