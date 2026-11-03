import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsString, IsUUID, ValidateNested } from "class-validator";

class UpdatePosOrderItemDto {
  @IsUUID()
  productVariantId!: string;

  @IsString()
  quantity!: string;
}

// Replaces the items on an unpaid order (to correct a mistake before payment).
export class UpdatePosOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdatePosOrderItemDto)
  items!: UpdatePosOrderItemDto[];
}
