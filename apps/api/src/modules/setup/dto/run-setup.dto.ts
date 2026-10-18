import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class RunSetupDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  hotelName!: string;

  @Matches(/^[A-Z]{3}$/, { message: "Currency code must be a 3-letter code such as TZS or USD." })
  currencyCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8)
  currencySymbol!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  adminFullName!: string;

  @IsEmail()
  adminEmail!: string;

  @IsString()
  @MinLength(8)
  adminPassword!: string;

  @IsOptional()
  @IsString()
  setupKey?: string;
}
