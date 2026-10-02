import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import { UserContext } from "../../common/auth/user-context";
import { OrganizationsService } from "./organizations.service";

@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @RequirePermissions("properties.view")
  @Get("current")
  getCurrent(@CurrentUser() user: UserContext) {
    return this.organizations.getCurrent(user.organizationId);
  }
}
