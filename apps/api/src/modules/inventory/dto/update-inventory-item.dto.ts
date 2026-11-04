import { IsNotEmpty, IsNumberString, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateInventoryItemDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  unitOfMeasure?: string;

  @IsOptional()
  @IsNumberString()
  reorderLevel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
