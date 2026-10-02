import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import { UserContext } from "../../common/auth/user-context";
import { AuditService } from "./audit.service";

@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @RequirePermissions("audit.view")
  @Get()
  listRecent(@CurrentUser() user: UserContext) {
    return this.audit.listRecent(user.organizationId, user.propertyId);
  }
}
