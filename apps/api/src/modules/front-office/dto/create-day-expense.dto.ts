import { IsIn, IsNumberString, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateDayExpenseDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  description!: string;

  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsIn(["TZS", "USD"])
  currencyCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  paidBy?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}
