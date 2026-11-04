import { IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";

export class AuditQueryDto {
  @IsOptional()
  @Matches(/^\d{1,6}$/)
  page?: string;

  @IsOptional()
  @Matches(/^\d{1,3}$/)
  pageSize?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  to?: string;

  @IsOptional()
  @IsUUID()
  itemId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  module?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
