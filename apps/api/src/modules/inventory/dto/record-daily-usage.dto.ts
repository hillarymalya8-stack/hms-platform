import { IsISO8601, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class RecordDailyUsageDto {
  @IsUUID()
  itemId!: string;

  @IsUUID()
  locationId!: string;

  @IsNumberString()
  quantity!: string;

  @IsOptional()
  @IsISO8601()
  businessDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  purpose?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
