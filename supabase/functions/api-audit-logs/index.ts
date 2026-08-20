import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { corsHeaders } from "../_shared/cors.ts";
import { requirePrivilegedRole, verifyAppJwtFromRequest } from "../_shared/app_jwt.ts";

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const AUDIT_LOG_COLUMNS =
  "id, user_id, member_id, action, table_name, record_id, status, metadata, timestamp, created_at";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  try {
    const claims = await verifyAppJwtFromRequest(req);
    requirePrivilegedRole(claims.role);

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(500, Math.max(1, Number(body.limit || 100) || 100));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data, error } = await supabase
      .from("audit_logs")
      .select(AUDIT_LOG_COLUMNS)
      .order("timestamp", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return jsonResponse(200, { logs: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Forbidden" ? 403 : 500;
    return jsonResponse(status, { error: message });
  }
});