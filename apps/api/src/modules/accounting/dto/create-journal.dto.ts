import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { ValidateJournalLineDto } from "./validate-journal.dto";

export class CreateJournalDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  memo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => ValidateJournalLineDto)
  lines!: ValidateJournalLineDto[];
}
