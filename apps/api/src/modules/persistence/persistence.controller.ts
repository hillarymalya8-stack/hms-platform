import { Body, Controller, Get, Post } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import { UserContext } from "../../common/auth/user-context";
import { RecordTransitionDto } from "./dto/record-transition.dto";
import { PersistenceService } from "./persistence.service";

@Controller("persistence")
export class PersistenceController {
  constructor(private readonly persistence: PersistenceService) {}

  @RequirePermissions("settings.view")
  @Get("status")
  getStatus() {
    return this.persistence.getStatus();
  }

  @RequirePermissions("settings.manage")
  @Post("transitions")
  recordTransition(@CurrentUser() user: UserContext, @Body() dto: RecordTransitionDto) {
    return this.persistence.recordTransition(user, dto);
  }
}
