import { Global, Module } from "@nestjs/common";
import { JwtSecretService } from "../auth/jwt-secret.service";
import { PrismaService } from "./prisma.service";

@Global()
@Module({
  providers: [PrismaService, JwtSecretService],
  exports: [PrismaService, JwtSecretService]
})
export class PrismaModule {}
