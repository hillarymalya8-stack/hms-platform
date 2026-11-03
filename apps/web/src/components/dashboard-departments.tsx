"use client";

import { useEffect, useState } from "react";
import {
  BedDouble,
  ClipboardCheck,
  FileBarChart2,
  Landmark,
  ShieldCheck,
  Utensils,
  Warehouse,
  Wifi,
  ArrowRight
} from "lucide-react";
import { readSession } from "@/lib/auth";

const departments = [
  {
    name: "Front Office",
    href: "/front-office",
    icon: BedDouble,
    permissions: ["front_office.view"],
    description: "Room chart, guests, reservations, and checkout."
  },
  {
    name: "POS",
    href: "/pos",
    icon: Utensils,
    permissions: ["pos.view"],
    description: "Outlet sales, orders, and payments."
  },
  {
    name: "Inventory",
    href: "/inventory",
    icon: Warehouse,
    permissions: ["inventory.view"],
    description: "Stock, receiving, and transfers."
  },
  {
    name: "Purchasing",
    href: "/purchasing",
    icon: ClipboardCheck,
    permissions: ["purchasing.view"],
    description: "Suppliers, purchase orders, and deliveries."
  },
  {
    name: "Finance",
    href: "/finance",
    icon: Landmark,
    permissions: ["accounting.view"],
    description: "Income, expenses, balances, and daily close."
  },
  {
    name: "Reports",
    href: "/reports",
    icon: FileBarChart2,
    permissions: ["reports.view"],
    description: "Hotel performance and management reports."
  },
  {
    name: "Administration",
    href: "/administration",
    icon: ShieldCheck,
    permissions: ["users.view", "roles.view", "settings.view"],
    description: "Staff, access, hotel settings, and audit."
  },
  {
    name: "Offline POS & Sync",
    href: "/offline-sync",
    icon: Wifi,
    permissions: ["pos.view"],
    description: "Queued sales, terminals, and sync status."
  }
];

export function DashboardDepartments() {
  const [permissions, setPermissions] = useState<string[] | null>(null);
  useEffect(() => {
    setPermissions(readSession()?.user.permissions ?? []);
  }, []);
  const allowed = departments.filter((department) =>
    department.permissions.some((permission) => permissions?.includes(permission))
  );
  return (
    <section aria-label="Departments" className="mt-5 rounded-lg border border-border bg-white p-5">
      <h2 className="text-lg font-bold">Open a department</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose what you want to work on. Each department opens on its own page.
      </p>
      {permissions === null ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading departments…</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {allowed.map((department) => (
            <a
              key={department.href}
              href={department.href}
              className="group rounded-lg border border-border p-4 transition-colors hover:border-primary hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-bold">
                  <department.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  {department.name}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{department.description}</p>
              <span className="mt-3 inline-block text-sm font-semibold text-primary">Open {department.name}</span>
            </a>
          ))}
          {!allowed.length ? (
            <p className="col-span-full text-sm text-muted-foreground">
              No departments are available for this account. Ask your administrator to check your access.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
