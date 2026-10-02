import { Body, Controller, Get, Post } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import { UserContext } from "../../common/auth/user-context";
import { CreateUserDto } from "./dto/create-user.dto";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get("me")
  getMe(@CurrentUser() user: UserContext) {
    return this.users.getMe(user);
  }

  @RequirePermissions("users.view")
  @Get()
  list(@CurrentUser() user: UserContext) {
    return this.users.list(user.organizationId);
  }

  @RequirePermissions("users.manage")
  @Post()
  create(@CurrentUser() user: UserContext, @Body() dto: CreateUserDto) {
    return this.users.create(user, dto);
  }
}
