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
    const caseId = String(body?.case_id || "").trim();
    const amount = Number(body?.amount || 0);
    const transactionType = String(body?.transaction_type || "case_wallet_deduction").trim().toLowerCase();
    const description = body?.description == null ? null : String(body.description);

    if (!memberId) return jsonResponse(400, { error: "member_id is required" });
    if (!caseId) return jsonResponse(400, { error: "case_id is required" });
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonResponse(400, { error: "amount must be greater than zero" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data, error } = await supabase.rpc("admin_record_case_payment", {
      p_admin_id: claims?.sub ? String(claims.sub) : null,
      p_member_id: memberId,
      p_case_id: caseId,
      p_amount: amount,
      p_transaction_type: transactionType,
      p_description: description,
    });

    if (error) throw error;

    const result = (data as Record<string, unknown>) || {};
    const success = result?.success !== false;

    return jsonResponse(success ? 200 : 400, result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Forbidden" ? 403 : msg.toLowerCase().includes("token") ? 401 : 500;
    return jsonResponse(status, { error: msg });
  }
});
