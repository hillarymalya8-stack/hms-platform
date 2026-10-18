import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { IamModule } from "../iam/iam.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [AuditModule, IamModule],
  controllers: [UsersController],
  providers: [UsersService]
})
export class UsersModule {}
