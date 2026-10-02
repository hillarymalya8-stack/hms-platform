import { IsNumberString, IsOptional, IsString, MaxLength } from "class-validator";

export class PostRoomChargeDto {
  @IsString()
  @MaxLength(160)
  description!: string;

  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsNumberString()
  quantity?: string;
}
