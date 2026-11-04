import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AccountingController } from "./accounting.controller";
import { AccountingService } from "./accounting.service";
import { DaySalesService } from "./day-sales.service";

@Module({
  imports: [AuditModule],
  controllers: [AccountingController],
  providers: [AccountingService, DaySalesService],
  exports: [AccountingService]
})
export class AccountingModule {}
