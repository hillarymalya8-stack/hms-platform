import { IsIn, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class PostInventoryMovementDto {
  @IsUUID()
  itemId!: string;

  @IsUUID()
  sourceLocationId!: string;

  @IsNumberString()
  quantity!: string;

  @IsIn(["ISSUE", "TRANSFER"])
  movementType!: "ISSUE" | "TRANSFER";

  @IsOptional()
  @IsUUID()
  targetLocationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  destination?: string;
}
