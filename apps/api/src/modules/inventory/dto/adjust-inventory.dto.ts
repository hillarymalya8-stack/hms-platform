import { IsIn, IsNotEmpty, IsNumberString, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class AdjustInventoryDto {
  @IsUUID()
  itemId!: string;

  @IsUUID()
  locationId!: string;

  @IsIn(["INCREASE", "DECREASE"])
  direction!: "INCREASE" | "DECREASE";

  @IsNumberString()
  quantity!: string;

  // Required: why the balance is being corrected (breakage, count difference, found stock...).
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}
