import {
  Banknote,
  BedDouble,
  ClipboardCheck,
  Database,
  FileBarChart2,
  KeyRound,
  Landmark,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  Store,
  UsersRound,
  Wifi,
  Warehouse
} from "lucide-react";

export const navigation = [
  { label: "Dashboard", icon: FileBarChart2, href: "/dashboard", active: true },
  { label: "Front Office", icon: BedDouble, href: "/front-office" },
  { label: "POS", icon: Store, href: "/pos-terminal" },
  { label: "Inventory", icon: Warehouse, href: "/inventory" },
  { label: "Purchasing", icon: ClipboardCheck, href: "/purchasing" },
  { label: "Finance", icon: Landmark, href: "/finance" },
  { label: "Reports", icon: FileBarChart2, href: "/reports" },
  { label: "Administration", icon: UsersRound, href: "/administration" }
];

export const phaseStatus = [
  { label: "Database schema", status: "Ready", icon: Database },
  { label: "Secure login", status: "Ready", icon: LockKeyhole },
  { label: "Roles and permissions", status: "Ready", icon: ShieldCheck },
  { label: "Audit log", status: "Ready", icon: ReceiptText },
  { label: "Property settings", status: "Ready", icon: KeyRound },
  { label: "Accounting validation", status: "Ready", icon: Landmark },
  { label: "POS cashier", status: "Ready", icon: Store },
  { label: "Receipt ID policy", status: "Ready", icon: Banknote },
  { label: "Inventory control", status: "Ready", icon: Warehouse },
  { label: "Purchasing and AP", status: "Ready", icon: ClipboardCheck },
  { label: "Finance close", status: "Ready", icon: Landmark },
  { label: "Management reports", status: "Ready", icon: FileBarChart2 },
  { label: "Administration", status: "Ready", icon: UsersRound },
  { label: "Offline POS sync", status: "Ready", icon: Wifi },
  { label: "Backend persistence", status: "Ready", icon: Database }
];

export const reservationRules = [
  "Confirmed, tentative, and checked-in reservations block overlapping bookings.",
  "A guest must exist before a reservation can be created.",
  "A room must be assigned before check-in.",
  "Check-in creates one open folio for the primary guest.",
  "Check-out requires a settled folio and marks the room dirty."
];

export const paymentPolicies = [
  { method: "Cash", receiptRequired: "No", duplicateCheck: "Drawer reconciliation" },
  { method: "Card / Credit", receiptRequired: "Yes", duplicateCheck: "Per property and payment method" },
  { method: "Mobile Money", receiptRequired: "Yes", duplicateCheck: "Per provider reference" },
  { method: "Bank Transfer", receiptRequired: "Yes", duplicateCheck: "Per bank reference" },
  { method: "Room Charge", receiptRequired: "No", duplicateCheck: "Folio posting reference" }
];
