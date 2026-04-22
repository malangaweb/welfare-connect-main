import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePrivilegedRole, verifyAppJwtFromRequest } from "../_shared/app_jwt.ts";

import { corsHeaders } from "../_shared/cors.ts";

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const claims = await verifyAppJwtFromRequest(req);
    requirePrivilegedRole(claims.role);

    const mlgUrl = Deno.env.get("MLG_BULK_DEDUCT_URL");
    const internalKey = Deno.env.get("MLG_INTERNAL_BULK_KEY");
    if (!mlgUrl || !internalKey) {
      return jsonResponse(500, { error: "MLG bulk deduct not configured on server" });
    }

    const body = await req.json();
    const case_id = body?.case_id as string | undefined;
    const member_ids = body?.member_ids as string[] | undefined;
    if (!case_id || !Array.isArray(member_ids) || member_ids.length === 0) {
      return jsonResponse(400, { error: "case_id and member_ids[] required" });
    }

    const res = await fetch(mlgUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mlg-Internal-Key": internalKey,
      },
      body: JSON.stringify({ case_id, member_ids }),
    });

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }

    return new Response(JSON.stringify(parsed), {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const lower = msg.toLowerCase();
    if (msg === "Forbidden") {
      return jsonResponse(403, { error: "Forbidden" });
    }
    if (
      lower.includes("missing bearer token") ||
      lower.includes("jwt") ||
      lower.includes("signature") ||
      lower.includes("exp") ||
      lower.includes("app_jwt_secret")
    ) {
      return jsonResponse(401, { error: msg });
    }
    return jsonResponse(500, { error: msg });
  }
});
