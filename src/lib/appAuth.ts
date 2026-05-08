import { supabase } from "@/integrations/supabase/client";

const APP_TOKEN_KEY = "app_token";
const MEMBER_SESSION_KEYS = [
  "member_user_id",
  "member_member_id",
  "member_name",
  "member_phone_number",
  "member_login_time",
];

export function getAppToken(): string | null {
  return localStorage.getItem(APP_TOKEN_KEY);
}

export function setAppToken(token: string): void {
  localStorage.setItem(APP_TOKEN_KEY, token);
  // Backward compatibility for existing guards that still read `token`.
  localStorage.setItem("token", token);
}

export function clearAppToken(): void {
  localStorage.removeItem(APP_TOKEN_KEY);
  localStorage.removeItem("token");
}

export function clearMemberSession(): void {
  clearAppToken();
  for (const key of MEMBER_SESSION_KEYS) {
    localStorage.removeItem(key);
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function isAppTokenExpired(token: string | null): boolean {
  if (!token) return true;
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  const exp = Number(payload.exp || 0);
  if (!exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return exp <= now;
}

export function normalizePhone(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.length === 9 && digits.startsWith("7")) return `254${digits}`;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  return digits;
}

async function readFunctionErrorMessage(context: unknown): Promise<string> {
  if (!context || typeof context !== "object") return "";
  const cloneFn = (context as { clone?: unknown }).clone;
  if (typeof cloneFn !== "function") return "";

  try {
    const cloned = (context as { clone: () => Response }).clone();
    const rawText = (await cloned.text().catch(() => "")).trim();
    if (!rawText) return "";

    try {
      const payload = JSON.parse(rawText) as Record<string, unknown>;
      const message = String(payload?.error || payload?.message || "").trim();
      if (message) return message;
    } catch {
      // Non-JSON payloads can still carry useful text (e.g. gateway/internal errors).
    }

    return rawText;
  } catch {
    return "";
  }
}

export async function invokeWithAppToken<T = unknown>(
  functionName: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const token = getAppToken();
  if (!token || isAppTokenExpired(token)) {
    clearMemberSession();
    throw new Error("Session expired. Please login again.");
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    // Keep Authorization reserved for Supabase gateway auth; send app JWT in custom header.
    headers: { "x-app-token": token },
  });

  if (error) {
    const message = String(error.message || "");
    const status = Number((error as any).context?.status || 0);
    const ctx = (error as any).context;
    const backendMessage = await readFunctionErrorMessage(ctx);

    const combinedAuthMessage = `${message} ${backendMessage}`.toLowerCase();
    const isSessionExpired =
      status === 401 &&
      /session expired|jwt expired|invalid token|missing bearer token|unauthorized or invalid request|signature verification|verification failed/.test(combinedAuthMessage);
    if (isSessionExpired) {
      clearMemberSession();
      throw new Error("Session expired. Please login again.");
    }

    if (
      status === 401 &&
      !backendMessage &&
      /unexpected end of json input/i.test(message)
    ) {
      throw new Error("Unauthorized request to function. Please log in again and retry.");
    }

    if (
      status >= 500 &&
      !backendMessage &&
      /unexpected end of json input/i.test(message)
    ) {
      throw new Error(`Server error in ${functionName}. Please try again shortly.`);
    }

    if (
      /unexpected end of json input/i.test(message) ||
      /unexpected end of json input/i.test(backendMessage)
    ) {
      throw new Error(`Server error in ${functionName}. The function returned an empty or invalid response.`);
    }

    throw new Error(backendMessage || error.message || "Request failed");
  }

  return data as T;
}
