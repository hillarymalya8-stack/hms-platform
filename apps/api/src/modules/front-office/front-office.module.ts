import { Module } from "@nestjs/common";
import { FrontOfficeController } from "./front-office.controller";
import { FrontOfficeService } from "./front-office.service";
import { DayExpensesService } from "./day-expenses.service";

@Module({
  controllers: [FrontOfficeController],
  providers: [FrontOfficeService, DayExpensesService],
  exports: [FrontOfficeService, DayExpensesService]
})
export class FrontOfficeModule {}
