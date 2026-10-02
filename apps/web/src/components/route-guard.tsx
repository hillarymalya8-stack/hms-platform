"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearSession, hasAnyPermission, readSession, resolveHomePath, type AuthenticatedUser } from "@/lib/auth";

type RouteGuardProps = {
  children: ReactNode;
  requiredPermissions?: readonly string[];
};

export function RouteGuard({ children, requiredPermissions = [] }: RouteGuardProps) {
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

  if (!ready || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="rounded border border-border bg-white px-5 py-4 text-sm font-semibold text-muted-foreground">
          Checking access...
        </div>
      </main>
    );
  }

  if (!hasAnyPermission(user, requiredPermissions)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded border border-border bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-danger text-white">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-bold">Access not allowed</h1>
              <p className="text-sm text-muted-foreground">This account does not have permission to open this system.</p>
            </div>
          </div>
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

  return <>{children}</>;
}
