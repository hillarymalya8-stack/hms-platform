"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { BedDouble, CalendarPlus, DoorOpen, Hotel, Pencil, ReceiptText, RefreshCcw, UserPlus } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { currencyLabel, formatCurrency, saleCurrencies, type SaleCurrency } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InvoiceWorkspace } from "@/components/invoice-workspace";
import { FrontOfficeDayExpenses } from "@/components/front-office-day-expenses";
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
  // TSh rate; baseRateUsd is null when the room type has no USD rate.
  baseRate: string;
  baseRateUsd?: string | null;
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
    currencyCode?: SaleCurrency;
    mealPlan?: MealPlan | null;
    companyName?: string | null;
    prepaidAmount?: string;
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
  mealPlan?: MealPlan | null;
  companyName?: string | null;
  depositPaid?: string;
  reservationRooms: Array<{
    id: string;
    nightlyRate: string;
    currencyCode?: SaleCurrency;
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

type MealPlan = "FULL_BOARD" | "HALF_BOARD" | "BED_AND_BREAKFAST";

const mealPlans: Array<{ label: string; value: MealPlan; detail: string }> = [
  { label: "Full board", value: "FULL_BOARD", detail: "Room, breakfast, lunch and dinner" },
  { label: "Half board", value: "HALF_BOARD", detail: "Room, breakfast and one main meal" },
  { label: "Bed & breakfast", value: "BED_AND_BREAKFAST", detail: "Room and breakfast" }
];

type CheckInTarget = {
  reservationId: string;
  reservationNumber: string;
  guestName: string;
  currencyCode: SaleCurrency;
};

type ExtendTarget = {
  reservationId: string;
  reservationNumber: string;
  guestName: string;
  departureDate: string;
  nightlyRate: string;
  roomCount: number;
  currencyCode: SaleCurrency;
};

const emptyCheckInForm = {
  prepaid: false,
  mealPlan: "FULL_BOARD" as MealPlan,
  companyName: "",
  prepaidAmount: "",
  paymentReference: ""
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
  const reservationSection = useRef<HTMLFormElement>(null);
  const roomSection = useRef<HTMLDivElement>(null);
  const invoiceSection = useRef<HTMLElement>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<{ id: string; number: string } | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomChart, setRoomChart] = useState<RoomChartRoom[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [message, setMessage] = useState("Sign in, then load hotel data.");
  const [busy, setBusy] = useState(false);
  const [showReservation, setShowReservation] = useState(false);
  const [guestMode, setGuestMode] = useState<"new" | "existing">("new");
  // Shown inside the reservation form: the page status line sits above the room chart, off-screen while booking.
  const [reservationError, setReservationError] = useState("");
  const [invoiceTarget, setInvoiceTarget] = useState<{ id: string; number: string } | null>(null);
  const [checkInTarget, setCheckInTarget] = useState<CheckInTarget | null>(null);
  const [checkInForm, setCheckInForm] = useState(emptyCheckInForm);
  const [extendTarget, setExtendTarget] = useState<ExtendTarget | null>(null);
  const [extendForm, setExtendForm] = useState({ nights: "1", nightlyRate: "" });

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
    currencyCode: "TZS" as SaleCurrency,
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

  useEffect(() => {
    if (invoiceTarget) invoiceSection.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    else if (showReservation) reservationSection.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    else if (selectedRoomId) roomSection.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [invoiceTarget, showReservation, selectedRoomId]);

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
  const occupiedRooms = useMemo(
    () => roomChart.filter((room) => room.occupancyStatus === "OCCUPIED").length,
    [roomChart]
  );
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
    if (!reservationForm.roomTypeId && roomTypes[0]) {
      setReservationForm((current) => ({
        ...current,
        roomTypeId: roomTypes[0].id,
        nightlyRate: rateFor(roomTypes[0], current.currencyCode)
      }));
    }
  }, [reservationForm.roomTypeId, roomTypes]);

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

    const firstError = [guestResult, roomTypeResult, roomResult, chartResult, reservationResult].find(
      (result) => !result.ok
    );
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

  function failReservation(text: string) {
    setReservationError(text);
    setMessage(text);
  }

  async function createReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setReservationError("");

    if (!reservationForm.nightlyRate.trim()) {
      failReservation(
        `Enter a ${currencyLabel(reservationForm.currencyCode)} nightly rate, or set one for this room type in Admin.`
      );
      return;
    }

    if (
      !reservationForm.roomTypeId ||
      !reservationForm.arrivalDate ||
      !reservationForm.departureDate ||
      reservationForm.departureDate <= reservationForm.arrivalDate ||
      !Number.isFinite(Number(reservationForm.nightlyRate)) ||
      Number(reservationForm.nightlyRate) < 0
    ) {
      failReservation("Choose a room type, valid stay dates, and a valid nightly rate.");
      return;
    }
    let primaryGuestId = reservationForm.primaryGuestId;
    if (guestMode === "new" && (!guestForm.firstName.trim() || !guestForm.lastName.trim())) {
      failReservation("Enter the guest first name and last name.");
      return;
    }
    if (guestMode === "existing" && !primaryGuestId) {
      failReservation("Select an existing guest.");
      return;
    }
    setBusy(true);
    if (guestMode === "new") {
      const guestResult = await apiRequest<Guest>("/front-office/guests", {
        method: "POST",
        body: JSON.stringify({
          firstName: guestForm.firstName.trim(),
          lastName: guestForm.lastName.trim(),
          email: guestForm.email.trim() || undefined,
          phone: guestForm.phone.trim() || undefined
        })
      });
      if (!guestResult.ok) {
        setBusy(false);
        failReservation(guestResult.error);
        return;
      }
      primaryGuestId = guestResult.data.id;
      setGuests((current) => [...current, guestResult.data]);
      setReservationForm((current) => ({ ...current, primaryGuestId }));
      setGuestMode("existing");
      setGuestForm({ firstName: "", lastName: "", email: "", phone: "" });
    }
    const result = await apiRequest<Reservation>("/front-office/reservations", {
      method: "POST",
      body: JSON.stringify({
        primaryGuestId,
        roomTypeId: reservationForm.roomTypeId,
        roomId: reservationForm.roomId || undefined,
        arrivalDate: reservationForm.arrivalDate,
        departureDate: reservationForm.departureDate,
        nightlyRate: reservationForm.nightlyRate,
        currencyCode: reservationForm.currencyCode,
        adults: Number(reservationForm.adults),
        children: Number(reservationForm.children)
      })
    });
    setBusy(false);

    if (!result.ok) {
      failReservation(result.error);
      return;
    }

    setShowReservation(false);
    if (reservationForm.roomId) setSelectedRoomId(reservationForm.roomId);
    await loadData();
    setMessage(`Reservation created: ${result.data.reservationNumber}. Use Check in when the guest arrives.`);
  }

  async function postCharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!chargeForm.roomId) {
      setMessage("Select a checked-in room before posting a charge.");
      return;
    }

    setBusy(true);
    const result = await apiRequest<{ folio: { folioNumber: string; balance: string } }>(
      `/front-office/rooms/${chargeForm.roomId}/charges`,
      {
        method: "POST",
        body: JSON.stringify({
          description: chargeForm.description,
          amount: chargeForm.amount
        })
      }
    );
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
    const result = await apiRequest<SettlementResponse>(
      `/front-office/reservations/${selectedStay.reservationId}/settle`,
      {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: settlementForm.paymentMethod,
          amount: settlementForm.amount,
          paymentProvider: settlementProviderRequired ? settlementForm.paymentProvider : undefined,
          externalReceiptNumber: settlementForm.externalReceiptNumber.trim() || undefined
        })
      }
    );
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
      if (
        !roomEditForm.primaryGuestId ||
        !roomEditForm.arrivalDate ||
        !roomEditForm.departureDate ||
        !roomEditForm.nightlyRate
      ) {
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

  function openCheckIn(target: CheckInTarget) {
    setCheckInTarget(target);
    setCheckInForm(emptyCheckInForm);
  }

  async function submitCheckIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checkInTarget || busy) return;

    let body: Record<string, string> = {};
    if (checkInForm.prepaid) {
      const amount = Number(checkInForm.prepaidAmount);
      if (!checkInForm.prepaidAmount.trim() || !Number.isFinite(amount) || amount <= 0) {
        setMessage("Enter the total amount already paid for this booking.");
        return;
      }
      body = {
        mealPlan: checkInForm.mealPlan,
        prepaidAmount: checkInForm.prepaidAmount.trim(),
        ...(checkInForm.companyName.trim() ? { companyName: checkInForm.companyName.trim() } : {}),
        ...(checkInForm.paymentReference.trim() ? { paymentReference: checkInForm.paymentReference.trim() } : {})
      };
    }

    const ok = await transitionReservation(checkInTarget.reservationId, "check-in", body);
    if (ok) setCheckInTarget(null);
  }

  function openExtend(target: ExtendTarget) {
    setExtendTarget(target);
    setExtendForm({ nights: "1", nightlyRate: target.nightlyRate });
  }

  async function submitExtend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!extendTarget || busy) return;

    const nights = Number(extendForm.nights);
    if (!Number.isInteger(nights) || nights < 1 || nights > 365) {
      setMessage("Enter how many extra nights the guest is staying (1 to 365).");
      return;
    }
    const rate = extendForm.nightlyRate.trim();
    if (!rate || !Number.isFinite(Number(rate)) || Number(rate) < 0) {
      setMessage("Enter a valid nightly rate for the extra nights.");
      return;
    }

    setBusy(true);
    const result = await apiRequest<{
      reservationNumber: string;
      departureDate: string;
      extensionCharge: string;
      folioBalance: string;
    }>(`/front-office/reservations/${extendTarget.reservationId}/extend`, {
      method: "POST",
      body: JSON.stringify({ nights, nightlyRate: rate })
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    const currency = extendTarget.currencyCode;
    setExtendTarget(null);
    await loadData();
    setMessage(
      `${result.data.reservationNumber} extended by ${nights} night${nights === 1 ? "" : "s"} to ${formatDate(
        result.data.departureDate
      )}. ${formatCurrency(result.data.extensionCharge, currency)} added to the folio (balance ${formatCurrency(
        result.data.folioBalance,
        currency
      )}).`
    );
  }

  async function transitionReservation(
    reservationId: string,
    action: "check-in" | "check-out",
    body?: Record<string, string>
  ) {
    setBusy(true);
    const result = await apiRequest<Reservation>(`/front-office/reservations/${reservationId}/${action}`, {
      method: "POST",
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return false;
    }

    if (action === "check-out") setCheckoutTarget({ id: reservationId, number: result.data.reservationNumber });
    await loadData();
    setMessage(
      `${result.data.reservationNumber} moved to ${result.data.status}. Use Make invoice when you need an invoice.`
    );
    return true;
  }

  function chooseRoom(room: RoomChartRoom) {
    setSelectedRoomId(room.id);
    setChargeForm((current) => ({ ...current, roomId: room.id }));
    setReservationForm((current) => ({
      ...current,
      roomId: room.id,
      roomTypeId: room.roomType.id,
      nightlyRate: rateFor(room.roomType, current.currencyCode)
    }));
  }

  function openReservation(room?: RoomChartRoom) {
    if (room) chooseRoom(room);
    else setReservationForm((current) => ({ ...current, roomId: "" }));
    setGuestMode("new");
    setGuestForm({ firstName: "", lastName: "", email: "", phone: "" });
    setReservationForm((current) => ({
      ...current,
      primaryGuestId: "",
      arrivalDate: dateInputValue(0),
      departureDate: dateInputValue(1)
    }));
    setReservationError("");
    setShowReservation(true);
    setInvoiceTarget(null);
  }

  function changeReservationCurrency(currencyCode: SaleCurrency) {
    const roomType = roomTypes.find((item) => item.id === reservationForm.roomTypeId);
    const nightlyRate = roomType ? rateFor(roomType, currencyCode) : "";
    setReservationForm({ ...reservationForm, currencyCode, nightlyRate });
    if (roomType && !nightlyRate) {
      setMessage(
        `${roomType.name} has no ${currencyLabel(currencyCode)} rate yet. Enter one manually or set it in Admin.`
      );
    }
  }

  return (
    <div className="space-y-5">
      {checkInTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="check-in-title"
        >
          <form
            onSubmit={submitCheckIn}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded border border-border bg-white p-5 shadow-lg"
          >
            <div className="mb-4 flex items-center gap-2">
              <DoorOpen className="h-5 w-5 text-primary" aria-hidden="true" />
              <div>
                <h4 id="check-in-title" className="font-bold">
                  Check in {checkInTarget.guestName}
                </h4>
                <p className="text-sm text-muted-foreground">{checkInTarget.reservationNumber}</p>
              </div>
            </div>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Has this booking already been paid?</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="prepaid"
                  checked={!checkInForm.prepaid}
                  onChange={() => setCheckInForm({ ...checkInForm, prepaid: false })}
                />
                No - guest pays at checkout
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="prepaid"
                  checked={checkInForm.prepaid}
                  onChange={() => setCheckInForm({ ...checkInForm, prepaid: true })}
                />
                Yes - paid before arrival (company or guest)
              </label>
            </fieldset>
            {checkInForm.prepaid ? (
              <div className="mt-4 space-y-3">
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">What was paid for?</legend>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {mealPlans.map((plan) => (
                      <label
                        key={plan.value}
                        className={cn(
                          "cursor-pointer rounded border p-2 text-sm",
                          checkInForm.mealPlan === plan.value ? "border-primary bg-primary/5" : "border-border"
                        )}
                      >
                        <input
                          type="radio"
                          name="mealPlan"
                          className="sr-only"
                          checked={checkInForm.mealPlan === plan.value}
                          onChange={() => setCheckInForm({ ...checkInForm, mealPlan: plan.value })}
                        />
                        <span className="block font-semibold">{plan.label}</span>
                        <span className="block text-xs text-muted-foreground">{plan.detail}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">Company name</span>
                  <Input
                    aria-label="Company name"
                    value={checkInForm.companyName}
                    onChange={(event) => setCheckInForm({ ...checkInForm, companyName: event.target.value })}
                    placeholder="Leave empty if the guest paid personally"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">
                    Total amount paid ({currencyLabel(checkInTarget.currencyCode)})
                  </span>
                  <Input
                    aria-label="Total amount paid"
                    inputMode="decimal"
                    value={checkInForm.prepaidAmount}
                    onChange={(event) => setCheckInForm({ ...checkInForm, prepaidAmount: event.target.value })}
                    placeholder="0"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">Payment reference (optional)</span>
                  <Input
                    aria-label="Payment reference"
                    value={checkInForm.paymentReference}
                    onChange={(event) => setCheckInForm({ ...checkInForm, paymentReference: event.target.value })}
                    placeholder="Voucher, LPO or bank reference"
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  The amount is credited to the guest folio. If the guest spends more than this, the remaining balance
                  must be paid at checkout.
                </p>
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setCheckInTarget(null)} disabled={busy}>
                Cancel
              </Button>
              <Button disabled={busy}>
                <DoorOpen className="h-4 w-4" aria-hidden="true" />
                Check in
              </Button>
            </div>
          </form>
        </div>
      ) : null}
      {extendTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="extend-stay-title"
        >
          <form
            onSubmit={submitExtend}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded border border-border bg-white p-5 shadow-lg"
          >
            <div className="mb-4 flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-primary" aria-hidden="true" />
              <div>
                <h4 id="extend-stay-title" className="font-bold">
                  Extend stay - {extendTarget.guestName}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {extendTarget.reservationNumber} - currently departing {formatDate(extendTarget.departureDate)}
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Extra nights</span>
                <Input
                  aria-label="Extra nights"
                  type="number"
                  min={1}
                  max={365}
                  step={1}
                  value={extendForm.nights}
                  onChange={(event) => setExtendForm({ ...extendForm, nights: event.target.value })}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">
                  Nightly rate ({currencyLabel(extendTarget.currencyCode)})
                </span>
                <Input
                  aria-label="Nightly rate for extra nights"
                  inputMode="decimal"
                  value={extendForm.nightlyRate}
                  onChange={(event) => setExtendForm({ ...extendForm, nightlyRate: event.target.value })}
                />
              </label>
            </div>
            {(() => {
              const nights = Number(extendForm.nights);
              const rate = Number(extendForm.nightlyRate);
              if (!Number.isInteger(nights) || nights < 1 || !Number.isFinite(rate)) return null;
              const newDeparture = addDays(extendTarget.departureDate, nights);
              return (
                <div className="mt-4 rounded border border-primary/40 bg-primary/5 p-3 text-sm">
                  <p>
                    New departure: <span className="font-semibold">{formatDate(newDeparture)}</span>
                  </p>
                  <p className="mt-1">
                    Added to folio:{" "}
                    <span className="font-semibold">
                      {formatCurrency(rate * nights * extendTarget.roomCount, extendTarget.currencyCode)}
                    </span>
                  </p>
                </div>
              );
            })()}
            <p className="mt-3 text-xs text-muted-foreground">
              The extra nights are charged to the guest folio. Any prepaid credit is used first; anything above it is
              paid at checkout.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setExtendTarget(null)} disabled={busy}>
                Cancel
              </Button>
              <Button disabled={busy}>
                <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                Extend stay
              </Button>
            </div>
          </form>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold">Front Office</h3>
          <p className="text-sm text-muted-foreground">Select a room to assign a guest, check in, or check out.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => openReservation()} disabled={busy}>
            <CalendarPlus className="h-4 w-4" />
            New Reservation
          </Button>
          <Button type="button" variant="secondary" onClick={loadData} disabled={busy}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </div>

      <p
        role="status"
        aria-live="polite"
        className="rounded border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground"
      >
        {message}
      </p>

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
                disabled={busy}
                aria-pressed={selectedRoomId === room.id}
                onClick={() => {
                  chooseRoom(room);
                  setShowReservation(false);
                  setInvoiceTarget(null);
                }}
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
                        <span className="rounded bg-muted px-2 py-1">
                          POS {formatMoney(room.currentStay.folio?.posCharges ?? "0")}
                        </span>
                        <span className="rounded bg-muted px-2 py-1">
                          Balance {formatMoney(room.currentStay.folio?.balance ?? "0")}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold">No active guest</p>
                      <p className="text-muted-foreground">
                        {room.housekeepingStatus.toLowerCase().replaceAll("_", " ")}
                      </p>
                    </>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <FrontOfficeDayExpenses />

      {checkoutTarget ? (
        <div className="flex flex-wrap items-center gap-3 rounded border border-border bg-white p-3">
          <p className="text-sm">Checkout complete: {checkoutTarget.number}</p>
          <Button type="button" variant="secondary" onClick={() => setInvoiceTarget(checkoutTarget)}>
            Make invoice
          </Button>
          <Button type="button" variant="ghost" onClick={() => setCheckoutTarget(null)}>
            Dismiss
          </Button>
        </div>
      ) : null}
      {invoiceTarget ? (
        <section ref={invoiceSection} aria-label="Make invoice" className="space-y-2">
          <Button type="button" variant="secondary" onClick={() => setInvoiceTarget(null)}>
            Close invoice
          </Button>
          <InvoiceWorkspace
            key={invoiceTarget.id}
            initialQuery={invoiceTarget.number}
            initialReservationId={invoiceTarget.id}
          />
        </section>
      ) : null}

      <div className={cn("grid gap-5", showReservation && "xl:grid-cols-[0.95fr_1.05fr]")}>
        <div className={showReservation ? "space-y-4" : "hidden"}>
          {showReservation ? (
            <form
              ref={reservationSection}
              onSubmit={createReservation}
              className="rounded border border-border bg-white p-4"
            >
              <div className="mb-3 flex items-center gap-2">
                <CalendarPlus className="h-4 w-4 text-primary" aria-hidden="true" />
                <h4 className="font-bold">New Reservation</h4>
              </div>
              <fieldset disabled={busy} className="min-w-0">
                <div className="mb-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={guestMode === "new" ? "primary" : "secondary"}
                      onClick={() => setGuestMode("new")}
                    >
                      New guest
                    </Button>
                    <Button
                      type="button"
                      variant={guestMode === "existing" ? "primary" : "secondary"}
                      onClick={() => setGuestMode("existing")}
                    >
                      Existing guest
                    </Button>
                    <Button type="button" variant="ghost" disabled={busy} onClick={() => setShowReservation(false)}>
                      Cancel
                    </Button>
                  </div>
                  {guestMode === "new" ? (
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
                  ) : (
                    <select
                      aria-label="Guest"
                      className="h-10 rounded border border-border bg-white px-3 text-sm"
                      value={reservationForm.primaryGuestId}
                      onChange={(event) =>
                        setReservationForm({ ...reservationForm, primaryGuestId: event.target.value })
                      }
                    >
                      <option value="">Select guest</option>
                      {guests.map((guest) => (
                        <option key={guest.id} value={guest.id}>
                          {guest.firstName} {guest.lastName}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <select
                    aria-label="Room type"
                    className="h-10 rounded border border-border bg-white px-3 text-sm"
                    value={reservationForm.roomTypeId}
                    onChange={(event) => {
                      const roomType = roomTypes.find((item) => item.id === event.target.value);
                      setReservationForm({
                        ...reservationForm,
                        roomTypeId: event.target.value,
                        roomId: "",
                        nightlyRate: roomType
                          ? rateFor(roomType, reservationForm.currencyCode)
                          : reservationForm.nightlyRate
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
                  <div className="flex gap-2">
                    <select
                      aria-label="Stay currency"
                      className="h-10 rounded border border-border bg-white px-3 text-sm font-semibold"
                      value={reservationForm.currencyCode}
                      onChange={(event) => changeReservationCurrency(event.target.value as SaleCurrency)}
                    >
                      {saleCurrencies.map((currency) => (
                        <option key={currency.code} value={currency.code}>
                          {currency.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      aria-label="Nightly rate"
                      inputMode="decimal"
                      value={reservationForm.nightlyRate}
                      onChange={(event) => setReservationForm({ ...reservationForm, nightlyRate: event.target.value })}
                      placeholder={`Nightly rate (${currencyLabel(reservationForm.currencyCode)})`}
                    />
                  </div>
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
                {reservationError ? (
                  <p
                    role="alert"
                    className="mt-3 rounded border border-danger/40 bg-danger/5 px-3 py-2 text-sm font-medium text-danger"
                  >
                    {reservationError}
                  </p>
                ) : null}
                {roomTypes.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No room types are loaded. Press Refresh, or add a room type in Admin before booking.
                  </p>
                ) : guestMode === "existing" && !reservationForm.primaryGuestId ? (
                  <p className="mt-3 text-sm text-muted-foreground">Select the guest to enable Save reservation.</p>
                ) : null}
                <Button
                  className="mt-3"
                  disabled={
                    busy || !reservationForm.roomTypeId || (guestMode === "existing" && !reservationForm.primaryGuestId)
                  }
                >
                  <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                  Save reservation
                </Button>
              </fieldset>
            </form>
          ) : null}
        </div>

        <div className="space-y-4">
          {selectedChartRoom ? (
            <div ref={roomSection} className="rounded border border-border bg-white">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <ReceiptText className="h-4 w-4 text-primary" aria-hidden="true" />
                  <h4 className="font-bold">Selected Room</h4>
                </div>
                {selectedChartRoom ? (
                  <Badge tone={roomBadgeTone(selectedChartRoom)}>Room {selectedChartRoom.roomNumber}</Badge>
                ) : null}
              </div>
              <div className="p-4">
                {!selectedChartRoom ? (
                  <p className="text-sm text-muted-foreground">No room selected.</p>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <RoomFact label="Type" value={selectedChartRoom.roomType.name} />
                      <RoomFact label="Status" value={roomStatusLabel(selectedChartRoom)} />
                      <RoomFact
                        label="Rate"
                        value={[
                          formatCurrency(selectedChartRoom.roomType.baseRate, "TZS"),
                          selectedChartRoom.roomType.baseRateUsd
                            ? formatCurrency(selectedChartRoom.roomType.baseRateUsd, "USD")
                            : null
                        ]
                          .filter(Boolean)
                          .join(" / ")}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!selectedStay ? (
                        <Button
                          type="button"
                          disabled={
                            busy ||
                            !selectedChartRoom.active ||
                            (selectedChartRoom.maintenanceStatus ?? "AVAILABLE") !== "AVAILABLE"
                          }
                          onClick={() => openReservation(selectedChartRoom)}
                        >
                          Assign guest / New Reservation
                        </Button>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy || selectedStay.status !== "CONFIRMED"}
                            onClick={() =>
                              openCheckIn({
                                reservationId: selectedStay.reservationId,
                                reservationNumber: selectedStay.reservationNumber,
                                guestName: `${selectedStay.guest.firstName} ${selectedStay.guest.lastName}`,
                                currencyCode: selectedStay.currencyCode ?? "TZS"
                              })
                            }
                          >
                            Check in
                          </Button>
                          <Button
                            type="button"
                            disabled={busy || selectedStay.status !== "CHECKED_IN" || selectedBalance > 0}
                            onClick={() => transitionReservation(selectedStay.reservationId, "check-out")}
                          >
                            Check out
                          </Button>
                          {selectedStay.status === "CHECKED_IN" ? (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={busy}
                              onClick={() =>
                                openExtend({
                                  reservationId: selectedStay.reservationId,
                                  reservationNumber: selectedStay.reservationNumber,
                                  guestName: `${selectedStay.guest.firstName} ${selectedStay.guest.lastName}`,
                                  departureDate: selectedStay.departureDate,
                                  nightlyRate: selectedStay.nightlyRate,
                                  roomCount:
                                    reservations.find((item) => item.id === selectedStay.reservationId)
                                      ?.reservationRooms.length || 1,
                                  currencyCode: selectedStay.currencyCode ?? "TZS"
                                })
                              }
                            >
                              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                              Extend stay
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              setInvoiceTarget({
                                id: selectedStay.reservationId,
                                number: selectedStay.reservationNumber
                              })
                            }
                          >
                            Make invoice
                          </Button>
                        </>
                      )}
                    </div>
                    {selectedStay?.status === "CHECKED_IN" && selectedBalance > 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {Number(selectedStay.prepaidAmount ?? 0) > 0
                          ? "The guest has used more than the prepaid amount. Collect the remaining balance below before checkout."
                          : "Settle the folio balance below before checkout."}
                      </p>
                    ) : null}
                    {selectedStay?.status === "CHECKED_IN" && selectedBalance < 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Prepaid amount not fully used ({formatCurrency(-selectedBalance, selectedStay.currencyCode ?? "TZS")} credit). The guest can check out.
                      </p>
                    ) : null}
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold">Edit room and stay details</summary>
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
                              onChange={(event) =>
                                setRoomEditForm({ ...roomEditForm, housekeepingStatus: event.target.value })
                              }
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
                              onChange={(event) =>
                                setRoomEditForm({ ...roomEditForm, maintenanceStatus: event.target.value })
                              }
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
                                  onChange={(event) =>
                                    setRoomEditForm({ ...roomEditForm, primaryGuestId: event.target.value })
                                  }
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
                                  onChange={(event) =>
                                    setRoomEditForm({ ...roomEditForm, arrivalDate: event.target.value })
                                  }
                                />
                              </label>
                              <label className="block space-y-1.5">
                                <span className="text-sm font-medium">Departure</span>
                                <Input
                                  aria-label="Edit departure date"
                                  type="date"
                                  value={roomEditForm.departureDate}
                                  onChange={(event) =>
                                    setRoomEditForm({ ...roomEditForm, departureDate: event.target.value })
                                  }
                                />
                              </label>
                              <label className="block space-y-1.5 sm:col-span-2">
                                <span className="text-sm font-medium">
                                  Nightly rate ({currencyLabel(selectedChartRoom.currentStay?.currencyCode ?? "TZS")})
                                </span>
                                <Input
                                  aria-label="Edit nightly rate"
                                  value={roomEditForm.nightlyRate}
                                  onChange={(event) =>
                                    setRoomEditForm({ ...roomEditForm, nightlyRate: event.target.value })
                                  }
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
                    </details>
                    {selectedChartRoom.currentStay ? (
                      <>
                        <div className="rounded border border-border bg-muted/40 p-3">
                          <p className="font-bold">
                            {selectedChartRoom.currentStay.guest.firstName}{" "}
                            {selectedChartRoom.currentStay.guest.lastName}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {selectedChartRoom.currentStay.reservationNumber} -{" "}
                            {formatDate(selectedChartRoom.currentStay.arrivalDate)} to{" "}
                            {formatDate(selectedChartRoom.currentStay.departureDate)}
                          </p>
                        </div>
                        {Number(selectedChartRoom.currentStay.prepaidAmount ?? 0) > 0 ? (
                          <div className="rounded border border-primary/40 bg-primary/5 p-3 text-sm">
                            <p className="font-bold">
                              Prepaid booking - {mealPlanLabel(selectedChartRoom.currentStay.mealPlan)}
                            </p>
                            <p className="mt-1 text-muted-foreground">
                              {selectedChartRoom.currentStay.companyName
                                ? `Paid by ${selectedChartRoom.currentStay.companyName}`
                                : "Paid before arrival"}{" "}
                              -{" "}
                              {formatCurrency(
                                selectedChartRoom.currentStay.prepaidAmount,
                                selectedChartRoom.currentStay.currencyCode ?? "TZS"
                              )}
                            </p>
                            <p className="mt-1 font-semibold">
                              {selectedBalance > 0
                                ? `Guest to pay at checkout: ${formatCurrency(selectedBalance, selectedChartRoom.currentStay.currencyCode ?? "TZS")}`
                                : `Still covered by prepayment: ${formatCurrency(-selectedBalance, selectedChartRoom.currentStay.currencyCode ?? "TZS")}`}
                            </p>
                          </div>
                        ) : null}
                        <div className="grid gap-3 sm:grid-cols-3">
                          <RoomFact
                            label="Room/postings"
                            value={formatMoney(selectedChartRoom.currentStay.folio?.roomCharges ?? "0")}
                          />
                          <RoomFact
                            label="POS charges"
                            value={formatMoney(selectedChartRoom.currentStay.folio?.posCharges ?? "0")}
                          />
                          <RoomFact
                            label="Balance"
                            value={formatMoney(selectedChartRoom.currentStay.folio?.balance ?? "0")}
                          />
                        </div>
                        {selectedStay?.status === "CHECKED_IN" ? (
                          <>
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
                                    onChange={(event) =>
                                      changeSettlementMethod(event.target.value as SettlementPaymentMethod)
                                    }
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
                                    onChange={(event) =>
                                      setSettlementForm({ ...settlementForm, amount: event.target.value })
                                    }
                                    placeholder="Amount"
                                  />
                                </label>
                                {settlementProviderRequired ? (
                                  <label className="block space-y-1.5">
                                    <span className="text-sm font-medium">
                                      {settlementForm.paymentMethod === "MOBILE_MONEY"
                                        ? "Mobile service"
                                        : "Bank provider"}
                                    </span>
                                    <select
                                      aria-label="Payment provider"
                                      className="h-10 w-full rounded border border-border bg-white px-3 text-sm"
                                      value={settlementForm.paymentProvider}
                                      onChange={(event) =>
                                        setSettlementForm({ ...settlementForm, paymentProvider: event.target.value })
                                      }
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
                                        setSettlementForm({
                                          ...settlementForm,
                                          externalReceiptNumber: event.target.value
                                        })
                                      }
                                      placeholder="Receipt ID"
                                    />
                                  </label>
                                ) : null}
                              </div>
                              <Button
                                className="mt-3"
                                disabled={busy || !selectedChartRoom.currentStay || selectedBalance <= 0}
                              >
                                <ReceiptText className="h-4 w-4" aria-hidden="true" />
                                Record payment
                              </Button>
                            </form>
                            <form onSubmit={postCharge} className="rounded border border-border bg-background p-3">
                              <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
                                <Input
                                  aria-label="Charge description"
                                  value={chargeForm.description}
                                  onChange={(event) =>
                                    setChargeForm({ ...chargeForm, description: event.target.value })
                                  }
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
                          </>
                        ) : null}
                        <div className="divide-y divide-border rounded border border-border">
                          {(selectedChartRoom.currentStay.folio?.recentCharges ?? []).length === 0 ? (
                            <p className="px-3 py-4 text-sm text-muted-foreground">No folio charges yet.</p>
                          ) : (
                            selectedChartRoom.currentStay.folio?.recentCharges.map((charge) => (
                              <div
                                key={charge.id}
                                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                              >
                                <div>
                                  <p className="font-semibold">{charge.description}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {charge.itemType.replaceAll("_", " ").toLowerCase()}
                                  </p>
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
          ) : null}

          <details className="rounded border border-border bg-white">
            <summary className="cursor-pointer px-4 py-3 font-bold">
              Reservations ({reservations.length}) — check in, check out, or make invoice
            </summary>
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
                            {assigned?.room ? `Room ${assigned.room.roomNumber}` : "Room not assigned"} -{" "}
                            {assigned?.roomType.name}
                          </p>
                        </div>
                        <Badge tone={reservation.status === "CHECKED_IN" ? "success" : "neutral"}>
                          {reservation.status}
                        </Badge>
                      </div>
                      {Number(reservation.depositPaid ?? 0) > 0 ? (
                        <p className="mt-3 rounded bg-background/80 px-3 py-2 text-sm">
                          Prepaid {mealPlanLabel(reservation.mealPlan)}
                          {reservation.companyName ? ` by ${reservation.companyName}` : ""} -{" "}
                          {formatCurrency(reservation.depositPaid, assigned?.currencyCode ?? "TZS")}
                        </p>
                      ) : null}
                      {reservation.folios[0] ? (
                        <p className="mt-3 rounded bg-background/80 px-3 py-2 text-sm">
                          Folio {reservation.folios[0].folioNumber} - Balance{" "}
                          {formatMoney(reservation.folios[0].balance)}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy || reservation.status !== "CONFIRMED" || !assigned?.room}
                          onClick={() =>
                            openCheckIn({
                              reservationId: reservation.id,
                              reservationNumber: reservation.reservationNumber,
                              guestName: `${reservation.primaryGuest.firstName} ${reservation.primaryGuest.lastName}`,
                              currencyCode: assigned?.currencyCode ?? "TZS"
                            })
                          }
                        >
                          <DoorOpen className="h-4 w-4" aria-hidden="true" />
                          Check in
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={
                            busy ||
                            reservation.status !== "CHECKED_IN" ||
                            reservation.folios.some((folio) => folio.status === "OPEN" && Number(folio.balance) > 0)
                          }
                          onClick={() => transitionReservation(reservation.id, "check-out")}
                        >
                          Check out
                        </Button>
                        {reservation.status === "CHECKED_IN" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              openExtend({
                                reservationId: reservation.id,
                                reservationNumber: reservation.reservationNumber,
                                guestName: `${reservation.primaryGuest.firstName} ${reservation.primaryGuest.lastName}`,
                                departureDate: reservation.departureDate,
                                nightlyRate: assigned?.nightlyRate ?? "0",
                                roomCount: reservation.reservationRooms.length || 1,
                                currencyCode: assigned?.currencyCode ?? "TZS"
                              })
                            }
                          >
                            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                            Extend stay
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            setInvoiceTarget({ id: reservation.id, number: reservation.reservationNumber })
                          }
                        >
                          Make invoice
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </details>
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

function mealPlanLabel(plan?: MealPlan | null) {
  return mealPlans.find((entry) => entry.value === plan)?.label ?? "booking";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function providersForSettlementMethod(method: SettlementPaymentMethod) {
  if (method === "BANK_TRANSFER") return bankPaymentProviders;
  if (method === "MOBILE_MONEY") return mobileMoneyProviders;
  return [];
}

function addDays(value: string, days: number) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
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

function rateFor(roomType: RoomType, currency: SaleCurrency) {
  return currency === "USD" ? (roomType.baseRateUsd ?? "") : roomType.baseRate;
}
