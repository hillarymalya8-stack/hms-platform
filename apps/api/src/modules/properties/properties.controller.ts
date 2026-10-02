import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import { UserContext } from "../../common/auth/user-context";
import { CreatePropertyDto } from "./dto/create-property.dto";
import { UpdatePropertySettingsDto } from "./dto/update-property-settings.dto";
import { PropertiesService } from "./properties.service";

@Controller("properties")
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @RequirePermissions("properties.view")
  @Get()
  list(@CurrentUser() user: UserContext) {
    return this.properties.list(user.organizationId);
  }

  @RequirePermissions("properties.manage")
  @Post()
  create(@CurrentUser() user: UserContext, @Body() dto: CreatePropertyDto) {
    return this.properties.create(user, dto);
  }

  @RequirePermissions("settings.view")
  @Get(":propertyId/settings")
  getSettings(@CurrentUser() user: UserContext, @Param("propertyId") propertyId: string) {
    return this.properties.getSettings(user, propertyId);
  }

  @RequirePermissions("settings.manage")
  @Patch(":propertyId/settings")
  updateSettings(
    @CurrentUser() user: UserContext,
    @Param("propertyId") propertyId: string,
    @Body() dto: UpdatePropertySettingsDto
  ) {
    return this.properties.updateSettings(user, propertyId, dto);
  }
}
