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

  // TSh rate per night.
  @IsNumberString()
  baseRate!: string;

  // Optional USD rate per night.
  @IsOptional()
  @IsNumberString()
  baseRateUsd?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
