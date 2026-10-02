import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import { UserContext } from "../../common/auth/user-context";
import { CreatePosOrderDto } from "./dto/create-pos-order.dto";
import { PayPosOrderDto } from "./dto/pay-pos-order.dto";
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
}
