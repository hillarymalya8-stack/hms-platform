import { IsString, MinLength } from "class-validator";

export class LoginDto {
  // Accepts either the staff username or the email address.
  @IsString()
  @MinLength(1)
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
