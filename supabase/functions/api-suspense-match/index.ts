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
    const suspenseId = String(body?.suspense_id || "");
    const memberId = String(body?.member_id || "");
    const caseId = body?.case_id ? String(body.case_id) : null;
    if (!suspenseId || !memberId) {
      return jsonResponse(400, { error: "suspense_id and member_id required" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: suspense, error: suspenseErr } = await supabase
      .from("wrong_mpesa_transactions")
      .select("*")
      .eq("id", suspenseId)
      .maybeSingle();
    if (suspenseErr || !suspense) return jsonResponse(404, { error: "Suspense transaction not found" });

    const targetCaseId = caseId || suspense.intended_case_id || null;
    const txType = targetCaseId ? "contribution" : "wallet_funding";

    const { error: txErr } = await supabase.from("transactions").insert({
      member_id: memberId,
      case_id: targetCaseId,
      amount: suspense.amount,
      transaction_type: txType,
      payment_method: "mpesa",
      mpesa_reference: suspense.mpesa_receipt_number,
      reference: suspense.reference,
      description: targetCaseId
        ? `M-Pesa Case Payment matched from suspense - Ref: ${suspense.reference || "N/A"}`
        : `M-Pesa Wallet Funding matched from suspense - Ref: ${suspense.reference || "N/A"}`,
      status: "completed",
      created_at: suspense.transaction_date,
      metadata: {
        matched_from_suspense: true,
        suspense_id: suspense.id,
      },
    });
    if (txErr) throw txErr;

    const { error: updateErr } = await supabase
      .from("wrong_mpesa_transactions")
      .update({
        status: "matched",
        matched_member_id: memberId,
        intended_case_id: targetCaseId,
        matched_at: new Date().toISOString(),
      })
      .eq("id", suspenseId);
    if (updateErr) throw updateErr;

    return jsonResponse(200, { success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return jsonResponse(msg === "Forbidden" ? 403 : 401, { error: msg });
  }
});
