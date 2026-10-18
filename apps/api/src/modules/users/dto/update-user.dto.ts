import { ArrayUnique, IsArray, IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsIn(["ACTIVE", "SUSPENDED"])
  status?: "ACTIVE" | "SUSPENDED";

  // When sent, these become exactly what the person can access and any role assignment is removed.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsString()
  homePath?: string | null;
}
