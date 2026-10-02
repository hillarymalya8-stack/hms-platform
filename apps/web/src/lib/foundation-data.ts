import {
  Banknote,
  BedDouble,
  BookOpenCheck,
  Building2,
  ClipboardCheck,
  Database,
  FileBarChart2,
  KeyRound,
  Landmark,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  Store,
  UserCheck,
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

export const foundationCards = [
  {
    label: "Organization",
    value: "Hotel Group",
    detail: "Multi-property tenant model",
    icon: Building2,
    tone: "success"
  },
  {
    label: "Default Property",
    value: "Main Hotel",
    detail: "Currency, fiscal year, business date",
    icon: BookOpenCheck,
    tone: "primary"
  },
  {
    label: "Access Control",
    value: "19 permissions",
    detail: "Backend-enforced RBAC",
    icon: ShieldCheck,
    tone: "warning"
  },
  {
    label: "Accounting Guard",
    value: "Balanced only",
    detail: "Debits must equal credits",
    icon: Banknote,
    tone: "danger"
  }
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

export const hotelCoreCards = [
  { label: "Room Types", value: "Live", detail: "Rate and room class records", icon: BedDouble },
  { label: "Rooms", value: "Live", detail: "Operational room inventory", icon: Building2 },
  { label: "Guest Profiles", value: "Ready", detail: "Identity and contact records", icon: UsersRound },
  { label: "Check-in Flow", value: "Folio opens", detail: "Room moves to occupied", icon: UserCheck }
];

export const reservationRules = [
  "Confirmed, tentative, and checked-in reservations block overlapping bookings.",
  "A guest must exist before a reservation can be created.",
  "A room must be assigned before check-in.",
  "Check-in creates one open folio for the primary guest.",
  "Check-out requires a settled folio and marks the room dirty."
];

export const sampleJournal = [
  { account: "1100 Cash", debit: "100.00", credit: "" },
  { account: "4200 Restaurant Revenue", debit: "", credit: "86.21" },
  { account: "2200 Tax Payable", debit: "", credit: "13.79" }
];

export const paymentPolicies = [
  { method: "Cash", receiptRequired: "No", duplicateCheck: "Drawer reconciliation" },
  { method: "Card / Credit", receiptRequired: "Yes", duplicateCheck: "Per property and payment method" },
  { method: "Mobile Money", receiptRequired: "Yes", duplicateCheck: "Per provider reference" },
  { method: "Bank Transfer", receiptRequired: "Yes", duplicateCheck: "Per bank reference" },
  { method: "Room Charge", receiptRequired: "No", duplicateCheck: "Folio posting reference" }
];
