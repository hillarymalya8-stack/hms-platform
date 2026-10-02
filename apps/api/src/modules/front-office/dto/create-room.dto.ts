import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateRoomDto {
  @IsUUID()
  roomTypeId!: string;

  @IsOptional()
  @IsUUID()
  floorId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  roomNumber!: string;
}
