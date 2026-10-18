import { ArrayUnique, IsArray, IsEmail, IsOptional, IsString, IsUUID, Matches, MinLength } from "class-validator";

export class CreateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @Matches(/^[a-z0-9][a-z0-9._-]{2,39}$/i, {
    message: "Username must be 3-40 characters: letters, numbers, dots, dashes or underscores."
  })
  username?: string;

  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsUUID()
  defaultPropertyId?: string;

  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsString()
  homePath?: string | null;
}
