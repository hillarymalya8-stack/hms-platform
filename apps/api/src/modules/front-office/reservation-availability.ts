import { ReservationStatus } from "@prisma/client";

export const blockingReservationStatuses: ReservationStatus[] = [
  ReservationStatus.TENTATIVE,
  ReservationStatus.CONFIRMED,
  ReservationStatus.CHECKED_IN
];

export function dateRangesOverlap(
  arrivalDate: Date,
  departureDate: Date,
  existingArrivalDate: Date,
  existingDepartureDate: Date
) {
  return arrivalDate < existingDepartureDate && departureDate > existingArrivalDate;
}

export function assertValidStayDates(arrivalDate: Date, departureDate: Date) {
  if (Number.isNaN(arrivalDate.getTime()) || Number.isNaN(departureDate.getTime())) {
    throw new Error("Arrival and departure dates must be valid dates.");
  }

  if (departureDate <= arrivalDate) {
    throw new Error("Departure date must be after arrival date.");
  }
}
