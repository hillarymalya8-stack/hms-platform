import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";

class CreatePosOrderItemDto {
  @IsUUID()
  productVariantId!: string;

  @IsString()
  quantity!: string;
}

export class CreatePosOrderDto {
  @IsUUID()
  outletId!: string;

  @IsOptional()
  @IsUUID()
  terminalId?: string;

  @IsOptional()
  @IsUUID()
  shiftId?: string;

  @IsOptional()
  @IsUUID()
  tableId?: string;

  @IsOptional()
  @IsUUID()
  folioId?: string;

  @IsOptional()
  @IsString()
  serviceType?: "DINE_IN" | "TAKEAWAY" | "ROOM_SERVICE" | "BAR";

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePosOrderItemDto)
  items!: CreatePosOrderItemDto[];
}
