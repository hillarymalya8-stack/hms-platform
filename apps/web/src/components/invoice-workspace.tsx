"use client";

import { FormEvent, useMemo, useState } from "react";
import { FileText, Printer, RefreshCcw, Search } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type InvoiceMode = "room" | "all" | "custom";

type InvoiceGuest = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  documentNumber?: string | null;
};

type InvoiceLine = {
  id: string;
  folioId?: string;
  folioNumber?: string;
  itemType: string;
  sourceType?: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  totalAmount: string;
  postedAt: string;
};

type InvoiceReservation = {
  id: string;
  reservationNumber: string;
  status: string;
  arrivalDate: string;
  departureDate: string;
  guest: InvoiceGuest;
  room?: {
    id?: string | null;
    roomNumber?: string | null;
    roomType: string;
    nightlyRate: string;
  } | null;
  projectedRoomCharge?: InvoiceLine | null;
  folios: Array<{
    id: string;
    folioNumber: string;
    status: string;
    balance: string;
  }>;
  items: InvoiceLine[];
};

const chargeTypes = new Set(["ROOM_CHARGE", "POS_CHARGE", "TAX", "OTHER", "TRANSFER"]);

export function InvoiceWorkspace({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InvoiceReservation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [mode, setMode] = useState<InvoiceMode>("all");
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [message, setMessage] = useState("Search a guest name, reservation number, phone, or email.");
  const [busy, setBusy] = useState(false);

  const selectedReservation = useMemo(
    () => results.find((reservation) => reservation.id === selectedId) ?? null,
    [results, selectedId]
  );
  const allLines = useMemo(() => (selectedReservation ? invoiceLines(selectedReservation) : []), [selectedReservation]);
  const visibleLines = useMemo(() => filterLines(allLines, mode, selectedLineIds), [allLines, mode, selectedLineIds]);
  const total = visibleLines.reduce((sum, line) => sum + Number(line.totalAmount || 0), 0);

  async function searchInvoices(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (query.trim().length < 2) {
      setMessage("Enter at least 2 characters to search.");
      return;
    }

    setBusy(true);
    const result = await apiRequest<InvoiceReservation[]>(`/invoices/reservations?query=${encodeURIComponent(query.trim())}`);
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setResults(result.data);
    const first = result.data[0];
    setSelectedId(first?.id ?? "");
    const nextLines = first ? invoiceLines(first) : [];
    setSelectedLineIds(defaultLineIds(nextLines));
    setMode("all");
    setMessage(result.data.length ? `${result.data.length} reservation invoice record${result.data.length === 1 ? "" : "s"} found.` : "No matching reservations found.");
  }

  function selectReservation(reservation: InvoiceReservation) {
    setSelectedId(reservation.id);
    const nextLines = invoiceLines(reservation);
    setSelectedLineIds(defaultLineIds(nextLines));
    setMode("all");
    setMessage(`${reservation.reservationNumber} selected for invoice.`);
  }

  function toggleLine(lineId: string) {
    setMode("custom");
    setSelectedLineIds((current) =>
      current.includes(lineId) ? current.filter((id) => id !== lineId) : [...current, lineId]
    );
  }

  function changeMode(nextMode: InvoiceMode) {
    setMode(nextMode);
    if (nextMode === "room") {
      setSelectedLineIds(allLines.filter((line) => line.itemType === "ROOM_CHARGE").map((line) => line.id));
    }
    if (nextMode === "all") {
      setSelectedLineIds(defaultLineIds(allLines));
    }
  }

  function printInvoice() {
    if (!selectedReservation || visibleLines.length === 0) {
      setMessage("Select a reservation and at least one invoice line before printing.");
      return;
    }

    const invoiceNumber = `INV-${selectedReservation.reservationNumber}-${Date.now().toString().slice(-5)}`;
    const guestName = guestFullName(selectedReservation.guest);
    const printWindow = window.open("", "_blank", "width=860,height=920");
    if (!printWindow) return;

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(invoiceNumber)}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 34px; color: #111; }
            header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #111; padding-bottom: 18px; }
            h1 { margin: 0; font-size: 28px; }
            h2 { margin: 20px 0 8px; font-size: 15px; text-transform: uppercase; letter-spacing: .04em; }
            p { margin: 4px 0; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 13px; }
            th { border-bottom: 1px solid #999; padding: 9px 6px; text-align: left; }
            td { border-bottom: 1px solid #ddd; padding: 9px 6px; vertical-align: top; }
            .right { text-align: right; }
            .total { margin-top: 18px; display: flex; justify-content: flex-end; font-size: 18px; font-weight: 700; }
            .total span { min-width: 170px; text-align: right; }
            .muted { color: #555; }
          </style>
        </head>
        <body>
          <header>
            <div>
              <h1>Invoice</h1>
              <p><strong>Main Hotel</strong></p>
              <p class="muted">Printed by hotel system</p>
            </div>
            <div class="right">
              <p><strong>${escapeHtml(invoiceNumber)}</strong></p>
              <p>${escapeHtml(new Date().toLocaleString())}</p>
              <p>${escapeHtml(modeLabel(mode))}</p>
            </div>
          </header>
          <section>
            <h2>Guest</h2>
            <p><strong>${escapeHtml(guestName)}</strong></p>
            <p>${escapeHtml(selectedReservation.guest.email ?? selectedReservation.guest.phone ?? "")}</p>
            <h2>Reservation</h2>
            <p>${escapeHtml(selectedReservation.reservationNumber)} - ${escapeHtml(selectedReservation.status)}</p>
            <p>${escapeHtml(formatDate(selectedReservation.arrivalDate))} to ${escapeHtml(formatDate(selectedReservation.departureDate))}</p>
            <p>${escapeHtml(selectedReservation.room?.roomNumber ? `Room ${selectedReservation.room.roomNumber} - ${selectedReservation.room.roomType}` : selectedReservation.room?.roomType ?? "Room not assigned")}</p>
          </section>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Type</th>
                <th class="right">Qty</th>
                <th class="right">Rate</th>
                <th class="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${visibleLines
                .map(
                  (line) => `
                    <tr>
                      <td>${escapeHtml(line.description)}</td>
                      <td>${escapeHtml(line.itemType.replaceAll("_", " "))}</td>
                      <td class="right">${escapeHtml(line.quantity)}</td>
                      <td class="right">${escapeHtml(formatMoney(line.unitPrice))}</td>
                      <td class="right">${escapeHtml(formatMoney(line.totalAmount))}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
          <div class="total">Total <span>${escapeHtml(formatMoney(total))}</span></div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    setMessage(`${invoiceNumber} prepared for printing.`);
  }

  return (
    <div className="rounded border border-border bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
          <h4 className="font-bold">Reservation Invoice</h4>
        </div>
        <Badge>{visibleLines.length} lines</Badge>
      </div>
      <form onSubmit={searchInvoices} className={compact ? "grid gap-3" : "grid gap-3 sm:grid-cols-[1fr_auto]"}>
        <Input
          aria-label="Search invoice guest"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search guest name, reservation, phone, or email"
        />
        <Button disabled={busy}>
          <Search className="h-4 w-4" aria-hidden="true" />
          Search
        </Button>
      </form>
      <p className="mt-3 rounded border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">{message}</p>

      <div className={compact ? "mt-4 space-y-4" : "mt-4 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]"}>
        <div className="rounded border border-border">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p className="text-sm font-bold">Matches</p>
            <Button type="button" variant="secondary" className="h-8 px-3" onClick={() => void searchInvoices()} disabled={busy || query.trim().length < 2}>
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <div className="max-h-72 overflow-auto divide-y divide-border">
            {results.length === 0 ? (
              <p className="px-3 py-5 text-sm text-muted-foreground">No invoice search results yet.</p>
            ) : (
              results.map((reservation) => (
                <button
                  key={reservation.id}
                  type="button"
                  className={
                    reservation.id === selectedId
                      ? "block w-full bg-muted px-3 py-3 text-left text-sm"
                      : "block w-full px-3 py-3 text-left text-sm hover:bg-muted/70"
                  }
                  onClick={() => selectReservation(reservation)}
                >
                  <p className="font-bold">{guestFullName(reservation.guest)}</p>
                  <p className="text-xs text-muted-foreground">
                    {reservation.reservationNumber} - {reservation.room?.roomNumber ? `Room ${reservation.room.roomNumber}` : "Room not assigned"}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => changeMode("room")}
              className={mode === "room" ? selectedModeClass : unselectedModeClass}
            >
              Room only
            </button>
            <button
              type="button"
              onClick={() => changeMode("all")}
              className={mode === "all" ? selectedModeClass : unselectedModeClass}
            >
              Room + expenses
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className={mode === "custom" ? selectedModeClass : unselectedModeClass}
            >
              Custom
            </button>
          </div>

          <div className="rounded border border-border">
            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
              <p className="text-sm font-bold">{selectedReservation ? selectedReservation.reservationNumber : "Invoice lines"}</p>
              <span className="text-sm font-bold tabular-nums">{formatMoney(total)}</span>
            </div>
            <div className="max-h-80 overflow-auto divide-y divide-border">
              {allLines.length === 0 ? (
                <p className="px-3 py-5 text-sm text-muted-foreground">Select a reservation to see invoice lines.</p>
              ) : (
                allLines.map((line) => {
                  const included = visibleLines.some((entry) => entry.id === line.id);
                  return (
                    <label key={line.id} className="flex cursor-pointer items-start gap-3 px-3 py-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={included}
                        onChange={() => toggleLine(line.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{line.description}</span>
                        <span className="block text-xs text-muted-foreground">{line.itemType.replaceAll("_", " ").toLowerCase()}</span>
                      </span>
                      <span className="font-bold tabular-nums">{formatMoney(line.totalAmount)}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <Button type="button" onClick={printInvoice} disabled={!selectedReservation || visibleLines.length === 0}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print invoice
          </Button>
        </div>
      </div>
    </div>
  );
}

const selectedModeClass = "h-10 rounded border border-primary bg-primary px-3 text-sm font-bold text-primary-foreground";
const unselectedModeClass = "h-10 rounded border border-border bg-background px-3 text-sm font-bold text-muted-foreground hover:bg-muted";

function invoiceLines(reservation: InvoiceReservation) {
  const hasRoomCharge = reservation.items.some((item) => item.itemType === "ROOM_CHARGE");
  const lines = reservation.items.filter((item) => chargeTypes.has(item.itemType));
  if (!hasRoomCharge && reservation.projectedRoomCharge) {
    return [reservation.projectedRoomCharge, ...lines];
  }
  return lines;
}

function defaultLineIds(lines: InvoiceLine[]) {
  return lines.filter((line) => chargeTypes.has(line.itemType)).map((line) => line.id);
}

function filterLines(lines: InvoiceLine[], mode: InvoiceMode, selectedLineIds: string[]) {
  if (mode === "room") {
    return lines.filter((line) => line.itemType === "ROOM_CHARGE");
  }

  if (mode === "all") {
    return lines.filter((line) => chargeTypes.has(line.itemType));
  }

  return lines.filter((line) => selectedLineIds.includes(line.id));
}

function guestFullName(guest: InvoiceGuest) {
  return `${guest.firstName} ${guest.lastName}`.trim();
}

function modeLabel(mode: InvoiceMode) {
  if (mode === "room") return "Room charges only";
  if (mode === "all") return "Room charges and expenses";
  return "Custom invoice";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatMoney(value: string | number) {
  const amount = typeof value === "number" ? value : Number(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2
  }).format(Number.isFinite(amount) ? amount : 0);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
