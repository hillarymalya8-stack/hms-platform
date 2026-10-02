import { Controller, Get, Query } from "@nestjs/common";
import { RequireAnyPermissions } from "../../common/auth/require-any-permissions.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { UserContext } from "../../common/auth/user-context";
import { InvoicesService } from "./invoices.service";

@Controller("invoices")
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @RequireAnyPermissions("front_office.view", "accounting.view", "users.view")
  @Get("reservations")
  searchReservations(@CurrentUser() user: UserContext, @Query("query") query?: string) {
    return this.invoices.searchReservations(user, query ?? "");
  }
}
