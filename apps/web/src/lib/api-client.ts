import { clearSession, getApiBaseUrl } from "@/lib/auth";

export type ApiResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  const baseUrl = getApiBaseUrl();
  const token = typeof window !== "undefined" ? window.localStorage.getItem("hms_access_token") : null;

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });

    const body = await response.json().catch(() => undefined);

    if (response.status === 401) {
      clearSession();
      if (typeof window !== "undefined") {
        const nextPath = `${window.location.pathname}${window.location.search}`;
        window.location.replace(`/login?next=${encodeURIComponent(nextPath)}`);
      }

      return {
        ok: false,
        error: "Your sign-in expired. Please sign in again."
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: body?.message ?? "Request failed."
      };
    }

    return {
      ok: true,
      data: body as T
    };
  } catch {
    return {
      ok: false,
      error: "The hotel system could not be reached. Check the internet connection and try again."
    };
  }
}
