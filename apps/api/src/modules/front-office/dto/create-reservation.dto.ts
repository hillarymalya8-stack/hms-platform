import { IsIn, IsInt, IsISO8601, IsNumberString, IsOptional, IsString, IsUUID, Min } from "class-validator";

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

  // Currency the stay is sold in; the folio is kept in this currency. Defaults to TZS.
  @IsOptional()
  @IsIn(["TZS", "USD"])
  currencyCode?: "TZS" | "USD";

  @IsOptional()
  @IsString()
  bookingSource?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
