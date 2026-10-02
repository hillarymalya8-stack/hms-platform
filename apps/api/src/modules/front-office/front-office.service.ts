import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  FolioItemType,
  FolioStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ReservationStatus,
  RoomHousekeepingStatus,
  RoomMaintenanceStatus,
  RoomOccupancyStatus
} from "@prisma/client";
import { UserContext } from "../../common/auth/user-context";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateGuestDto } from "./dto/create-guest.dto";
import { CreateReservationDto } from "./dto/create-reservation.dto";
import { CreateRoomDto } from "./dto/create-room.dto";
import { CreateRoomTypeDto } from "./dto/create-room-type.dto";
import { PostRoomChargeDto } from "./dto/post-room-charge.dto";
import { SettleFolioPaymentDto } from "./dto/settle-folio-payment.dto";
import { UpdateRoomChartDto } from "./dto/update-room-chart.dto";
import { assertValidStayDates, blockingReservationStatuses } from "./reservation-availability";

@Injectable()
export class FrontOfficeService {
  constructor(private readonly prisma: PrismaService) {}

  listRoomTypes(user: UserContext) {
    const propertyId = this.requireProperty(user);
    return this.prisma.roomType.findMany({
      where: { propertyId },
      orderBy: { code: "asc" }
    });
  }

  async createRoomType(user: UserContext, dto: CreateRoomTypeDto) {
    const propertyId = this.requireProperty(user);
    const code = dto.code.trim().toUpperCase();
    const name = dto.name.trim();
    const baseRate = new Prisma.Decimal(dto.baseRate);
    const baseOccupancy = dto.baseOccupancy ?? 1;
    const maxOccupancy = dto.maxOccupancy ?? 2;

    if (!code || !name) {
      throw new BadRequestException("Room type code and name are required.");
    }

    if (baseRate.lt(0)) {
      throw new BadRequestException("Base rate cannot be negative.");
    }

    if (maxOccupancy < baseOccupancy) {
      throw new BadRequestException("Maximum occupancy cannot be lower than base occupancy.");
    }

    const existingRoomType = await this.prisma.roomType.findFirst({
      where: {
        propertyId,
        code
      }
    });

    if (existingRoomType) {
      throw new ConflictException(`Room type ${code} already exists.`);
    }

    const roomType = await this.prisma.roomType.create({
      data: {
        propertyId,
        code,
        name,
        baseOccupancy,
        maxOccupancy,
        baseRate,
        active: dto.active ?? true
      }
    });

    await this.recordAudit(user, "create_room_type", "room_type", roomType.id, {
      code: roomType.code,
      name: roomType.name,
      baseRate: roomType.baseRate.toString()
    });

    return roomType;
  }

  listRooms(user: UserContext) {
    const propertyId = this.requireProperty(user);
    return this.prisma.room.findMany({
      where: { propertyId },
      include: {
        floor: true,
        roomType: true
      },
      orderBy: { roomNumber: "asc" }
    });
  }

  async listRoomChart(user: UserContext) {
    const propertyId = this.requireProperty(user);
    const rooms = await this.prisma.room.findMany({
      where: { propertyId, active: true },
      include: {
        floor: true,
        roomType: true,
        reservationRooms: {
          where: {
            status: {
              in: [ReservationStatus.CONFIRMED, ReservationStatus.CHECKED_IN]
            },
            reservation: {
              status: {
                in: [ReservationStatus.CONFIRMED, ReservationStatus.CHECKED_IN]
              }
            }
          },
          include: {
            reservation: {
              include: {
                primaryGuest: true,
                folios: {
                  include: {
                    items: {
                      orderBy: { postedAt: "desc" }
                    },
                    posOrders: {
                      include: {
                        outlet: true
                      },
                      orderBy: { createdAt: "desc" },
                      take: 5
                    }
                  }
                }
              }
            }
          },
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: { roomNumber: "asc" }
    });

    return rooms.map((room) => {
      const assignedRoom =
        room.reservationRooms.find((reservationRoom) => reservationRoom.reservation.status === ReservationStatus.CHECKED_IN) ??
        room.reservationRooms.find((reservationRoom) => reservationRoom.reservation.status === ReservationStatus.CONFIRMED) ??
        null;
      const reservation = assignedRoom?.reservation ?? null;
      const folio = reservation?.folios.find((entry) => entry.status === FolioStatus.OPEN) ?? reservation?.folios[0] ?? null;
      const items = folio?.items ?? [];
      const posCharges = sumFolioItems(items, [FolioItemType.POS_CHARGE]);
      const roomCharges = sumFolioItems(items, [FolioItemType.ROOM_CHARGE, FolioItemType.OTHER]);
      const credits = sumFolioItems(items, [FolioItemType.PAYMENT, FolioItemType.DEPOSIT, FolioItemType.DISCOUNT, FolioItemType.REFUND]);

      return {
        id: room.id,
        roomNumber: room.roomNumber,
        occupancyStatus: room.occupancyStatus,
        housekeepingStatus: room.housekeepingStatus,
        maintenanceStatus: room.maintenanceStatus,
        active: room.active,
        floor: room.floor
          ? {
              id: room.floor.id,
              name: room.floor.name
            }
          : null,
        roomType: {
          id: room.roomType.id,
          code: room.roomType.code,
          name: room.roomType.name,
          baseRate: money(room.roomType.baseRate)
        },
        currentStay: reservation
          ? {
              reservationId: reservation.id,
              reservationNumber: reservation.reservationNumber,
              status: reservation.status,
              arrivalDate: reservation.arrivalDate,
              departureDate: reservation.departureDate,
              guest: {
                id: reservation.primaryGuest.id,
                firstName: reservation.primaryGuest.firstName,
                lastName: reservation.primaryGuest.lastName,
                email: reservation.primaryGuest.email,
                phone: reservation.primaryGuest.phone
              },
              nightlyRate: assignedRoom ? money(assignedRoom.nightlyRate) : "0.00",
              folio: folio
                ? {
                    id: folio.id,
                    folioNumber: folio.folioNumber,
                    status: folio.status,
                    balance: money(folio.balance),
                    posCharges: money(posCharges),
                    roomCharges: money(roomCharges),
                    credits: money(credits),
                    recentCharges: items.slice(0, 6).map((item) => ({
                      id: item.id,
                      itemType: item.itemType,
                      description: item.description,
                      totalAmount: money(item.totalAmount),
                      postedAt: item.postedAt
                    })),
                    recentPosOrders: folio.posOrders.map((order) => ({
                      id: order.id,
                      orderNumber: order.orderNumber,
                      outletName: order.outlet.name,
                      status: order.status,
                      grandTotal: money(order.grandTotal),
                      createdAt: order.createdAt
                    }))
                  }
                : null
            }
          : null
      };
    });
  }

  async createRoom(user: UserContext, dto: CreateRoomDto) {
    const propertyId = this.requireProperty(user);
    const roomNumber = dto.roomNumber.trim();

    if (!roomNumber) {
      throw new BadRequestException("Room number is required.");
    }

    const roomType = await this.prisma.roomType.findFirst({
      where: {
        id: dto.roomTypeId,
        propertyId
      }
    });

    if (!roomType) {
      throw new NotFoundException("Room type was not found.");
    }

    if (dto.floorId) {
      const floor = await this.prisma.floor.findFirst({
        where: {
          id: dto.floorId,
          propertyId
        }
      });

      if (!floor) {
        throw new NotFoundException("Floor was not found.");
      }
    }

    const existingRoom = await this.prisma.room.findFirst({
      where: {
        propertyId,
        roomNumber
      }
    });

    if (existingRoom) {
      throw new ConflictException(`Room ${roomNumber} already exists.`);
    }

    const room = await this.prisma.room.create({
      data: {
        propertyId,
        roomTypeId: dto.roomTypeId,
        floorId: dto.floorId,
        roomNumber,
        housekeepingStatus: RoomHousekeepingStatus.CLEAN,
        occupancyStatus: RoomOccupancyStatus.AVAILABLE,
        maintenanceStatus: RoomMaintenanceStatus.AVAILABLE
      },
      include: {
        roomType: true,
        floor: true
      }
    });

    await this.recordAudit(user, "create_room", "room", room.id, {
      roomNumber: room.roomNumber,
      roomType: room.roomType.code
    });

    return room;
  }

  async updateRoomChart(user: UserContext, roomId: string, dto: UpdateRoomChartDto) {
    const propertyId = this.requireProperty(user);

    return this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({
        where: {
          id: roomId,
          propertyId,
          active: true
        },
        include: {
          roomType: true
        }
      });

      if (!room) {
        throw new NotFoundException("Room was not found.");
      }

      const roomUpdates: Prisma.RoomUpdateInput = {};
      if (dto.housekeepingStatus) {
        roomUpdates.housekeepingStatus = dto.housekeepingStatus;
      }

      if (dto.maintenanceStatus) {
        roomUpdates.maintenanceStatus = dto.maintenanceStatus;
      }

      const updatedRoom = Object.keys(roomUpdates).length
        ? await tx.room.update({
            where: { id: room.id },
            data: roomUpdates,
            include: {
              roomType: true
            }
          })
        : room;

      const wantsStayUpdate = Boolean(dto.primaryGuestId || dto.arrivalDate || dto.departureDate || dto.nightlyRate !== undefined);
      let updatedReservation = null;

      if (wantsStayUpdate) {
        const activeRoom = await tx.reservationRoom.findFirst({
          where: {
            roomId: room.id,
            status: {
              in: [ReservationStatus.CONFIRMED, ReservationStatus.CHECKED_IN]
            },
            reservation: {
              propertyId,
              status: {
                in: [ReservationStatus.CONFIRMED, ReservationStatus.CHECKED_IN]
              }
            }
          },
          include: {
            reservation: {
              include: {
                primaryGuest: true,
                folios: true
              }
            },
            roomType: true
          },
          orderBy: {
            createdAt: "desc"
          }
        });

        if (!activeRoom) {
          throw new ConflictException("This room has no active reservation to edit.");
        }

        const arrivalDate = dto.arrivalDate ? toDateOnly(dto.arrivalDate) : activeRoom.reservation.arrivalDate;
        const departureDate = dto.departureDate ? toDateOnly(dto.departureDate) : activeRoom.reservation.departureDate;

        try {
          assertValidStayDates(arrivalDate, departureDate);
        } catch (error) {
          throw new BadRequestException((error as Error).message);
        }

        await this.assertRoomAvailable(tx, room.id, arrivalDate, departureDate, activeRoom.reservation.id);

        const nightlyRate = dto.nightlyRate !== undefined ? new Prisma.Decimal(dto.nightlyRate) : activeRoom.nightlyRate;
        if (nightlyRate.lt(0)) {
          throw new BadRequestException("Nightly rate cannot be negative.");
        }

        let guestId = activeRoom.reservation.primaryGuestId;
        if (dto.primaryGuestId) {
          const guest = await tx.guest.findFirst({
            where: {
              id: dto.primaryGuestId,
              organizationId: user.organizationId,
              OR: [{ propertyId }, { propertyId: null }]
            }
          });

          if (!guest) {
            throw new NotFoundException("Guest was not found.");
          }

          guestId = guest.id;
        }

        updatedReservation = await tx.reservation.update({
          where: { id: activeRoom.reservation.id },
          data: {
            primaryGuestId: guestId,
            arrivalDate,
            departureDate
          }
        });

        await tx.reservationRoom.update({
          where: { id: activeRoom.id },
          data: {
            nightlyRate
          }
        });

        if (guestId !== activeRoom.reservation.primaryGuestId) {
          await tx.reservationGuest.updateMany({
            where: {
              reservationId: activeRoom.reservation.id,
              guestRole: "primary",
              guestId: {
                not: guestId
              }
            },
            data: {
              guestRole: "guest"
            }
          });

          await tx.reservationGuest.upsert({
            where: {
              reservationId_guestId: {
                reservationId: activeRoom.reservation.id,
                guestId
              }
            },
            update: {
              guestRole: "primary",
              reservationRoomId: activeRoom.id
            },
            create: {
              reservationId: activeRoom.reservation.id,
              guestId,
              reservationRoomId: activeRoom.id,
              guestRole: "primary"
            }
          });

          await tx.folio.updateMany({
            where: {
              reservationId: activeRoom.reservation.id
            },
            data: {
              guestId
            }
          });
        }
      }

      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          propertyId,
          userId: user.userId,
          module: "front_office",
          action: "update_room_chart",
          recordType: "room",
          recordId: room.id,
          previousValue: {
            roomNumber: room.roomNumber,
            housekeepingStatus: room.housekeepingStatus,
            maintenanceStatus: room.maintenanceStatus
          },
          newValue: {
            roomNumber: updatedRoom.roomNumber,
            housekeepingStatus: updatedRoom.housekeepingStatus,
            maintenanceStatus: updatedRoom.maintenanceStatus,
            reservationId: updatedReservation?.id
          }
        }
      });

      return {
        roomId: updatedRoom.id,
        roomNumber: updatedRoom.roomNumber,
        housekeepingStatus: updatedRoom.housekeepingStatus,
        maintenanceStatus: updatedRoom.maintenanceStatus,
        reservationId: updatedReservation?.id ?? null
      };
    });
  }

  async postRoomCharge(user: UserContext, roomId: string, dto: PostRoomChargeDto) {
    const propertyId = this.requireProperty(user);
    const unitPrice = new Prisma.Decimal(dto.amount);
    const quantity = new Prisma.Decimal(dto.quantity ?? "1");

    if (unitPrice.lte(0) || quantity.lte(0)) {
      throw new BadRequestException("Charge amount and quantity must be greater than zero.");
    }

    const description = dto.description.trim();
    if (!description) {
      throw new BadRequestException("Charge description is required.");
    }

    return this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({
        where: {
          id: roomId,
          propertyId,
          active: true
        },
        include: {
          roomType: true
        }
      });

      if (!room) {
        throw new NotFoundException("Room was not found.");
      }

      const checkedInRoom = await tx.reservationRoom.findFirst({
        where: {
          roomId,
          status: ReservationStatus.CHECKED_IN,
          reservation: {
            propertyId,
            status: ReservationStatus.CHECKED_IN
          }
        },
        include: {
          reservation: {
            include: {
              primaryGuest: true,
              folios: true
            }
          }
        }
      });

      if (!checkedInRoom) {
        throw new ConflictException("This room has no checked-in guest to charge.");
      }

      const folio =
        checkedInRoom.reservation.folios.find((entry) => entry.status === FolioStatus.OPEN) ??
        (await tx.folio.create({
          data: {
            propertyId,
            reservationId: checkedInRoom.reservation.id,
            guestId: checkedInRoom.reservation.primaryGuestId,
            folioNumber: await this.nextFolioNumber(tx, propertyId, new Date()),
            status: FolioStatus.OPEN
          }
        }));

      const totalAmount = unitPrice.mul(quantity);
      const item = await tx.folioItem.create({
        data: {
          folioId: folio.id,
          itemType: FolioItemType.OTHER,
          sourceType: "FRONT_OFFICE",
          sourceId: checkedInRoom.id,
          description,
          quantity,
          unitPrice,
          totalAmount
        }
      });

      const updatedFolio = await tx.folio.update({
        where: { id: folio.id },
        data: {
          balance: {
            increment: totalAmount
          }
        }
      });

      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          propertyId,
          userId: user.userId,
          module: "front_office",
          action: "post_room_charge",
          recordType: "folio_item",
          recordId: item.id,
          newValue: {
            roomNumber: room.roomNumber,
            folioNumber: updatedFolio.folioNumber,
            description,
            totalAmount: totalAmount.toString()
          }
        }
      });

      return {
        roomId: room.id,
        roomNumber: room.roomNumber,
        reservationId: checkedInRoom.reservation.id,
        reservationNumber: checkedInRoom.reservation.reservationNumber,
        guest: checkedInRoom.reservation.primaryGuest,
        folio: {
          id: updatedFolio.id,
          folioNumber: updatedFolio.folioNumber,
          balance: money(updatedFolio.balance),
          status: updatedFolio.status
        },
        item: {
          id: item.id,
          description: item.description,
          totalAmount: money(item.totalAmount),
          postedAt: item.postedAt
        }
      };
    });
  }

  listGuests(user: UserContext) {
    return this.prisma.guest.findMany({
      where: {
        organizationId: user.organizationId,
        OR: user.propertyId ? [{ propertyId: user.propertyId }, { propertyId: null }] : undefined
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    });
  }

  async createGuest(user: UserContext, dto: CreateGuestDto) {
    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();
    const email = dto.email?.trim().toLowerCase() || undefined;
    const phone = dto.phone?.trim() || undefined;
    const documentNumber = dto.documentNumber?.trim() || undefined;

    if (!firstName || !lastName) {
      throw new BadRequestException("Guest first name and last name are required.");
    }

    if (email) {
      const existingGuest = await this.prisma.guest.findFirst({
        where: {
          organizationId: user.organizationId,
          email
        }
      });

      if (existingGuest) {
        throw new ConflictException(`Guest email ${email} is already registered.`);
      }
    }

    const guest = await this.prisma.guest.create({
      data: {
        organizationId: user.organizationId,
        propertyId: user.propertyId,
        firstName,
        lastName,
        email,
        phone,
        documentNumber
      }
    });

    await this.recordAudit(user, "create_guest", "guest", guest.id, {
      firstName: guest.firstName,
      lastName: guest.lastName,
      email: guest.email
    });

    return guest;
  }

  listReservations(user: UserContext) {
    const propertyId = this.requireProperty(user);
    return this.prisma.reservation.findMany({
      where: { propertyId },
      include: {
        primaryGuest: true,
        reservationRooms: {
          include: {
            room: true,
            roomType: true
          }
        },
        folios: true
      },
      orderBy: [{ arrivalDate: "desc" }, { reservationNumber: "desc" }]
    });
  }

  async createReservation(user: UserContext, dto: CreateReservationDto) {
    const propertyId = this.requireProperty(user);
    const arrivalDate = toDateOnly(dto.arrivalDate);
    const departureDate = toDateOnly(dto.departureDate);

    try {
      assertValidStayDates(arrivalDate, departureDate);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    return this.prisma.$transaction(async (tx) => {
      const guest = await tx.guest.findFirst({
        where: {
          id: dto.primaryGuestId,
          organizationId: user.organizationId
        }
      });

      if (!guest) {
        throw new NotFoundException("Primary guest was not found.");
      }

      const roomType = await tx.roomType.findFirst({
        where: {
          id: dto.roomTypeId,
          propertyId,
          active: true
        }
      });

      if (!roomType) {
        throw new NotFoundException("Room type was not found.");
      }

      if (dto.roomId) {
        const room = await tx.room.findFirst({
          where: {
            id: dto.roomId,
            propertyId,
            roomTypeId: dto.roomTypeId,
            active: true
          }
        });

        if (!room) {
          throw new NotFoundException("Room was not found.");
        }

        if (room.maintenanceStatus !== RoomMaintenanceStatus.AVAILABLE) {
          throw new ConflictException("Room is not available for sale.");
        }

        await this.assertRoomAvailable(tx, dto.roomId, arrivalDate, departureDate);
      }

      const reservationNumber = await this.nextReservationNumber(tx, propertyId, arrivalDate);
      const reservation = await tx.reservation.create({
        data: {
          propertyId,
          primaryGuestId: dto.primaryGuestId,
          reservationNumber,
          arrivalDate,
          departureDate,
          adults: dto.adults ?? 1,
          children: dto.children ?? 0,
          status: ReservationStatus.CONFIRMED,
          bookingSource: dto.bookingSource,
          notes: dto.notes,
          reservationRooms: {
            create: {
              roomTypeId: dto.roomTypeId,
              roomId: dto.roomId,
              nightlyRate: new Prisma.Decimal(dto.nightlyRate),
              status: ReservationStatus.CONFIRMED
            }
          },
          reservationGuests: {
            create: {
              guestId: dto.primaryGuestId,
              guestRole: "primary"
            }
          }
        },
        include: {
          primaryGuest: true,
          reservationRooms: {
            include: {
              room: true,
              roomType: true
            }
          }
        }
      });

      if (dto.roomId) {
        await tx.room.update({
          where: { id: dto.roomId },
          data: {
            occupancyStatus: RoomOccupancyStatus.RESERVED
          }
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          propertyId,
          userId: user.userId,
          module: "front_office",
          action: "create_reservation",
          recordType: "reservation",
          recordId: reservation.id,
          newValue: {
            reservationNumber: reservation.reservationNumber,
            arrivalDate: reservation.arrivalDate.toISOString(),
            departureDate: reservation.departureDate.toISOString(),
            roomId: dto.roomId,
            guestId: dto.primaryGuestId
          }
        }
      });

      return reservation;
    });
  }

  async checkIn(user: UserContext, reservationId: string) {
    const propertyId = this.requireProperty(user);

    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findFirst({
        where: {
          id: reservationId,
          propertyId
        },
        include: {
          reservationRooms: true,
          folios: true
        }
      });

      if (!reservation) {
        throw new NotFoundException("Reservation was not found.");
      }

      if (reservation.status !== ReservationStatus.CONFIRMED) {
        throw new ConflictException("Only confirmed reservations can be checked in.");
      }

      const assignedRoom = reservation.reservationRooms.find((reservationRoom) => reservationRoom.roomId);
      if (!assignedRoom?.roomId) {
        throw new BadRequestException("A room must be assigned before check-in.");
      }

      await this.assertRoomAvailable(tx, assignedRoom.roomId, reservation.arrivalDate, reservation.departureDate, reservation.id);

      const existingOpenFolio = reservation.folios.find((folio) => folio.status === FolioStatus.OPEN);
      const folio =
        existingOpenFolio ??
        (await tx.folio.create({
          data: {
            propertyId,
            reservationId: reservation.id,
            guestId: reservation.primaryGuestId,
            folioNumber: await this.nextFolioNumber(tx, propertyId, reservation.arrivalDate),
            status: FolioStatus.OPEN
          }
        }));

      const nights = stayNights(reservation.arrivalDate, reservation.departureDate);
      const roomChargeTotal = reservation.reservationRooms.reduce(
        (sum, reservationRoom) => sum.plus(reservationRoom.nightlyRate.mul(nights)),
        new Prisma.Decimal(0)
      );

      if (roomChargeTotal.gt(0)) {
        await tx.folioItem.create({
          data: {
            folioId: folio.id,
            itemType: FolioItemType.ROOM_CHARGE,
            sourceType: "RESERVATION",
            sourceId: reservation.id,
            description: `Room charge for ${nights} night${nights === 1 ? "" : "s"}`,
            quantity: new Prisma.Decimal(nights),
            unitPrice: roomChargeTotal.div(nights),
            totalAmount: roomChargeTotal
          }
        });

        await tx.folio.update({
          where: { id: folio.id },
          data: {
            balance: {
              increment: roomChargeTotal
            }
          }
        });
      }

      const updatedReservation = await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          status: ReservationStatus.CHECKED_IN,
          checkedInAt: new Date(),
          reservationRooms: {
            updateMany: {
              where: { reservationId: reservation.id },
              data: { status: ReservationStatus.CHECKED_IN }
            }
          }
        },
        include: {
          folios: true,
          reservationRooms: {
            include: {
              room: true,
              roomType: true
            }
          }
        }
      });

      await tx.room.update({
        where: { id: assignedRoom.roomId },
        data: {
          occupancyStatus: RoomOccupancyStatus.OCCUPIED
        }
      });

      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          propertyId,
          userId: user.userId,
          module: "front_office",
          action: "check_in",
          recordType: "reservation",
          recordId: reservation.id,
          previousValue: {
            status: reservation.status
          },
          newValue: {
            status: ReservationStatus.CHECKED_IN,
            folioNumber: folio.folioNumber,
            roomChargeTotal: roomChargeTotal.toString()
          }
        }
      });

      return updatedReservation;
    });
  }

  async settleFolio(user: UserContext, reservationId: string, dto: SettleFolioPaymentDto) {
    const propertyId = this.requireProperty(user);
    const amount = new Prisma.Decimal(dto.amount);
    const paymentProvider = normalizeProvider(dto.paymentProvider);
    const externalReceiptNumber = dto.externalReceiptNumber?.trim() || undefined;

    if (amount.lte(0)) {
      throw new BadRequestException("Payment amount must be greater than zero.");
    }

    if (dto.paymentMethod === PaymentMethod.BANK_TRANSFER && !paymentProvider) {
      throw new BadRequestException("Choose PayPal, Selcom, or CRDB for bank payment.");
    }

    if (dto.paymentMethod === PaymentMethod.BANK_TRANSFER && paymentProvider && !isBankProvider(paymentProvider)) {
      throw new BadRequestException("Bank payment provider must be PayPal, Selcom, or CRDB.");
    }

    if (dto.paymentMethod === PaymentMethod.MOBILE_MONEY && !paymentProvider) {
      throw new BadRequestException("Choose M-Pesa or TigoPesa for mobile money payment.");
    }

    if (dto.paymentMethod === PaymentMethod.MOBILE_MONEY && paymentProvider && !isMobileProvider(paymentProvider)) {
      throw new BadRequestException("Mobile money provider must be M-Pesa or TigoPesa.");
    }

    if (
      dto.paymentMethod !== PaymentMethod.BANK_TRANSFER &&
      dto.paymentMethod !== PaymentMethod.MOBILE_MONEY &&
      paymentProvider
    ) {
      throw new BadRequestException("Payment provider is only allowed for bank or mobile money payments.");
    }

    if (requiresReceiptId(dto.paymentMethod) && !externalReceiptNumber) {
      throw new BadRequestException("Receipt ID number is required for this payment.");
    }

    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findFirst({
        where: {
          id: reservationId,
          propertyId
        },
        include: {
          primaryGuest: true,
          folios: true
        }
      });

      if (!reservation) {
        throw new NotFoundException("Reservation was not found.");
      }

      if (reservation.status !== ReservationStatus.CHECKED_IN) {
        throw new ConflictException("Only checked-in reservations can receive checkout payments.");
      }

      const openFolio = reservation.folios.find((folio) => folio.status === FolioStatus.OPEN);
      if (!openFolio) {
        throw new ConflictException("This reservation has no open guest folio to settle.");
      }

      if (amount.gt(openFolio.balance)) {
        throw new BadRequestException("Payment amount cannot exceed the folio balance.");
      }

      if (externalReceiptNumber) {
        const duplicatePayment = await tx.payment.findFirst({
          where: {
            propertyId,
            externalReceiptNumber,
            status: PaymentStatus.COMPLETED
          }
        });

        if (duplicatePayment) {
          throw new ConflictException("This receipt ID number has already been used.");
        }
      }

      const systemReceiptNumber = await this.nextReceiptNumber(tx, propertyId, new Date());
      const payment = await tx.payment.create({
        data: {
          propertyId,
          sourceType: "FOLIO",
          sourceId: openFolio.id,
          paymentMethod: dto.paymentMethod,
          amount,
          currencyCode: "USD",
          systemReceiptNumber,
          externalReceiptNumber,
          externalReference: paymentProvider ? formatProvider(paymentProvider) : externalReceiptNumber,
          paymentMetadata: {
            provider: paymentProvider,
            reservationNumber: reservation.reservationNumber,
            folioNumber: openFolio.folioNumber,
            guestName: `${reservation.primaryGuest.firstName} ${reservation.primaryGuest.lastName}`
          }
        }
      });

      const item = await tx.folioItem.create({
        data: {
          folioId: openFolio.id,
          itemType: FolioItemType.PAYMENT,
          sourceType: "PAYMENT",
          sourceId: payment.id,
          description: `Payment - ${paymentLabel(dto.paymentMethod, paymentProvider)}`,
          quantity: new Prisma.Decimal(1),
          unitPrice: amount,
          totalAmount: amount
        }
      });

      const updatedFolio = await tx.folio.update({
        where: { id: openFolio.id },
        data: {
          balance: {
            decrement: amount
          }
        }
      });

      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          propertyId,
          userId: user.userId,
          module: "front_office",
          action: "settle_folio",
          recordType: "payment",
          recordId: payment.id,
          newValue: {
            reservationNumber: reservation.reservationNumber,
            folioNumber: updatedFolio.folioNumber,
            paymentMethod: payment.paymentMethod,
            paymentProvider,
            externalReceiptNumber,
            amount: amount.toString()
          }
        }
      });

      return {
        reservationId: reservation.id,
        reservationNumber: reservation.reservationNumber,
        guestName: `${reservation.primaryGuest.firstName} ${reservation.primaryGuest.lastName}`,
        payment: {
          id: payment.id,
          systemReceiptNumber: payment.systemReceiptNumber,
          externalReceiptNumber: payment.externalReceiptNumber,
          paymentMethod: payment.paymentMethod,
          paymentProvider,
          amount: money(payment.amount),
          createdAt: payment.createdAt
        },
        folio: {
          id: updatedFolio.id,
          folioNumber: updatedFolio.folioNumber,
          balance: money(updatedFolio.balance),
          status: updatedFolio.status
        },
        item: {
          id: item.id,
          description: item.description,
          totalAmount: money(item.totalAmount),
          postedAt: item.postedAt
        }
      };
    });
  }

  async checkOut(user: UserContext, reservationId: string) {
    const propertyId = this.requireProperty(user);

    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findFirst({
        where: {
          id: reservationId,
          propertyId
        },
        include: {
          reservationRooms: true,
          folios: true
        }
      });

      if (!reservation) {
        throw new NotFoundException("Reservation was not found.");
      }

      if (reservation.status !== ReservationStatus.CHECKED_IN) {
        throw new ConflictException("Only checked-in reservations can be checked out.");
      }

      const openFolio = reservation.folios.find((folio) => folio.status === FolioStatus.OPEN);
      if (openFolio && !openFolio.balance.equals(0)) {
        throw new ConflictException("Guest folio must be settled before check-out.");
      }

      const updatedReservation = await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          status: ReservationStatus.CHECKED_OUT,
          checkedOutAt: new Date(),
          reservationRooms: {
            updateMany: {
              where: { reservationId: reservation.id },
              data: { status: ReservationStatus.CHECKED_OUT }
            }
          },
          folios: {
            updateMany: {
              where: {
                reservationId: reservation.id,
                status: FolioStatus.OPEN
              },
              data: {
                status: FolioStatus.CLOSED,
                closedAt: new Date()
              }
            }
          }
        },
        include: {
          folios: true,
          reservationRooms: true
        }
      });

      for (const reservationRoom of reservation.reservationRooms) {
        if (reservationRoom.roomId) {
          await tx.room.update({
            where: { id: reservationRoom.roomId },
            data: {
              occupancyStatus: RoomOccupancyStatus.AVAILABLE,
              housekeepingStatus: RoomHousekeepingStatus.DIRTY
            }
          });
        }
      }

      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          propertyId,
          userId: user.userId,
          module: "front_office",
          action: "check_out",
          recordType: "reservation",
          recordId: reservation.id,
          previousValue: {
            status: reservation.status
          },
          newValue: {
            status: ReservationStatus.CHECKED_OUT
          }
        }
      });

      return updatedReservation;
    });
  }

  private async assertRoomAvailable(
    tx: Prisma.TransactionClient,
    roomId: string,
    arrivalDate: Date,
    departureDate: Date,
    excludeReservationId?: string
  ) {
    const conflict = await tx.reservationRoom.findFirst({
      where: {
        roomId,
        status: {
          in: blockingReservationStatuses
        },
        reservationId: excludeReservationId
          ? {
              not: excludeReservationId
            }
          : undefined,
        reservation: {
          arrivalDate: {
            lt: departureDate
          },
          departureDate: {
            gt: arrivalDate
          },
          status: {
            in: blockingReservationStatuses
          }
        }
      },
      include: {
        reservation: true
      }
    });

    if (conflict) {
      throw new ConflictException(`Room is already booked by ${conflict.reservation.reservationNumber}.`);
    }
  }

  private async nextReservationNumber(tx: Prisma.TransactionClient, propertyId: string, date: Date) {
    const year = date.getUTCFullYear();
    const count = await tx.reservation.count({
      where: {
        propertyId,
        reservationNumber: {
          startsWith: `RES-${year}-`
        }
      }
    });

    return `RES-${year}-${String(count + 1).padStart(5, "0")}`;
  }

  private async nextFolioNumber(tx: Prisma.TransactionClient, propertyId: string, date: Date) {
    const year = date.getUTCFullYear();
    const count = await tx.folio.count({
      where: {
        propertyId,
        folioNumber: {
          startsWith: `FOL-${year}-`
        }
      }
    });

    return `FOL-${year}-${String(count + 1).padStart(5, "0")}`;
  }

  private async nextReceiptNumber(tx: Prisma.TransactionClient, propertyId: string, date: Date) {
    const year = date.getUTCFullYear();
    const count = await tx.payment.count({
      where: {
        propertyId,
        systemReceiptNumber: {
          startsWith: `RCT-${year}-`
        }
      }
    });

    return `RCT-${year}-${String(count + 1).padStart(5, "0")}`;
  }

  private async recordAudit(
    user: UserContext,
    action: string,
    recordType: string,
    recordId: string,
    newValue: Prisma.InputJsonValue
  ) {
    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        propertyId: user.propertyId,
        userId: user.userId,
        module: "front_office",
        action,
        recordType,
        recordId,
        newValue
      }
    });
  }

  private requireProperty(user: UserContext) {
    if (!user.propertyId) {
      throw new BadRequestException("A property context is required.");
    }

    return user.propertyId;
  }
}

function toDateOnly(value: string) {
  const datePart = value.slice(0, 10);
  return new Date(`${datePart}T00:00:00.000Z`);
}

type FolioItemSummary = {
  itemType: FolioItemType;
  totalAmount: Prisma.Decimal;
};

const bankPaymentProviders = ["PAYPAL", "SELCOM", "CRDB"] as const;
const mobilePaymentProviders = ["MPESA", "TIGOPESA"] as const;
type BankPaymentProvider = (typeof bankPaymentProviders)[number];
type MobilePaymentProvider = (typeof mobilePaymentProviders)[number];
type PaymentProvider = BankPaymentProvider | MobilePaymentProvider;

function sumFolioItems(items: FolioItemSummary[], itemTypes: FolioItemType[]) {
  return items
    .filter((item) => itemTypes.includes(item.itemType))
    .reduce((sum, item) => sum.plus(item.totalAmount), new Prisma.Decimal(0));
}

function stayNights(arrivalDate: Date, departureDate: Date) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / millisecondsPerDay));
}

function money(value: Prisma.Decimal) {
  return value.toFixed(2);
}

function normalizeProvider(value?: string) {
  return value?.trim().toUpperCase().replace(/[\s-]+/g, "") as PaymentProvider | undefined;
}

function isBankProvider(provider: PaymentProvider): provider is BankPaymentProvider {
  return (bankPaymentProviders as readonly string[]).includes(provider);
}

function isMobileProvider(provider: PaymentProvider): provider is MobilePaymentProvider {
  return (mobilePaymentProviders as readonly string[]).includes(provider);
}

function formatProvider(provider: PaymentProvider) {
  if (provider === "PAYPAL") return "PayPal";
  if (provider === "SELCOM") return "Selcom";
  if (provider === "MPESA") return "M-Pesa";
  if (provider === "TIGOPESA") return "TigoPesa";
  return "CRDB";
}

function requiresReceiptId(paymentMethod: PaymentMethod) {
  return (
    paymentMethod === PaymentMethod.CARD ||
    paymentMethod === PaymentMethod.CREDIT ||
    paymentMethod === PaymentMethod.MOBILE_MONEY ||
    paymentMethod === PaymentMethod.BANK_TRANSFER
  );
}

function paymentLabel(paymentMethod: PaymentMethod, provider?: PaymentProvider) {
  if (provider) return `${formatProvider(provider)} ${paymentMethod.toLowerCase().replaceAll("_", " ")}`;
  return paymentMethod.toLowerCase().replaceAll("_", " ");
}
