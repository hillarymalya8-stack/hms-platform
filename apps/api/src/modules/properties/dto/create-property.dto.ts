import { IsNotEmpty, IsString, Matches, MaxLength } from "class-validator";

export class CreatePropertyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^[A-Z0-9-]+$/)
  code!: string;
}
