import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import { UserContext } from "../../common/auth/user-context";
import { CreateGuestDto } from "./dto/create-guest.dto";
import { CreateReservationDto } from "./dto/create-reservation.dto";
import { CreateRoomDto } from "./dto/create-room.dto";
import { CreateRoomTypeDto } from "./dto/create-room-type.dto";
import { PostRoomChargeDto } from "./dto/post-room-charge.dto";
import { SettleFolioPaymentDto } from "./dto/settle-folio-payment.dto";
import { UpdateRoomChartDto } from "./dto/update-room-chart.dto";
import { FrontOfficeService } from "./front-office.service";

@Controller("front-office")
export class FrontOfficeController {
  constructor(private readonly frontOffice: FrontOfficeService) {}

  @RequirePermissions("front_office.view")
  @Get("room-types")
  listRoomTypes(@CurrentUser() user: UserContext) {
    return this.frontOffice.listRoomTypes(user);
  }

  @RequirePermissions("front_office.rooms.manage")
  @Post("room-types")
  createRoomType(@CurrentUser() user: UserContext, @Body() dto: CreateRoomTypeDto) {
    return this.frontOffice.createRoomType(user, dto);
  }

  @RequirePermissions("front_office.view")
  @Get("room-chart")
  listRoomChart(@CurrentUser() user: UserContext) {
    return this.frontOffice.listRoomChart(user);
  }

  @RequirePermissions("front_office.view")
  @Get("rooms")
  listRooms(@CurrentUser() user: UserContext) {
    return this.frontOffice.listRooms(user);
  }

  @RequirePermissions("front_office.rooms.manage")
  @Post("rooms")
  createRoom(@CurrentUser() user: UserContext, @Body() dto: CreateRoomDto) {
    return this.frontOffice.createRoom(user, dto);
  }

  @RequirePermissions("front_office.rooms.manage")
  @Patch("rooms/:roomId/chart")
  updateRoomChart(@CurrentUser() user: UserContext, @Param("roomId") roomId: string, @Body() dto: UpdateRoomChartDto) {
    return this.frontOffice.updateRoomChart(user, roomId, dto);
  }

  @RequirePermissions("front_office.reservations.check_in")
  @Post("rooms/:roomId/charges")
  postRoomCharge(@CurrentUser() user: UserContext, @Param("roomId") roomId: string, @Body() dto: PostRoomChargeDto) {
    return this.frontOffice.postRoomCharge(user, roomId, dto);
  }

  @RequirePermissions("front_office.view")
  @Get("guests")
  listGuests(@CurrentUser() user: UserContext) {
    return this.frontOffice.listGuests(user);
  }

  @RequirePermissions("front_office.guests.manage")
  @Post("guests")
  createGuest(@CurrentUser() user: UserContext, @Body() dto: CreateGuestDto) {
    return this.frontOffice.createGuest(user, dto);
  }

  @RequirePermissions("front_office.view")
  @Get("reservations")
  listReservations(@CurrentUser() user: UserContext) {
    return this.frontOffice.listReservations(user);
  }

  @RequirePermissions("front_office.reservations.create")
  @Post("reservations")
  createReservation(@CurrentUser() user: UserContext, @Body() dto: CreateReservationDto) {
    return this.frontOffice.createReservation(user, dto);
  }

  @RequirePermissions("front_office.reservations.check_in")
  @Post("reservations/:reservationId/check-in")
  checkIn(@CurrentUser() user: UserContext, @Param("reservationId") reservationId: string) {
    return this.frontOffice.checkIn(user, reservationId);
  }

  @RequirePermissions("front_office.reservations.check_out")
  @Post("reservations/:reservationId/settle")
  settleFolio(@CurrentUser() user: UserContext, @Param("reservationId") reservationId: string, @Body() dto: SettleFolioPaymentDto) {
    return this.frontOffice.settleFolio(user, reservationId, dto);
  }

  @RequirePermissions("front_office.reservations.check_out")
  @Post("reservations/:reservationId/check-out")
  checkOut(@CurrentUser() user: UserContext, @Param("reservationId") reservationId: string) {
    return this.frontOffice.checkOut(user, reservationId);
  }
}
