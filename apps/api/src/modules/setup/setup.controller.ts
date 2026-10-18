import { Body, Controller, Get, Headers, Ip, Post } from "@nestjs/common";
import { Public } from "../../common/auth/public.decorator";
import { RunSetupDto } from "./dto/run-setup.dto";
import { SetupService } from "./setup.service";

@Controller("setup")
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Public()
  @Get("status")
  status() {
    return this.setup.status();
  }

  @Public()
  @Post()
  run(@Body() dto: RunSetupDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.setup.run(dto, { ipAddress, userAgent });
  }
}
