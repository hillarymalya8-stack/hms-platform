import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import { UserContext } from "../../common/auth/user-context";
import { AuditQueryDto } from "./audit-query.dto";
import { AuditService } from "./audit.service";

// Read-only by design: the audit trail has no create, update or delete endpoints.
@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @RequirePermissions("audit.view")
  @Get()
  search(@CurrentUser() user: UserContext, @Query() filters: AuditQueryDto) {
    return this.audit.search(user, filters ?? {});
  }

  @RequirePermissions("audit.view")
  @Get("filters")
  filterOptions(@CurrentUser() user: UserContext) {
    return this.audit.filterOptions(user);
  }
}
