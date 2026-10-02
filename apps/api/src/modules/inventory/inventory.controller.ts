import { Body, Controller, Get, Post } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import { UserContext } from "../../common/auth/user-context";
import { CreateInventoryItemDto } from "./dto/create-inventory-item.dto";
import { PostInventoryMovementDto } from "./dto/post-inventory-movement.dto";
import { ReceiveInventoryDto } from "./dto/receive-inventory.dto";
import { InventoryService } from "./inventory.service";

@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @RequirePermissions("inventory.view")
  @Get()
  workspace(@CurrentUser() user: UserContext) {
    return this.inventory.getWorkspace(user);
  }

  @RequirePermissions("inventory.view")
  @Post("items")
  createItem(@CurrentUser() user: UserContext, @Body() dto: CreateInventoryItemDto) {
    return this.inventory.createItem(user, dto);
  }

  @RequirePermissions("inventory.view")
  @Post("receipts")
  receiveStock(@CurrentUser() user: UserContext, @Body() dto: ReceiveInventoryDto) {
    return this.inventory.receiveStock(user, dto);
  }

  @RequirePermissions("inventory.view")
  @Post("movements")
  postMovement(@CurrentUser() user: UserContext, @Body() dto: PostInventoryMovementDto) {
    return this.inventory.postMovement(user, dto);
  }
}
