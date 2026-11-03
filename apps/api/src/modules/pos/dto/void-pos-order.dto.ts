import { IsString, MaxLength, MinLength } from "class-validator";

export class VoidPosOrderDto {
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  reason!: string;
}
