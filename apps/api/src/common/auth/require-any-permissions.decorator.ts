import { SetMetadata } from "@nestjs/common";
import { PermissionCode } from "@hms/shared";

export const ANY_PERMISSIONS_KEY = "anyPermissions";
export const RequireAnyPermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);
