import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import { UserContext } from "../../common/auth/user-context";
import { ReportsService } from "./reports.service";

@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @RequirePermissions("reports.view")
  @Get("daily")
  dailyReports(@CurrentUser() user: UserContext, @Query("date") date?: string) {
    return this.reports.dailyReports(user, date);
  }
}
