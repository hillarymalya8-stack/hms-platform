import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested
} from "class-validator";

export class CreatePurchaseOrderLineDto {
  @IsUUID()
  inventoryItemId!: string;

  @IsNumberString()
  quantity!: string;

  @IsNumberString()
  unitCost!: string;

  @IsOptional()
  @IsNumberString()
  taxAmount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

export class CreatePurchaseOrderDto {
  @IsUUID()
  supplierId!: string;

  @IsOptional()
  @IsISO8601()
  expectedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderLineDto)
  lines!: CreatePurchaseOrderLineDto[];
}
