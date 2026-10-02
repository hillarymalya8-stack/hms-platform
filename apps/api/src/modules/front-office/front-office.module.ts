import { Module } from "@nestjs/common";
import { FrontOfficeController } from "./front-office.controller";
import { FrontOfficeService } from "./front-office.service";

@Module({
  controllers: [FrontOfficeController],
  providers: [FrontOfficeService],
  exports: [FrontOfficeService]
})
export class FrontOfficeModule {}
