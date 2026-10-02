import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { ANY_PERMISSIONS_KEY } from "./require-any-permissions.decorator";
import { PERMISSIONS_KEY } from "./require-permissions.decorator";
import { UserContext } from "./user-context";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return true;
    }

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    const request = context.switchToHttp().getRequest<Request & { user?: UserContext }>();
    const granted = new Set(request.user?.permissions ?? []);

    const anyPermissions = this.reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (anyPermissions?.length && !anyPermissions.some((permission) => granted.has(permission))) {
      throw new ForbiddenException(`Missing one of permissions: ${anyPermissions.join(", ")}`);
    }

    const missing = requiredPermissions?.filter((permission) => !granted.has(permission)) ?? [];

    if (missing.length > 0) {
      throw new ForbiddenException(`Missing permission: ${missing.join(", ")}`);
    }

    return true;
  }
}
