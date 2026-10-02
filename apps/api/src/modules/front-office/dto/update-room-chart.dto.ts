import { RoomHousekeepingStatus, RoomMaintenanceStatus } from "@prisma/client";
import { IsEnum, IsISO8601, IsNumberString, IsOptional, IsUUID } from "class-validator";

export class UpdateRoomChartDto {
  @IsOptional()
  @IsEnum(RoomHousekeepingStatus)
  housekeepingStatus?: RoomHousekeepingStatus;

  @IsOptional()
  @IsEnum(RoomMaintenanceStatus)
  maintenanceStatus?: RoomMaintenanceStatus;

  @IsOptional()
  @IsUUID()
  primaryGuestId?: string;

  @IsOptional()
  @IsISO8601()
  arrivalDate?: string;

  @IsOptional()
  @IsISO8601()
  departureDate?: string;

  @IsOptional()
  @IsNumberString()
  nightlyRate?: string;
}
