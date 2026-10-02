import { roleAccessLevels } from "@hms/shared";

export type AuthenticatedUser = {
  id: string;
  email: string;
  fullName: string;
  organizationId: string;
  defaultPropertyId?: string | null;
  permissions: string[];
};

export type LoginResponse = {
  accessToken: string;
  expiresAt: string;
  user: AuthenticatedUser;
};

export type StoredSession = {
  accessToken: string;
  expiresAt: string;
  user: AuthenticatedUser;
};

const accessTokenKey = "hms_access_token";
const sessionKey = "hms_session";
const demoOrganizationId = "demo-organization";
const demoPropertyId = "demo-property-main";

export const demoAuthPassword = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "ChangeMe123!";

export function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
}

export function isDemoAuthEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true" || !process.env.NEXT_PUBLIC_API_URL;
}

export const demoUsers: AuthenticatedUser[] = roleAccessLevels
  .filter((accessLevel) => Boolean(accessLevel.defaultUser))
  .map((accessLevel) => ({
    id: `demo-${accessLevel.key}`,
    email: accessLevel.defaultUser!.email,
    fullName: accessLevel.defaultUser!.fullName,
    organizationId: demoOrganizationId,
    defaultPropertyId: demoPropertyId,
    permissions: [...accessLevel.permissionCodes]
  }));

export function loginWithDemoCredentials(email: string, password: string): LoginResponse | null {
  if (!isDemoAuthEnabled()) return null;

  const acceptedPassword = password === demoAuthPassword || password === "demo-password";
  if (!acceptedPassword) return null;

  const normalizedEmail = email.trim().toLowerCase();
  const user = demoUsers.find((entry) => entry.email.toLowerCase() === normalizedEmail);
  if (!user) return null;

  return {
    accessToken: `demo.${user.id}.${Date.now()}`,
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    user
  };
}

export function saveSession(result: LoginResponse) {
  const session: StoredSession = {
    accessToken: result.accessToken,
    expiresAt: result.expiresAt,
    user: result.user
  };

  window.localStorage.setItem(accessTokenKey, result.accessToken);
  window.localStorage.setItem(sessionKey, JSON.stringify(session));
}

export function readSession(): StoredSession | null {
  if (typeof window === "undefined") return null;

  const rawSession = window.localStorage.getItem(sessionKey);
  const accessToken = window.localStorage.getItem(accessTokenKey);

  if (!rawSession || !accessToken) return null;

  try {
    const session = JSON.parse(rawSession) as StoredSession;
    if (!session.user || session.accessToken !== accessToken) return null;
    return session;
  } catch {
    return null;
  }
}

export function clearSession() {
  window.localStorage.removeItem(accessTokenKey);
  window.localStorage.removeItem(sessionKey);
}

export function hasAnyPermission(user: AuthenticatedUser, permissions: readonly string[]) {
  if (permissions.length === 0) return true;
  return permissions.some((permission) => user.permissions.includes(permission));
}

export function resolveHomePath(user: AuthenticatedUser) {
  const permissions = new Set(user.permissions);
  const has = (permission: string) => permissions.has(permission);
  const permissionCount = user.permissions.length;

  if (has("pos.orders.create") && has("pos.orders.pay") && permissionCount <= 3) {
    return "/pos-terminal";
  }

  if (has("accounting.accounts.manage") && !has("users.manage")) {
    return "/finance";
  }

  if (has("front_office.view") && !has("pos.view") && !has("inventory.view")) {
    return "/front-office";
  }

  if (has("inventory.view") && !has("front_office.view") && !has("accounting.view")) {
    return "/inventory";
  }

  if (has("reports.view") && !has("dashboard.view")) {
    return "/reports";
  }

  if (has("dashboard.view")) {
    return "/dashboard";
  }

  return "/login";
}
