import { IsNotEmpty, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class ReceiveInventoryDto {
  @IsUUID()
  itemId!: string;

  @IsUUID()
  locationId!: string;

  @IsNumberString()
  quantity!: string;

  @IsNumberString()
  unitCost!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  supplierDoc?: string;
}
