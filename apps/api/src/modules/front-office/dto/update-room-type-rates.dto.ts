import { IsNumberString, IsOptional, IsString, Matches } from "class-validator";

export class UpdateRoomTypeRatesDto {
  // TSh rate per night.
  @IsOptional()
  @IsNumberString()
  baseRate?: string;

  // USD rate per night; an empty string removes the USD rate.
  @IsOptional()
  @IsString()
  @Matches(/^(\d{1,12}(\.\d{1,4})?)?$/, { message: "USD rate must be a positive amount with up to 4 decimals." })
  baseRateUsd?: string;
}
