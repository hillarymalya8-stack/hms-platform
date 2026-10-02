import { AccountType } from "@prisma/client";
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateAccountDto {
  @IsString()
  @MaxLength(20)
  accountCode!: string;

  @IsString()
  @MaxLength(160)
  accountName!: string;

  @IsEnum(AccountType)
  accountType!: AccountType;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsBoolean()
  isControlAccount?: boolean;
}
