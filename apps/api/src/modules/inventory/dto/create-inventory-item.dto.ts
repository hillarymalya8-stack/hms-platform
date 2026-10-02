import { IsNotEmpty, IsNumberString, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateInventoryItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  sku!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  unitOfMeasure!: string;

  @IsOptional()
  @IsNumberString()
  reorderLevel?: string;
}
