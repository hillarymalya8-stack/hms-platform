import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { RequireAnyPermissions } from "../../common/auth/require-any-permissions.decorator";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import { UserContext } from "../../common/auth/user-context";
import { CreatePosOrderDto } from "./dto/create-pos-order.dto";
import { PayPosOrderDto } from "./dto/pay-pos-order.dto";
import { UpdatePosOrderDto } from "./dto/update-pos-order.dto";
import { VoidPosOrderDto } from "./dto/void-pos-order.dto";
import { PosService } from "./pos.service";

@Controller("pos")
export class PosController {
  constructor(private readonly pos: PosService) {}

  @RequirePermissions("pos.view")
  @Get("outlets")
  listOutlets(@CurrentUser() user: UserContext) {
    return this.pos.listOutlets(user);
  }

  @RequirePermissions("pos.view")
  @Get("outlets/:outletId/catalog")
  listCatalog(@CurrentUser() user: UserContext, @Param("outletId") outletId: string) {
    return this.pos.listCatalog(user, outletId);
  }

  @RequirePermissions("pos.view")
  @Get("orders")
  listOrders(@CurrentUser() user: UserContext) {
    return this.pos.listOrders(user);
  }

  @RequirePermissions("pos.view")
  @Get("prep-notifications")
  listPrepNotifications(@CurrentUser() user: UserContext, @Query("station") station?: string) {
    return this.pos.listPrepNotifications(user, station);
  }

  @RequirePermissions("pos.view")
  @Get("chargeable-rooms")
  listChargeableRooms(@CurrentUser() user: UserContext) {
    return this.pos.listChargeableRooms(user);
  }

  @RequirePermissions("pos.view")
  @Get("bar-low-stock")
  listBarLowStock(@CurrentUser() user: UserContext) {
    return this.pos.listBarLowStock(user);
  }

  @RequirePermissions("pos.orders.create")
  @Post("orders")
  createOrder(@CurrentUser() user: UserContext, @Body() dto: CreatePosOrderDto) {
    return this.pos.createOrder(user, dto);
  }

  @RequirePermissions("pos.orders.pay")
  @Post("orders/:orderId/payments")
  payOrder(@CurrentUser() user: UserContext, @Param("orderId") orderId: string, @Body() dto: PayPosOrderDto) {
    return this.pos.payOrder(user, orderId, dto);
  }

  @RequirePermissions("pos.orders.create")
  @Patch("orders/:orderId")
  updateOrder(@CurrentUser() user: UserContext, @Param("orderId") orderId: string, @Body() dto: UpdatePosOrderDto) {
    return this.pos.updateOrder(user, orderId, dto);
  }

  // Cashiers can void unpaid orders; voiding a paid order also needs pos.orders.void (checked in the service).
  @RequireAnyPermissions("pos.orders.create", "pos.orders.void")
  @Post("orders/:orderId/void")
  voidOrder(@CurrentUser() user: UserContext, @Param("orderId") orderId: string, @Body() dto: VoidPosOrderDto) {
    return this.pos.voidOrder(user, orderId, dto);
  }
}
