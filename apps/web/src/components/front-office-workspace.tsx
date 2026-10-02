"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BedDouble, CalendarPlus, DoorOpen, Hotel, Pencil, ReceiptText, RefreshCcw, UserPlus } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InvoiceWorkspace } from "@/components/invoice-workspace";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Guest = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
};

type RoomType = {
  id: string;
  code: string;
  name: string;
  baseRate: string;
};

type Room = {
  id: string;
  roomNumber: string;
  occupancyStatus: string;
  housekeepingStatus: string;
  maintenanceStatus?: string;
  roomType: RoomType;
};

type RoomChartRoom = Room & {
  active: boolean;
  floor?: {
    id: string;
    name: string;
  } | null;
  currentStay?: {
    reservationId: string;
    reservationNumber: string;
    status: string;
    arrivalDate: string;
    departureDate: string;
    guest: Guest;
    nightlyRate: string;
    folio?: {
      id: string;
      folioNumber: string;
      status: string;
      balance: string;
      posCharges: string;
      roomCharges: string;
      credits: string;
      recentCharges: Array<{
        id: string;
        itemType: string;
        description: string;
        totalAmount: string;
        postedAt: string;
      }>;
      recentPosOrders: Array<{
        id: string;
        orderNumber: string;
        outletName: string;
        status: string;
        grandTotal: string;
        createdAt: string;
      }>;
    } | null;
  } | null;
};

type Reservation = {
  id: string;
  reservationNumber: string;
  arrivalDate: string;
  departureDate: string;
  status: string;
  primaryGuest: Guest;
  reservationRooms: Array<{
    id: string;
    nightlyRate: string;
    room?: Room | null;
    roomType: RoomType;
  }>;
  folios: Array<{
    id: string;
    folioNumber: string;
    status: string;
    balance: string;
  }>;
};

type SettlementPaymentMethod = "CASH" | "CARD" | "MOBILE_MONEY" | "BANK_TRANSFER";

type SettlementResponse = {
  payment: {
    systemReceiptNumber: string;
    externalReceiptNumber?: string | null;
    paymentMethod: SettlementPaymentMethod;
    paymentProvider?: string | null;
    amount: string;
  };
  folio: {
    folioNumber: string;
    balance: string;
  };
};

const settlementPaymentMethods: Array<{ label: string; value: SettlementPaymentMethod }> = [
  { label: "Cash", value: "CASH" },
  { label: "Card", value: "CARD" },
  { label: "Mobile money", value: "MOBILE_MONEY" },
  { label: "Bank", value: "BANK_TRANSFER" }
];

const bankPaymentProviders = [
  { label: "PayPal", value: "PAYPAL" },
  { label: "Selcom", value: "SELCOM" },
  { label: "CRDB", value: "CRDB" }
];

const mobileMoneyProviders = [
  { label: "M-Pesa", value: "MPESA" },
  { label: "TigoPesa", value: "TIGOPESA" }
];

export function FrontOfficeWorkspace() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomChart, setRoomChart] = useState<RoomChartRoom[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [message, setMessage] = useState("Sign in, then load hotel data.");
  const [busy, setBusy] = useState(false);

  const [guestForm, setGuestForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: ""
  });

  const [reservationForm, setReservationForm] = useState({
    primaryGuestId: "",
    roomTypeId: "",
    roomId: "",
    arrivalDate: dateInputValue(0),
    departureDate: dateInputValue(1),
    nightlyRate: "",
    adults: "1",
    children: "0"
  });

  const [chargeForm, setChargeForm] = useState({
    roomId: "",
    description: "Laundry charge",
    amount: "15.00"
  });
  const [settlementForm, setSettlementForm] = useState({
    reservationId: "",
    amount: "0.00",
    paymentMethod: "CASH" as SettlementPaymentMethod,
    paymentProvider: "",
    externalReceiptNumber: ""
  });
  const [roomEditForm, setRoomEditForm] = useState({
    housekeepingStatus: "CLEAN",
    maintenanceStatus: "AVAILABLE",
    primaryGuestId: "",
    arrivalDate: "",
    departureDate: "",
    nightlyRate: ""
  });

  const selectedRoomType = useMemo(
    () => roomTypes.find((roomType) => roomType.id === reservationForm.roomTypeId),
    [reservationForm.roomTypeId, roomTypes]
  );
  const selectedChartRoom = useMemo(
    () => roomChart.find((room) => room.id === selectedRoomId) ?? null,
    [roomChart, selectedRoomId]
  );
  const selectedStay = selectedChartRoom?.currentStay ?? null;
  const selectedBalance = Number(selectedStay?.folio?.balance ?? 0);
  const settlementProviderOptions = providersForSettlementMethod(settlementForm.paymentMethod);
  const settlementProviderRequired = settlementProviderOptions.length > 0;
  const settlementReceiptRequired = settlementForm.paymentMethod !== "CASH";
  const occupiedRooms = useMemo(() => roomChart.filter((room) => room.occupancyStatus === "OCCUPIED").length, [roomChart]);
  const totalRoomBalance = useMemo(
    () =>
      roomChart.reduce((sum, room) => {
        const balance = Number(room.currentStay?.folio?.balance ?? 0);
        return sum + (Number.isFinite(balance) ? balance : 0);
      }, 0),
    [roomChart]
  );

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!reservationForm.primaryGuestId && guests[0]) {
      setReservationForm((current) => ({ ...current, primaryGuestId: guests[0].id }));
    }

    if (!reservationForm.roomTypeId && roomTypes[0]) {
      setReservationForm((current) => ({ ...current, roomTypeId: roomTypes[0].id, nightlyRate: roomTypes[0].baseRate }));
    }

    if (!reservationForm.roomId && rooms[0]) {
      setReservationForm((current) => ({ ...current, roomId: rooms[0].id }));
    }
  }, [guests, reservationForm.primaryGuestId, reservationForm.roomId, reservationForm.roomTypeId, roomTypes, rooms]);

  useEffect(() => {
    if (!selectedRoomId && roomChart[0]) {
      setSelectedRoomId(roomChart[0].id);
      setChargeForm((current) => ({ ...current, roomId: roomChart[0].id }));
    }
  }, [roomChart, selectedRoomId]);

  useEffect(() => {
    if (!selectedStay) return;

    setSettlementForm((current) => ({
      ...current,
      reservationId: selectedStay.reservationId,
      amount: selectedStay.folio?.balance ?? "0.00"
    }));
  }, [selectedStay?.reservationId, selectedStay?.folio?.balance]);

  useEffect(() => {
    if (!selectedChartRoom) return;

    setRoomEditForm({
      housekeepingStatus: selectedChartRoom.housekeepingStatus,
      maintenanceStatus: selectedChartRoom.maintenanceStatus ?? "AVAILABLE",
      primaryGuestId: selectedChartRoom.currentStay?.guest.id ?? "",
      arrivalDate: selectedChartRoom.currentStay?.arrivalDate.slice(0, 10) ?? "",
      departureDate: selectedChartRoom.currentStay?.departureDate.slice(0, 10) ?? "",
      nightlyRate: selectedChartRoom.currentStay?.nightlyRate ?? selectedChartRoom.roomType.baseRate
    });
  }, [selectedChartRoom]);

  async function loadData() {
    setBusy(true);
    setMessage("Loading hotel records...");

    const [guestResult, roomTypeResult, roomResult, chartResult, reservationResult] = await Promise.all([
      apiRequest<Guest[]>("/front-office/guests"),
      apiRequest<RoomType[]>("/front-office/room-types"),
      apiRequest<Room[]>("/front-office/rooms"),
      apiRequest<RoomChartRoom[]>("/front-office/room-chart"),
      apiRequest<Reservation[]>("/front-office/reservations")
    ]);

    setBusy(false);

    const firstError = [guestResult, roomTypeResult, roomResult, chartResult, reservationResult].find((result) => !result.ok);
    if (firstError && !firstError.ok) {
      setMessage(firstError.error);
      return;
    }

    if (guestResult.ok) setGuests(guestResult.data);
    if (roomTypeResult.ok) setRoomTypes(roomTypeResult.data);
    if (roomResult.ok) setRooms(roomResult.data);
    if (chartResult.ok) setRoomChart(chartResult.data);
    if (reservationResult.ok) setReservations(reservationResult.data);
    setMessage("Hotel records loaded.");
  }

  async function createGuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const firstName = guestForm.firstName.trim();
    const lastName = guestForm.lastName.trim();
    const email = guestForm.email.trim().toLowerCase();

    if (!firstName || !lastName) {
      setMessage("Enter the guest first name and last name.");
      return;
    }

    if (email && guests.some((guest) => guest.email?.toLowerCase() === email)) {
      setMessage(`Guest email ${email} is already registered.`);
      return;
    }

    setBusy(true);
    const result = await apiRequest<Guest>("/front-office/guests", {
      method: "POST",
      body: JSON.stringify({
        firstName,
        lastName,
        email: email || undefined,
        phone: guestForm.phone.trim() || undefined
      })
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setGuestForm({ firstName: "", lastName: "", email: "", phone: "" });
    setMessage(`Guest created: ${result.data.firstName} ${result.data.lastName}`);
    await loadData();
  }

  async function createReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setBusy(true);
    const result = await apiRequest<Reservation>("/front-office/reservations", {
      method: "POST",
      body: JSON.stringify({
        primaryGuestId: reservationForm.primaryGuestId,
        roomTypeId: reservationForm.roomTypeId,
        roomId: reservationForm.roomId || undefined,
        arrivalDate: reservationForm.arrivalDate,
        departureDate: reservationForm.departureDate,
        nightlyRate: reservationForm.nightlyRate,
        adults: Number(reservationForm.adults),
        children: Number(reservationForm.children)
      })
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setMessage(`Reservation created: ${result.data.reservationNumber}`);
    await loadData();
  }

  async function postCharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!chargeForm.roomId) {
      setMessage("Select a checked-in room before posting a charge.");
      return;
    }

    setBusy(true);
    const result = await apiRequest<{ folio: { folioNumber: string; balance: string } }>(`/front-office/rooms/${chargeForm.roomId}/charges`, {
      method: "POST",
      body: JSON.stringify({
        description: chargeForm.description,
        amount: chargeForm.amount
      })
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setMessage(`Charge posted to ${result.data.folio.folioNumber}. Balance ${formatMoney(result.data.folio.balance)}.`);
    await loadData();
  }

  function changeSettlementMethod(paymentMethod: SettlementPaymentMethod) {
    const providerOptions = providersForSettlementMethod(paymentMethod);
    setSettlementForm((current) => ({
      ...current,
      paymentMethod,
      paymentProvider: providerOptions[0]?.value ?? "",
      externalReceiptNumber: paymentMethod === "CASH" ? "" : current.externalReceiptNumber
    }));
  }

  async function settleFolio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedStay) {
      setMessage("Select a checked-in room before recording checkout payment.");
      return;
    }

    const amount = Number(settlementForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Enter a payment amount greater than zero.");
      return;
    }

    if (amount > selectedBalance) {
      setMessage("Payment amount cannot exceed the folio balance.");
      return;
    }

    if (settlementProviderRequired && !settlementForm.paymentProvider) {
      setMessage("Choose the payment provider.");
      return;
    }

    if (settlementReceiptRequired && !settlementForm.externalReceiptNumber.trim()) {
      setMessage("Receipt ID number is required for this payment.");
      return;
    }

    setBusy(true);
    const result = await apiRequest<SettlementResponse>(`/front-office/reservations/${selectedStay.reservationId}/settle`, {
      method: "POST",
      body: JSON.stringify({
        paymentMethod: settlementForm.paymentMethod,
        amount: settlementForm.amount,
        paymentProvider: settlementProviderRequired ? settlementForm.paymentProvider : undefined,
        externalReceiptNumber: settlementForm.externalReceiptNumber.trim() || undefined
      })
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setSettlementForm((current) => ({
      ...current,
      amount: result.data.folio.balance,
      externalReceiptNumber: ""
    }));
    setMessage(
      `Payment ${result.data.payment.systemReceiptNumber} saved to ${result.data.folio.folioNumber}. Balance ${formatMoney(
        result.data.folio.balance
      )}.`
    );
    await loadData();
  }

  async function saveRoomChartEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedChartRoom) {
      setMessage("Select a room before saving chart changes.");
      return;
    }

    const payload: Record<string, string> = {
      housekeepingStatus: roomEditForm.housekeepingStatus,
      maintenanceStatus: roomEditForm.maintenanceStatus
    };

    if (selectedStay) {
      if (!roomEditForm.primaryGuestId || !roomEditForm.arrivalDate || !roomEditForm.departureDate || !roomEditForm.nightlyRate) {
        setMessage("Guest, stay dates, and nightly rate are required for an occupied or reserved room.");
        return;
      }

      payload.primaryGuestId = roomEditForm.primaryGuestId;
      payload.arrivalDate = roomEditForm.arrivalDate;
      payload.departureDate = roomEditForm.departureDate;
      payload.nightlyRate = roomEditForm.nightlyRate;
    }

    setBusy(true);
    const result = await apiRequest<{ roomNumber: string }>(`/front-office/rooms/${selectedChartRoom.id}/chart`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setMessage(`Room ${result.data.roomNumber} updated on the room chart.`);
    await loadData();
  }

  async function transitionReservation(reservationId: string, action: "check-in" | "check-out") {
    setBusy(true);
    const result = await apiRequest<Reservation>(`/front-office/reservations/${reservationId}/${action}`, {
      method: "POST"
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setMessage(`${result.data.reservationNumber} moved to ${result.data.status}.`);
    await loadData();
  }

  function chooseRoom(room: RoomChartRoom) {
    setSelectedRoomId(room.id);
    setChargeForm((current) => ({ ...current, roomId: room.id }));
    setReservationForm((current) => ({
      ...current,
      roomId: room.id,
      roomTypeId: room.roomType.id,
      nightlyRate: room.roomType.baseRate
    }));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold">Front Office Work Surface</h3>
          <p className="text-sm text-muted-foreground">Room chart, guests, reservations, check-in, check-out, and guest folios.</p>
        </div>
        <Button type="button" variant="secondary" onClick={loadData} disabled={busy}>
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          Load data
        </Button>
      </div>

      <p className="rounded border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">{message}</p>

      <div className="rounded border border-border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Hotel className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Room Chart</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>{roomChart.length} rooms</Badge>
            <Badge tone="primary">{occupiedRooms} occupied</Badge>
            <Badge tone={totalRoomBalance > 0 ? "warning" : "success"}>{formatMoney(totalRoomBalance)} owed</Badge>
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {roomChart.length === 0 ? (
            <div className="col-span-full rounded border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
              No rooms loaded yet.
            </div>
          ) : (
            roomChart.map((room) => (
              <button
                key={room.id}
                type="button"
                className={cn(
                  "min-h-[152px] rounded border bg-background p-3 text-left transition-colors hover:border-primary",
                  selectedRoomId === room.id ? "border-primary ring-2 ring-primary/20" : "border-border"
                )}
                onClick={() => chooseRoom(room)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold">Room {room.roomNumber}</p>
                    <p className="text-xs text-muted-foreground">{room.roomType.name}</p>
                  </div>
                  <Badge tone={roomBadgeTone(room)}>{roomStatusLabel(room)}</Badge>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  {room.currentStay ? (
                    <>
                      <p className="font-semibold">
                        {room.currentStay.guest.firstName} {room.currentStay.guest.lastName}
                      </p>
                      <p className="text-muted-foreground">
                        {formatDate(room.currentStay.arrivalDate)} to {formatDate(room.currentStay.departureDate)}
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <span className="rounded bg-muted px-2 py-1">POS {formatMoney(room.currentStay.folio?.posCharges ?? "0")}</span>
                        <span className="rounded bg-muted px-2 py-1">Balance {formatMoney(room.currentStay.folio?.balance ?? "0")}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold">No active guest</p>
                      <p className="text-muted-foreground">{room.housekeepingStatus.toLowerCase().replaceAll("_", " ")}</p>
                    </>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <InvoiceWorkspace />

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <form onSubmit={createGuest} className="rounded border border-border bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" aria-hidden="true" />
              <h4 className="font-bold">New Guest</h4>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                aria-label="First name"
                value={guestForm.firstName}
                onChange={(event) => setGuestForm({ ...guestForm, firstName: event.target.value })}
                placeholder="First name"
              />
              <Input
                aria-label="Last name"
                value={guestForm.lastName}
                onChange={(event) => setGuestForm({ ...guestForm, lastName: event.target.value })}
                placeholder="Last name"
              />
              <Input
                aria-label="Email"
                value={guestForm.email}
                onChange={(event) => setGuestForm({ ...guestForm, email: event.target.value })}
                placeholder="Email"
                type="email"
              />
              <Input
                aria-label="Phone"
                value={guestForm.phone}
                onChange={(event) => setGuestForm({ ...guestForm, phone: event.target.value })}
                placeholder="Phone"
              />
            </div>
            <Button className="mt-3" disabled={busy}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Add guest
            </Button>
          </form>

          <form onSubmit={createReservation} className="rounded border border-border bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <CalendarPlus className="h-4 w-4 text-primary" aria-hidden="true" />
              <h4 className="font-bold">New Reservation</h4>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                aria-label="Guest"
                className="h-10 rounded border border-border bg-white px-3 text-sm"
                value={reservationForm.primaryGuestId}
                onChange={(event) => setReservationForm({ ...reservationForm, primaryGuestId: event.target.value })}
              >
                <option value="">Select guest</option>
                {guests.map((guest) => (
                  <option key={guest.id} value={guest.id}>
                    {guest.firstName} {guest.lastName}
                  </option>
                ))}
              </select>
              <select
                aria-label="Room type"
                className="h-10 rounded border border-border bg-white px-3 text-sm"
                value={reservationForm.roomTypeId}
                onChange={(event) => {
                  const roomType = roomTypes.find((item) => item.id === event.target.value);
                  setReservationForm({
                    ...reservationForm,
                    roomTypeId: event.target.value,
                    nightlyRate: roomType?.baseRate ?? reservationForm.nightlyRate
                  });
                }}
              >
                <option value="">Select room type</option>
                {roomTypes.map((roomType) => (
                  <option key={roomType.id} value={roomType.id}>
                    {roomType.code} - {roomType.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Room"
                className="h-10 rounded border border-border bg-white px-3 text-sm"
                value={reservationForm.roomId}
                onChange={(event) => {
                  const room = roomChart.find((entry) => entry.id === event.target.value);
                  if (room) chooseRoom(room);
                  else setReservationForm({ ...reservationForm, roomId: event.target.value });
                }}
              >
                <option value="">Assign later</option>
                {rooms
                  .filter((room) => !selectedRoomType || room.roomType.id === selectedRoomType.id)
                  .map((room) => (
                    <option key={room.id} value={room.id}>
                      Room {room.roomNumber} - {room.occupancyStatus}
                    </option>
                  ))}
              </select>
              <Input
                aria-label="Nightly rate"
                value={reservationForm.nightlyRate}
                onChange={(event) => setReservationForm({ ...reservationForm, nightlyRate: event.target.value })}
                placeholder="Nightly rate"
              />
              <Input
                aria-label="Arrival date"
                type="date"
                value={reservationForm.arrivalDate}
                onChange={(event) => setReservationForm({ ...reservationForm, arrivalDate: event.target.value })}
              />
              <Input
                aria-label="Departure date"
                type="date"
                value={reservationForm.departureDate}
                onChange={(event) => setReservationForm({ ...reservationForm, departureDate: event.target.value })}
              />
            </div>
            <Button className="mt-3" disabled={busy || !reservationForm.primaryGuestId || !reservationForm.roomTypeId}>
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              Create reservation
            </Button>
          </form>
        </div>

        <div className="space-y-4">
          <div className="rounded border border-border bg-white">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <ReceiptText className="h-4 w-4 text-primary" aria-hidden="true" />
                <h4 className="font-bold">Selected Room</h4>
              </div>
              {selectedChartRoom ? <Badge tone={roomBadgeTone(selectedChartRoom)}>Room {selectedChartRoom.roomNumber}</Badge> : null}
            </div>
            <div className="p-4">
              {!selectedChartRoom ? (
                <p className="text-sm text-muted-foreground">No room selected.</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <RoomFact label="Type" value={selectedChartRoom.roomType.name} />
                    <RoomFact label="Status" value={roomStatusLabel(selectedChartRoom)} />
                    <RoomFact label="Rate" value={formatMoney(selectedChartRoom.roomType.baseRate)} />
                  </div>
                  <form onSubmit={saveRoomChartEdit} className="rounded border border-border bg-background p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <Pencil className="h-4 w-4 text-primary" aria-hidden="true" />
                      <h5 className="font-bold">Edit Room Chart</h5>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium">Housekeeping</span>
                        <select
                          aria-label="Housekeeping status"
                          className="h-10 w-full rounded border border-border bg-white px-3 text-sm"
                          value={roomEditForm.housekeepingStatus}
                          onChange={(event) => setRoomEditForm({ ...roomEditForm, housekeepingStatus: event.target.value })}
                        >
                          <option value="CLEAN">Clean</option>
                          <option value="DIRTY">Dirty</option>
                          <option value="INSPECTED">Inspected</option>
                        </select>
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium">Maintenance</span>
                        <select
                          aria-label="Maintenance status"
                          className="h-10 w-full rounded border border-border bg-white px-3 text-sm"
                          value={roomEditForm.maintenanceStatus}
                          onChange={(event) => setRoomEditForm({ ...roomEditForm, maintenanceStatus: event.target.value })}
                        >
                          <option value="AVAILABLE">Available</option>
                          <option value="OUT_OF_SERVICE">Out of service</option>
                          <option value="OUT_OF_ORDER">Out of order</option>
                        </select>
                      </label>
                      {selectedChartRoom.currentStay ? (
                        <>
                          <label className="block space-y-1.5 sm:col-span-2">
                            <span className="text-sm font-medium">Guest</span>
                            <select
                              aria-label="Current stay guest"
                              className="h-10 w-full rounded border border-border bg-white px-3 text-sm"
                              value={roomEditForm.primaryGuestId}
                              onChange={(event) => setRoomEditForm({ ...roomEditForm, primaryGuestId: event.target.value })}
                            >
                              <option value="">Select guest</option>
                              {guests.map((guest) => (
                                <option key={guest.id} value={guest.id}>
                                  {guest.firstName} {guest.lastName}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block space-y-1.5">
                            <span className="text-sm font-medium">Arrival</span>
                            <Input
                              aria-label="Edit arrival date"
                              type="date"
                              value={roomEditForm.arrivalDate}
                              onChange={(event) => setRoomEditForm({ ...roomEditForm, arrivalDate: event.target.value })}
                            />
                          </label>
                          <label className="block space-y-1.5">
                            <span className="text-sm font-medium">Departure</span>
                            <Input
                              aria-label="Edit departure date"
                              type="date"
                              value={roomEditForm.departureDate}
                              onChange={(event) => setRoomEditForm({ ...roomEditForm, departureDate: event.target.value })}
                            />
                          </label>
                          <label className="block space-y-1.5 sm:col-span-2">
                            <span className="text-sm font-medium">Nightly rate</span>
                            <Input
                              aria-label="Edit nightly rate"
                              value={roomEditForm.nightlyRate}
                              onChange={(event) => setRoomEditForm({ ...roomEditForm, nightlyRate: event.target.value })}
                              placeholder="Nightly rate"
                            />
                          </label>
                        </>
                      ) : null}
                    </div>
                    <Button className="mt-3" disabled={busy || !selectedChartRoom}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      Save room chart
                    </Button>
                  </form>
                  {selectedChartRoom.currentStay ? (
                    <>
                      <div className="rounded border border-border bg-muted/40 p-3">
                        <p className="font-bold">
                          {selectedChartRoom.currentStay.guest.firstName} {selectedChartRoom.currentStay.guest.lastName}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {selectedChartRoom.currentStay.reservationNumber} - {formatDate(selectedChartRoom.currentStay.arrivalDate)} to{" "}
                          {formatDate(selectedChartRoom.currentStay.departureDate)}
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <RoomFact label="Room/postings" value={formatMoney(selectedChartRoom.currentStay.folio?.roomCharges ?? "0")} />
                        <RoomFact label="POS charges" value={formatMoney(selectedChartRoom.currentStay.folio?.posCharges ?? "0")} />
                        <RoomFact label="Balance" value={formatMoney(selectedChartRoom.currentStay.folio?.balance ?? "0")} />
                      </div>
                      <form onSubmit={settleFolio} className="rounded border border-border bg-background p-3">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h5 className="font-bold">Checkout Payment</h5>
                          <Badge tone={selectedBalance > 0 ? "warning" : "success"}>
                            {selectedBalance > 0 ? formatMoney(selectedBalance) : "Settled"}
                          </Badge>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block space-y-1.5">
                            <span className="text-sm font-medium">Payment method</span>
                            <select
                              aria-label="Payment method"
                              className="h-10 w-full rounded border border-border bg-white px-3 text-sm"
                              value={settlementForm.paymentMethod}
                              onChange={(event) => changeSettlementMethod(event.target.value as SettlementPaymentMethod)}
                            >
                              {settlementPaymentMethods.map((method) => (
                                <option key={method.value} value={method.value}>
                                  {method.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block space-y-1.5">
                            <span className="text-sm font-medium">Amount</span>
                            <Input
                              aria-label="Payment amount"
                              value={settlementForm.amount}
                              onChange={(event) => setSettlementForm({ ...settlementForm, amount: event.target.value })}
                              placeholder="Amount"
                            />
                          </label>
                          {settlementProviderRequired ? (
                            <label className="block space-y-1.5">
                              <span className="text-sm font-medium">
                                {settlementForm.paymentMethod === "MOBILE_MONEY" ? "Mobile service" : "Bank provider"}
                              </span>
                              <select
                                aria-label="Payment provider"
                                className="h-10 w-full rounded border border-border bg-white px-3 text-sm"
                                value={settlementForm.paymentProvider}
                                onChange={(event) => setSettlementForm({ ...settlementForm, paymentProvider: event.target.value })}
                              >
                                {settlementProviderOptions.map((provider) => (
                                  <option key={provider.value} value={provider.value}>
                                    {provider.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          {settlementReceiptRequired ? (
                            <label className="block space-y-1.5">
                              <span className="text-sm font-medium">Receipt ID number</span>
                              <Input
                                aria-label="Receipt ID number"
                                value={settlementForm.externalReceiptNumber}
                                onChange={(event) =>
                                  setSettlementForm({ ...settlementForm, externalReceiptNumber: event.target.value })
                                }
                                placeholder="Receipt ID"
                              />
                            </label>
                          ) : null}
                        </div>
                        <Button className="mt-3" disabled={busy || !selectedChartRoom.currentStay || selectedBalance <= 0}>
                          <ReceiptText className="h-4 w-4" aria-hidden="true" />
                          Record payment
                        </Button>
                      </form>
                      <form onSubmit={postCharge} className="rounded border border-border bg-background p-3">
                        <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
                          <Input
                            aria-label="Charge description"
                            value={chargeForm.description}
                            onChange={(event) => setChargeForm({ ...chargeForm, description: event.target.value })}
                            placeholder="Charge description"
                          />
                          <Input
                            aria-label="Charge amount"
                            value={chargeForm.amount}
                            onChange={(event) => setChargeForm({ ...chargeForm, amount: event.target.value })}
                            placeholder="Amount"
                          />
                        </div>
                        <Button className="mt-3" disabled={busy || !selectedChartRoom.currentStay}>
                          <ReceiptText className="h-4 w-4" aria-hidden="true" />
                          Post charge
                        </Button>
                      </form>
                      <div className="divide-y divide-border rounded border border-border">
                        {(selectedChartRoom.currentStay.folio?.recentCharges ?? []).length === 0 ? (
                          <p className="px-3 py-4 text-sm text-muted-foreground">No folio charges yet.</p>
                        ) : (
                          selectedChartRoom.currentStay.folio?.recentCharges.map((charge) => (
                            <div key={charge.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                              <div>
                                <p className="font-semibold">{charge.description}</p>
                                <p className="text-xs text-muted-foreground">{charge.itemType.replaceAll("_", " ").toLowerCase()}</p>
                              </div>
                              <span className="font-bold tabular-nums">{formatMoney(charge.totalAmount)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="rounded border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                      No checked-in guest is attached to this room.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="rounded border border-border bg-white">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <BedDouble className="h-4 w-4 text-primary" aria-hidden="true" />
                <h4 className="font-bold">Reservations</h4>
              </div>
              <Badge>{reservations.length} records</Badge>
            </div>
            <div className="divide-y divide-border">
              {reservations.length === 0 ? (
                <div className="px-4 py-8 text-sm text-muted-foreground">No reservations loaded yet.</div>
              ) : (
                reservations.map((reservation) => {
                  const assigned = reservation.reservationRooms[0];
                  return (
                    <div key={reservation.id} className="px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-bold">{reservation.reservationNumber}</p>
                          <p className="text-sm text-muted-foreground">
                            {reservation.primaryGuest.firstName} {reservation.primaryGuest.lastName}
                          </p>
                          <p className="mt-1 text-sm">
                            {formatDate(reservation.arrivalDate)} to {formatDate(reservation.departureDate)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {assigned?.room ? `Room ${assigned.room.roomNumber}` : "Room not assigned"} - {assigned?.roomType.name}
                          </p>
                        </div>
                        <Badge tone={reservation.status === "CHECKED_IN" ? "success" : "neutral"}>{reservation.status}</Badge>
                      </div>
                      {reservation.folios[0] ? (
                        <p className="mt-3 rounded bg-background/80 px-3 py-2 text-sm">
                          Folio {reservation.folios[0].folioNumber} - Balance {formatMoney(reservation.folios[0].balance)}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy || reservation.status !== "CONFIRMED"}
                          onClick={() => transitionReservation(reservation.id, "check-in")}
                        >
                          <DoorOpen className="h-4 w-4" aria-hidden="true" />
                          Check in
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy || reservation.status !== "CHECKED_IN"}
                          onClick={() => transitionReservation(reservation.id, "check-out")}
                        >
                          Check out
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoomFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-background px-3 py-2">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}

function roomBadgeTone(room: RoomChartRoom) {
  if (room.maintenanceStatus && room.maintenanceStatus !== "AVAILABLE") return "danger";
  if (room.occupancyStatus === "OCCUPIED") return "primary";
  if (room.occupancyStatus === "RESERVED") return "warning";
  if (room.housekeepingStatus === "DIRTY") return "neutral";
  return "success";
}

function roomStatusLabel(room: RoomChartRoom) {
  if (room.maintenanceStatus && room.maintenanceStatus !== "AVAILABLE") {
    return room.maintenanceStatus.toLowerCase().replaceAll("_", " ");
  }

  if (room.occupancyStatus === "AVAILABLE" && room.housekeepingStatus === "DIRTY") {
    return "dirty";
  }

  return room.occupancyStatus.toLowerCase().replaceAll("_", " ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function providersForSettlementMethod(method: SettlementPaymentMethod) {
  if (method === "BANK_TRANSFER") return bankPaymentProviders;
  if (method === "MOBILE_MONEY") return mobileMoneyProviders;
  return [];
}

function dateInputValue(daysFromToday: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function formatMoney(value: string | number) {
  const amount = typeof value === "number" ? value : Number(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2
  }).format(Number.isFinite(amount) ? amount : 0);
}
