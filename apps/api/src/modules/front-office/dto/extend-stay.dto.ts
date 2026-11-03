import { IsInt, IsNumberString, IsOptional, Max, Min } from "class-validator";

// Adds extra nights to a checked-in stay. The extra nights are charged to the guest folio.
export class ExtendStayDto {
  @IsInt()
  @Min(1)
  @Max(365)
  nights!: number;

  // Optional nightly rate for the extra nights, in the stay's currency. Defaults to the booked rate.
  @IsOptional()
  @IsNumberString()
  nightlyRate?: string;
}
