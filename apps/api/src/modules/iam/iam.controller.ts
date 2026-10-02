import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import { UserContext } from "../../common/auth/user-context";
import { IamService } from "./iam.service";

@Controller()
export class IamController {
  constructor(private readonly iam: IamService) {}

  @RequirePermissions("roles.view")
  @Get("roles")
  listRoles(@CurrentUser() user: UserContext) {
    return this.iam.listRoles(user.organizationId, user.propertyId);
  }

  @RequirePermissions("roles.view")
  @Get("permissions")
  listPermissions() {
    return this.iam.listPermissions();
  }
}
