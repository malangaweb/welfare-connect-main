import { invokeWithAppToken } from "@/lib/appAuth";

type LogStatus = "info" | "warning" | "error";

type LogPayload = {
  action: string;
  tableName?: string;
  recordId?: string | null;
  status?: LogStatus;
  metadata?: Record<string, unknown>;
};

function trimText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

export async function logSystemEvent(payload: LogPayload): Promise<void> {
  const action = trimText(String(payload.action || "CLIENT_EVENT"), 120);
  const table_name = trimText(String(payload.tableName || "system"), 120);
  const record_id = payload.recordId ? trimText(String(payload.recordId), 120) : null;
  const status = payload.status || "info";
  const metadata = payload.metadata || {};

  try {
    await invokeWithAppToken("api-client-log", {
      action,
      table_name,
      record_id,
      status,
      metadata,
    });
  } catch (error) {
    // Never throw from logging. Logging must be side-effect only.
    console.warn("system log write failed", error);
  }
}

