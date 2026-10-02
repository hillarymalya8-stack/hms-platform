import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from "class-validator";

class ValidateJournalLineDto {
  @IsString()
  accountCode!: string;

  @IsOptional()
  @IsString()
  debitAmount?: string;

  @IsOptional()
  @IsString()
  creditAmount?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class ValidateJournalDto {
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => ValidateJournalLineDto)
  lines!: ValidateJournalLineDto[];
}
