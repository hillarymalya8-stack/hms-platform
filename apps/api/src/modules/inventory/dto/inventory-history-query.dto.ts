import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";

export class InventoryHistoryQueryDto {
  @IsOptional()
  @Matches(/^\d{1,6}$/)
  page?: string;

  @IsOptional()
  @Matches(/^\d{1,3}$/)
  pageSize?: string;

  @IsOptional()
  @IsUUID()
  itemId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsIn(["RECEIPT", "ISSUE", "TRANSFER", "ADJUSTMENT", "COUNT_VARIANCE"])
  type?: "RECEIPT" | "ISSUE" | "TRANSFER" | "ADJUSTMENT" | "COUNT_VARIANCE";

  @IsOptional()
  @IsString()
  @MaxLength(40)
  from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  to?: string;
}
