import { IsInt, IsISO8601, IsObject, IsOptional, IsString, Max, Min } from "class-validator";

export class UpdatePropertySettingsDto {
  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  currencySymbol?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  currencyPrecision?: number;

  @IsOptional()
  @IsISO8601()
  fiscalYearStart?: string;

  @IsOptional()
  @IsString()
  checkInTime?: string;

  @IsOptional()
  @IsString()
  checkOutTime?: string;

  @IsOptional()
  @IsObject()
  numberingRules?: Record<string, unknown>;
}
