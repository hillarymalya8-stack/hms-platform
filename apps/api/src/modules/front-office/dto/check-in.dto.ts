import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export const mealPlans = ["FULL_BOARD", "HALF_BOARD", "BED_AND_BREAKFAST"] as const;
export type MealPlan = (typeof mealPlans)[number];

// Optional prepaid details captured at check-in. Leave empty for walk-in / pay-on-departure guests.
export class CheckInDto {
  @IsOptional()
  @IsIn(mealPlans)
  mealPlan?: MealPlan;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  companyName?: string;

  // Total already paid for the booking, in the stay's currency.
  @IsOptional()
  @IsString()
  prepaidAmount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentReference?: string;
}
