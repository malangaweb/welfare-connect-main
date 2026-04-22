import { supabase } from "@/integrations/supabase/client";

const APP_TOKEN_KEY = "app_token";

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

export function normalizePhone(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  return digits;
}

export async function invokeWithAppToken<T = unknown>(
  functionName: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const token = getAppToken();
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (error) {
    throw new Error(error.message || "Request failed");
  }

  return data as T;
}
