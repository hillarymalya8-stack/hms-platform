import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsNumberString, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from "class-validator";

export class ReceivePurchaseOrderLineDto {
  @IsUUID()
  lineId!: string;

  @IsNumberString()
  quantity!: string;
}

export class ReceivePurchaseOrderDto {
  // When omitted, every outstanding quantity on the order is received in full.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseOrderLineDto)
  lines?: ReceivePurchaseOrderLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  deliveryNote?: string;
}
