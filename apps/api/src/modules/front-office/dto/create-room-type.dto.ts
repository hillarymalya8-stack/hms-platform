import { IsBoolean, IsInt, IsNotEmpty, IsNumberString, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateRoomTypeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  baseOccupancy?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxOccupancy?: number;

  @IsNumberString()
  baseRate!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
