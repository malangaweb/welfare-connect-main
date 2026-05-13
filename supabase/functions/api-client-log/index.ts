import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { corsHeaders } from "../_shared/cors.ts";
import { verifyAppJwtFromRequest } from "../_shared/app_jwt.ts";

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asSafeString(value: unknown, fallback: string): string {
  const str = String(value ?? "").trim();
  return str || fallback;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  try {
    const claims = await verifyAppJwtFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const action = asSafeString(body?.action, "CLIENT_EVENT");
    const tableName = asSafeString(body?.table_name, "system");
    const status = asSafeString(body?.status, "info");
    const recordId = body?.record_id ? String(body.record_id) : null;
    const metadata = body?.metadata && typeof body.metadata === "object" ? body.metadata : null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { error } = await supabase.from("audit_logs").insert({
      action,
      table_name: tableName,
      record_id: recordId,
      status,
      user_id: claims?.sub ? String(claims.sub) : null,
      member_id: claims?.member_id ? String(claims.member_id) : null,
      metadata,
    });

    if (error) throw error;

    return jsonResponse(200, { success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Forbidden" ? 403 : msg.toLowerCase().includes("token") ? 401 : 500;
    return jsonResponse(status, { error: msg });
  }
});

