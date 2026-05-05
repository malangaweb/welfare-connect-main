import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { corsHeaders } from "../_shared/cors.ts";
import { requirePrivilegedRole, verifyAppJwtFromRequest } from "../_shared/app_jwt.ts";

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  try {
    const claims = await verifyAppJwtFromRequest(req);
    requirePrivilegedRole(claims.role);

    const body = await req.json().catch(() => ({}));
    const memberId = String(body?.member_id || "").trim();
    if (!memberId) {
      return jsonResponse(400, { error: "member_id is required" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data, error } = await supabase
      .rpc("get_member_reinstatement_precheck", { p_member_id: memberId });

    if (error) throw error;

    const precheck = Array.isArray(data) ? data[0] : null;
    if (!precheck) {
      return jsonResponse(404, { error: "Member not found" });
    }

    const { data: unpaidCases, error: unpaidError } = await supabase
      .rpc("get_member_unpaid_case_obligations", { p_member_id: memberId });

    if (unpaidError) throw unpaidError;

    return jsonResponse(200, {
      precheck,
      unpaid_cases: unpaidCases || [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Forbidden" ? 403 : msg.toLowerCase().includes("token") ? 401 : 500;
    return jsonResponse(status, { error: msg });
  }
});
