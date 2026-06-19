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
    const amount = Number(body?.amount || 0);
    const description = body?.description == null ? null : String(body.description);
    const mpesaReference = body?.mpesa_reference == null ? null : String(body.mpesa_reference);

    if (!memberId) return jsonResponse(400, { error: "member_id is required" });
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonResponse(400, { error: "amount must be greater than zero" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data, error } = await supabase.rpc("admin_record_wallet_funding", {
      p_admin_id: claims?.sub ? String(claims.sub) : null,
      p_member_id: memberId,
      p_amount: amount,
      p_description: description,
      p_mpesa_reference: mpesaReference,
    });

    if (error) throw error;

    const result = (data as Record<string, unknown>) || {};

    return jsonResponse(200, result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Forbidden" ? 403 : msg.toLowerCase().includes("token") ? 401 : 500;
    return jsonResponse(status, { error: msg });
  }
});
