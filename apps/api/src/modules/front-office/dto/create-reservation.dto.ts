import { IsInt, IsISO8601, IsNumberString, IsOptional, IsString, IsUUID, Min } from "class-validator";

export class CreateReservationDto {
  @IsUUID()
  primaryGuestId!: string;

  @IsUUID()
  roomTypeId!: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsISO8601()
  arrivalDate!: string;

  @IsISO8601()
  departureDate!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  adults?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  children?: number;

  @IsNumberString()
  nightlyRate!: string;

  @IsOptional()
  @IsString()
  bookingSource?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
