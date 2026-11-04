import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import { UserContext } from "../../common/auth/user-context";
import { AdjustInventoryDto } from "./dto/adjust-inventory.dto";
import { CreateInventoryItemDto } from "./dto/create-inventory-item.dto";
import { InventoryHistoryQueryDto } from "./dto/inventory-history-query.dto";
import { PostInventoryMovementDto } from "./dto/post-inventory-movement.dto";
import { RecordDailyUsageDto } from "./dto/record-daily-usage.dto";
import { ReceiveInventoryDto } from "./dto/receive-inventory.dto";
import { UpdateInventoryItemDto } from "./dto/update-inventory-item.dto";
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
  @Patch("items/:itemId")
  updateItem(
    @CurrentUser() user: UserContext,
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdateInventoryItemDto
  ) {
    return this.inventory.updateItem(user, itemId, dto);
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

  @RequirePermissions("inventory.view")
  @Post("adjustments")
  adjustStock(@CurrentUser() user: UserContext, @Body() dto: AdjustInventoryDto) {
    return this.inventory.adjustStock(user, dto);
  }

  @RequirePermissions("inventory.view")
  @Get("history")
  history(@CurrentUser() user: UserContext, @Query() query: InventoryHistoryQueryDto) {
    return this.inventory.listHistory(user, query);
  }

  @RequirePermissions("inventory.view")
  @Get("daily-usage")
  dailyUsage(@CurrentUser() user: UserContext, @Query("date") date?: string) {
    return this.inventory.listDailyUsage(user, date);
  }

  @RequirePermissions("inventory.view")
  @Post("daily-usage")
  recordDailyUsage(@CurrentUser() user: UserContext, @Body() dto: RecordDailyUsageDto) {
    return this.inventory.recordDailyUsage(user, dto);
  }
}
