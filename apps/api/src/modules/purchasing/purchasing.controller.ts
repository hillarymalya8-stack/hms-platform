import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import { UserContext } from "../../common/auth/user-context";
import { CreatePurchaseOrderDto } from "./dto/create-purchase-order.dto";
import { CreateSupplierDto } from "./dto/create-supplier.dto";
import { ReceivePurchaseOrderDto } from "./dto/receive-purchase-order.dto";
import { RecordSupplierInvoiceDto } from "./dto/record-supplier-invoice.dto";
import { PurchasingService } from "./purchasing.service";

@Controller("purchasing")
export class PurchasingController {
  constructor(private readonly purchasing: PurchasingService) {}

  @RequirePermissions("purchasing.view")
  @Get("overview")
  overview(@CurrentUser() user: UserContext) {
    return this.purchasing.getOverview(user);
  }

  @RequirePermissions("purchasing.view")
  @Post("suppliers")
  createSupplier(@CurrentUser() user: UserContext, @Body() dto: CreateSupplierDto) {
    return this.purchasing.createSupplier(user, dto);
  }

  @RequirePermissions("purchasing.view")
  @Post("orders")
  createOrder(@CurrentUser() user: UserContext, @Body() dto: CreatePurchaseOrderDto) {
    return this.purchasing.createOrder(user, dto);
  }

  @RequirePermissions("purchasing.view")
  @Post("orders/:id/submit")
  submitOrder(@CurrentUser() user: UserContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.purchasing.submitOrder(user, id);
  }

  @RequirePermissions("purchasing.view")
  @Post("orders/:id/approve")
  approveOrder(@CurrentUser() user: UserContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.purchasing.approveOrder(user, id);
  }

  @RequirePermissions("purchasing.view")
  @Post("orders/:id/cancel")
  cancelOrder(@CurrentUser() user: UserContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.purchasing.cancelOrder(user, id);
  }

  @RequirePermissions("purchasing.view", "inventory.store.main")
  @Post("orders/:id/receive")
  receiveOrder(
    @CurrentUser() user: UserContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReceivePurchaseOrderDto
  ) {
    return this.purchasing.receiveOrder(user, id, dto);
  }

  @RequirePermissions("purchasing.view")
  @Post("orders/:id/invoices")
  recordInvoice(
    @CurrentUser() user: UserContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RecordSupplierInvoiceDto
  ) {
    return this.purchasing.recordInvoice(user, id, dto);
  }
}
