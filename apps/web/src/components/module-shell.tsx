"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BedDouble,
  BellRing,
  ClipboardCheck,
  LayoutDashboard,
  Landmark,
  LogOut,
  ShieldCheck,
  Store,
  Warehouse,
  Wifi,
  type LucideIcon
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { clearSession, hasAnyPermission, readSession, resolveHomePath, type AuthenticatedUser } from "@/lib/auth";

type ModuleShellProps = {
  title: string;
  eyebrow: string;
  description: string;
  requiredPermissions: readonly string[];
  children: ReactNode;
};

type ModuleNavItem = {
  label: string;
  href: string;
  permissions: readonly string[];
  icon: LucideIcon;
};

const moduleNav: ModuleNavItem[] = [
  { label: "Dashboard", href: "/dashboard", permissions: ["dashboard.view"], icon: LayoutDashboard },
  { label: "Front Office", href: "/front-office", permissions: ["front_office.view"], icon: BedDouble },
  { label: "POS Terminal", href: "/pos-terminal", permissions: ["pos.view"], icon: Store },
  { label: "Prep Monitor", href: "/prep-notifications", permissions: ["pos.view"], icon: BellRing },
  { label: "Offline Sync", href: "/offline-sync", permissions: ["pos.view"], icon: Wifi },
  { label: "Inventory", href: "/inventory", permissions: ["inventory.view"], icon: Warehouse },
  { label: "Purchasing", href: "/purchasing", permissions: ["purchasing.view"], icon: ClipboardCheck },
  { label: "Finance", href: "/finance", permissions: ["accounting.view"], icon: Landmark },
  { label: "Reports", href: "/reports", permissions: ["reports.view"], icon: BarChart3 },
  { label: "Administration", href: "/administration", permissions: ["users.view", "roles.view", "settings.view"], icon: ShieldCheck }
];

export function ModuleShell({ title, eyebrow, description, requiredPermissions, children }: ModuleShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const session = readSession();

    if (!session) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    setUser(session.user);
    setReady(true);
  }, [pathname, router]);

  const allowedNav = useMemo(
    () => (user ? moduleNav.filter((item) => hasAnyPermission(user, item.permissions)) : []),
    [user]
  );

  if (!ready || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="rounded border border-border bg-white px-5 py-4 text-sm font-semibold text-muted-foreground">
          Opening your system...
        </div>
      </main>
    );
  }

  if (!hasAnyPermission(user, requiredPermissions)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded border border-border bg-white p-5">
          <h1 className="text-lg font-bold">Access not allowed</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {user.fullName} is signed in, but this credential does not open {title}.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={() => router.replace(resolveHomePath(user))}>
              Open My System
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                clearSession();
                router.replace("/login");
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-[248px_1fr]">
        <aside className="border-r border-border bg-white px-4 py-5">
          <div className="mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="mt-3 text-sm font-bold">HMS Platform</p>
            <p className="text-xs text-muted-foreground">{user.fullName}</p>
          </div>

          <nav className="space-y-1">
            {allowedNav.map((item) => {
              const active = pathname === item.href;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={
                    active
                      ? "inline-flex h-10 w-full items-center justify-start gap-2 rounded border border-border bg-card px-3 text-sm font-semibold text-foreground"
                      : "inline-flex h-10 w-full items-center justify-start gap-2 rounded px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  }
                  aria-current={active ? "page" : undefined}
                >
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </a>
              );
            })}
          </nav>

          <Button
            type="button"
            variant="secondary"
            className="mt-6 w-full"
            onClick={() => {
              clearSession();
              router.replace("/login");
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </Button>
        </aside>

        <section className="min-w-0 px-5 py-5 md:px-8">
          <header className="mb-5 flex flex-col gap-3 border-b border-border pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone="primary">{eyebrow}</Badge>
                <Badge>{user.email}</Badge>
              </div>
              <h1 className="text-2xl font-bold leading-tight md:text-3xl">{title}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          </header>

          {children}
        </section>
      </div>
    </main>
  );
}
