import { permissions, type PermissionCode } from "./permissions";

const allPermissionCodes = permissions.map((permission) => permission.code) as PermissionCode[];

export type RoleAccessLevel = {
  key: string;
  level: number;
  name: string;
  description: string;
  home: string;
  modules: readonly string[];
  permissionCodes: readonly PermissionCode[];
  defaultUser?: {
    email: string;
    fullName: string;
  };
};

export const roleAccessLevels = [
  {
    key: "super-admin",
    level: 100,
    name: "Super Administrator",
    description: "Owner-level access for setup, users, roles, settings, finance, audit, and all operations.",
    home: "Full hotel dashboard",
    modules: ["dashboard", "front office", "pos", "inventory", "purchasing", "finance", "reports", "administration"],
    permissionCodes: allPermissionCodes,
    defaultUser: {
      email: "admin@hotel.local",
      fullName: "System Administrator"
    }
  },
  {
    key: "general-manager",
    level: 80,
    name: "General Manager",
    description: "Can review hotel operations, reports, audit, finance, and team access without changing system ownership.",
    home: "Management dashboard",
    modules: ["dashboard", "front office", "pos", "inventory", "purchasing", "finance", "reports", "administration"],
    permissionCodes: [
      "dashboard.view",
      "front_office.view",
      "pos.view",
      "inventory.view",
      "purchasing.view",
      "accounting.view",
      "reports.view",
      "users.view",
      "roles.view",
      "properties.view",
      "settings.view",
      "audit.view"
    ],
    defaultUser: {
      email: "manager@hotel.local",
      fullName: "General Manager"
    }
  },
  {
    key: "accountant",
    level: 70,
    name: "Accountant",
    description: "Finance-level access for accounts, journals, purchasing review, reports, and audit checks.",
    home: "Finance workspace",
    modules: ["dashboard", "purchasing", "finance", "reports"],
    permissionCodes: [
      "dashboard.view",
      "accounting.view",
      "accounting.accounts.manage",
      "accounting.journals.create",
      "accounting.journals.post",
      "purchasing.view",
      "reports.view",
      "audit.view"
    ],
    defaultUser: {
      email: "accountant@hotel.local",
      fullName: "Accountant"
    }
  },
  {
    key: "operations-supervisor",
    level: 60,
    name: "Operations Supervisor",
    description: "Can supervise daily hotel work across front office, POS, stock, purchasing, and reports.",
    home: "Operations dashboard",
    modules: ["dashboard", "front office", "pos", "inventory", "purchasing", "reports"],
    permissionCodes: [
      "dashboard.view",
      "front_office.view",
      "front_office.rooms.manage",
      "front_office.guests.manage",
      "front_office.reservations.create",
      "front_office.reservations.check_in",
      "front_office.reservations.check_out",
      "pos.view",
      "pos.orders.void",
      "pos.shifts.manage",
      "inventory.view",
      "purchasing.view",
      "reports.view"
    ],
    defaultUser: {
      email: "supervisor@hotel.local",
      fullName: "Operations Supervisor"
    }
  },
  {
    key: "front-office",
    level: 50,
    name: "Front Office",
    description: "Reception access for guests, rooms, reservations, check-in, and check-out.",
    home: "Front office workspace",
    modules: ["dashboard", "front office"],
    permissionCodes: [
      "dashboard.view",
      "front_office.view",
      "front_office.rooms.manage",
      "front_office.guests.manage",
      "front_office.reservations.create",
      "front_office.reservations.check_in",
      "front_office.reservations.check_out"
    ],
    defaultUser: {
      email: "frontdesk@hotel.local",
      fullName: "Front Desk"
    }
  },
  {
    key: "pos-cashier",
    level: 40,
    name: "POS Cashier",
    description: "Cashier-machine access for POS catalog, ticket creation, and payments only.",
    home: "POS terminal",
    modules: ["pos"],
    permissionCodes: ["pos.view", "pos.orders.create", "pos.orders.pay"],
    defaultUser: {
      email: "cashier@hotel.local",
      fullName: "POS Cashier"
    }
  },
  {
    key: "storekeeper",
    level: 35,
    name: "Storekeeper",
    description: "Stores access for inventory visibility and purchasing handoff.",
    home: "Inventory workspace",
    modules: ["dashboard", "inventory", "purchasing"],
    permissionCodes: ["dashboard.view", "inventory.view", "purchasing.view"],
    defaultUser: {
      email: "storekeeper@hotel.local",
      fullName: "Storekeeper"
    }
  },
  {
    key: "report-viewer",
    level: 20,
    name: "Report Viewer",
    description: "Read-only management visibility for dashboard and reports.",
    home: "Reports workspace",
    modules: ["dashboard", "reports"],
    permissionCodes: ["dashboard.view", "reports.view"],
    defaultUser: {
      email: "viewer@hotel.local",
      fullName: "Report Viewer"
    }
  }
] as const satisfies readonly RoleAccessLevel[];
