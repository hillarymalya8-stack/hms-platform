import { Body, Controller, Headers, Ip, Post } from "@nestjs/common";
import { Public } from "../../common/auth/public.decorator";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.auth.login(dto, { ipAddress, userAgent });
  }
}
