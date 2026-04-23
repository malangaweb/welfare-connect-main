import { jwtVerify } from "https://esm.sh/jose@5.9.6";

export type AppJwtPayload = {
  sub?: string;
  role?: string;
  member_id?: string;
  member_number?: string;
};

export async function verifyAppJwtFromRequest(req: Request): Promise<AppJwtPayload> {
  const appTokenHeader = req.headers.get("x-app-token") || "";
  if (appTokenHeader) {
    const appJwtSecret = Deno.env.get("APP_JWT_SECRET");
    if (!appJwtSecret) {
      throw new Error("APP_JWT_SECRET is not configured");
    }
    const verified = await jwtVerify(appTokenHeader, new TextEncoder().encode(appJwtSecret));
    return verified.payload as AppJwtPayload;
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    throw new Error("Missing bearer token");
  }

  const appJwtSecret = Deno.env.get("APP_JWT_SECRET");
  if (!appJwtSecret) {
    throw new Error("APP_JWT_SECRET is not configured");
  }

  const verified = await jwtVerify(token, new TextEncoder().encode(appJwtSecret));
  return verified.payload as AppJwtPayload;
}

export function requirePrivilegedRole(role: string | undefined): void {
  const r = String(role || "").toLowerCase();
  const allowed = new Set(["super_admin", "chairperson", "treasurer", "secretary"]);
  if (!allowed.has(r)) {
    throw new Error("Forbidden");
  }
}
