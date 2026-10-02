import { BadRequestException, Injectable } from "@nestjs/common";
import { FolioItemType, Prisma } from "@prisma/client";
import { UserContext } from "../../common/auth/user-context";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async searchReservations(user: UserContext, query: string) {
    const propertyId = this.requireProperty(user);
    const search = query.trim();

    if (search.length < 2) {
      throw new BadRequestException("Enter at least 2 characters to search invoices.");
    }

    const reservations = await this.prisma.reservation.findMany({
      where: {
        propertyId,
        OR: [
          { reservationNumber: { contains: search, mode: "insensitive" } },
          { primaryGuest: { firstName: { contains: search, mode: "insensitive" } } },
          { primaryGuest: { lastName: { contains: search, mode: "insensitive" } } },
          { primaryGuest: { email: { contains: search, mode: "insensitive" } } },
          { primaryGuest: { phone: { contains: search, mode: "insensitive" } } },
          { primaryGuest: { documentNumber: { contains: search, mode: "insensitive" } } }
        ]
      },
      include: {
        primaryGuest: true,
        reservationRooms: {
          include: {
            room: true,
            roomType: true
          }
        },
        folios: {
          include: {
            items: {
              orderBy: { postedAt: "asc" }
            }
          },
          orderBy: { openedAt: "asc" }
        }
      },
      orderBy: [{ arrivalDate: "desc" }, { reservationNumber: "desc" }],
      take: 20
    });

    return reservations.map((reservation) => {
      const assignedRoom = reservation.reservationRooms[0] ?? null;
      const folioItems = reservation.folios.flatMap((folio) =>
        folio.items.map((item) => ({
          id: item.id,
          folioId: folio.id,
          folioNumber: folio.folioNumber,
          itemType: item.itemType,
          sourceType: item.sourceType,
          description: item.description,
          quantity: money(item.quantity),
          unitPrice: money(item.unitPrice),
          totalAmount: money(item.totalAmount),
          postedAt: item.postedAt
        }))
      );

      return {
        id: reservation.id,
        reservationNumber: reservation.reservationNumber,
        status: reservation.status,
        arrivalDate: reservation.arrivalDate,
        departureDate: reservation.departureDate,
        guest: {
          id: reservation.primaryGuest.id,
          firstName: reservation.primaryGuest.firstName,
          lastName: reservation.primaryGuest.lastName,
          email: reservation.primaryGuest.email,
          phone: reservation.primaryGuest.phone,
          documentNumber: reservation.primaryGuest.documentNumber
        },
        room: assignedRoom
          ? {
              id: assignedRoom.room?.id ?? null,
              roomNumber: assignedRoom.room?.roomNumber ?? null,
              roomType: assignedRoom.roomType.name,
              nightlyRate: money(assignedRoom.nightlyRate)
            }
          : null,
        projectedRoomCharge: assignedRoom
          ? {
              id: `projected-${assignedRoom.id}`,
              itemType: FolioItemType.ROOM_CHARGE,
              description: `Room charge for ${stayNights(reservation.arrivalDate, reservation.departureDate)} night${
                stayNights(reservation.arrivalDate, reservation.departureDate) === 1 ? "" : "s"
              }`,
              quantity: String(stayNights(reservation.arrivalDate, reservation.departureDate)),
              unitPrice: money(assignedRoom.nightlyRate),
              totalAmount: money(assignedRoom.nightlyRate.mul(stayNights(reservation.arrivalDate, reservation.departureDate))),
              postedAt: reservation.arrivalDate
            }
          : null,
        folios: reservation.folios.map((folio) => ({
          id: folio.id,
          folioNumber: folio.folioNumber,
          status: folio.status,
          balance: money(folio.balance),
          openedAt: folio.openedAt,
          closedAt: folio.closedAt
        })),
        items: folioItems
      };
    });
  }

  private requireProperty(user: UserContext) {
    if (!user.propertyId) {
      throw new BadRequestException("A property context is required.");
    }

    return user.propertyId;
  }
}

function stayNights(arrivalDate: Date, departureDate: Date) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / millisecondsPerDay));
}

function money(value: Prisma.Decimal) {
  return value.toFixed(2);
}
