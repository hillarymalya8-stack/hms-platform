import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import { UserContext } from "../../common/auth/user-context";
import { CreateDiningTableDto, CreatePosProductDto, CreateProductCategoryDto, UpdatePosProductDto } from "./dto/menu.dto";
import { PosMenuService } from "./pos-menu.service";

@Controller("pos")
export class PosMenuController {
  constructor(private readonly menu: PosMenuService) {}

  @RequirePermissions("pos.products.manage")
  @Get("menu")
  getMenu(@CurrentUser() user: UserContext) {
    return this.menu.getMenu(user);
  }

  @RequirePermissions("pos.products.manage")
  @Post("categories")
  createCategory(@CurrentUser() user: UserContext, @Body() dto: CreateProductCategoryDto) {
    return this.menu.createCategory(user, dto);
  }

  @RequirePermissions("pos.products.manage")
  @Post("products")
  createProduct(@CurrentUser() user: UserContext, @Body() dto: CreatePosProductDto) {
    return this.menu.createProduct(user, dto);
  }

  @RequirePermissions("pos.products.manage")
  @Patch("products/:productId")
  updateProduct(
    @CurrentUser() user: UserContext,
    @Param("productId", ParseUUIDPipe) productId: string,
    @Body() dto: UpdatePosProductDto
  ) {
    return this.menu.updateProduct(user, productId, dto);
  }

  @RequirePermissions("pos.outlets.manage")
  @Get("outlets/:outletId/tables")
  listTables(@CurrentUser() user: UserContext, @Param("outletId", ParseUUIDPipe) outletId: string) {
    return this.menu.listTables(user, outletId);
  }

  @RequirePermissions("pos.outlets.manage")
  @Post("outlets/:outletId/tables")
  createTable(
    @CurrentUser() user: UserContext,
    @Param("outletId", ParseUUIDPipe) outletId: string,
    @Body() dto: CreateDiningTableDto
  ) {
    return this.menu.createTable(user, outletId, dto);
  }

  @RequirePermissions("pos.view")
  @Get("terminals")
  listTerminals(@CurrentUser() user: UserContext) {
    return this.menu.listTerminals(user);
  }
}
