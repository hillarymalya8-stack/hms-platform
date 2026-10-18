import type { PermissionCode } from "./permissions";

export type SystemAccessAction = {
  code: PermissionCode;
  label: string;
};

export type SystemAccessGroup = {
  key: string;
  label: string;
  description: string;
  href: string;
  viewPermission: PermissionCode;
  actions: readonly SystemAccessAction[];
};

// Systems an administrator can switch on for an individual staff account.
// Turning a system on grants its view permission; actions are optional extras inside it.
export const systemAccessGroups = [
  {
    key: "dashboard",
    label: "Dashboard",
    description: "Hotel overview and quick links.",
    href: "/dashboard",
    viewPermission: "dashboard.view",
    actions: []
  },
  {
    key: "front-office",
    label: "Front Office",
    description: "Rooms, guests, reservations, check-in and check-out.",
    href: "/front-office",
    viewPermission: "front_office.view",
    actions: [
      { code: "front_office.rooms.manage", label: "Manage rooms" },
      { code: "front_office.guests.manage", label: "Manage guests" },
      { code: "front_office.reservations.create", label: "Create reservations" },
      { code: "front_office.reservations.check_in", label: "Check in" },
      { code: "front_office.reservations.check_out", label: "Check out" }
    ]
  },
  {
    key: "pos",
    label: "POS",
    description: "POS terminal, prep monitor and offline sync.",
    href: "/pos-terminal",
    viewPermission: "pos.view",
    actions: [
      { code: "pos.orders.create", label: "Create orders" },
      { code: "pos.orders.pay", label: "Take payments" },
      { code: "pos.orders.void", label: "Void orders" },
      { code: "pos.shifts.manage", label: "Manage shifts" },
      { code: "pos.products.manage", label: "Manage products" },
      { code: "pos.outlets.manage", label: "Manage outlets" }
    ]
  },
  {
    key: "inventory",
    label: "Inventory",
    description: "Stores, bar and restaurant stock.",
    href: "/inventory",
    viewPermission: "inventory.view",
    actions: []
  },
  {
    key: "purchasing",
    label: "Purchasing",
    description: "Suppliers, purchase orders and invoices.",
    href: "/purchasing",
    viewPermission: "purchasing.view",
    actions: []
  },
  {
    key: "finance",
    label: "Finance",
    description: "Chart of accounts and journals.",
    href: "/finance",
    viewPermission: "accounting.view",
    actions: [
      { code: "accounting.accounts.manage", label: "Manage accounts" },
      { code: "accounting.journals.create", label: "Create journals" },
      { code: "accounting.journals.post", label: "Post journals" }
    ]
  },
  {
    key: "reports",
    label: "Reports",
    description: "Management and operational reports.",
    href: "/reports",
    viewPermission: "reports.view",
    actions: []
  },
  {
    key: "administration",
    label: "Administration",
    description: "Staff accounts, roles, settings and audit.",
    href: "/administration",
    viewPermission: "users.view",
    actions: [
      { code: "users.manage", label: "Create and edit staff accounts" },
      { code: "roles.view", label: "View roles" },
      { code: "roles.manage", label: "Manage roles" },
      { code: "settings.view", label: "View settings" },
      { code: "settings.manage", label: "Manage settings" },
      { code: "properties.view", label: "View properties" },
      { code: "properties.manage", label: "Manage properties" },
      { code: "audit.view", label: "View audit trail" }
    ]
  }
] as const satisfies readonly SystemAccessGroup[];
