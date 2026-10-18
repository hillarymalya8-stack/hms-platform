import { Module } from "@nestjs/common";
import { PosMenuController } from "./pos-menu.controller";
import { PosMenuService } from "./pos-menu.service";
import { PosController } from "./pos.controller";
import { PosService } from "./pos.service";

@Module({
  controllers: [PosController, PosMenuController],
  providers: [PosService, PosMenuService],
  exports: [PosService, PosMenuService]
})
export class PosModule {}
