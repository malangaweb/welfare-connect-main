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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!["GET", "POST"].includes(req.method)) return jsonResponse(405, { error: "Method not allowed" });

  try {
    const claims = await verifyAppJwtFromRequest(req);
    const role = String(claims.role || "").toLowerCase();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: cases, error: caseError } = await supabase
      .from("cases")
      .select("id, case_number, case_type, contribution_per_member, expected_amount, actual_amount, is_active, is_finalized, created_at")
      .order("created_at", { ascending: false });
    if (caseError) throw caseError;

    let memberCount = 0;
    const { count } = await supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    memberCount = count || 0;

    let paidCaseIds = new Set<string>();
    if (role === "member" && claims.member_id && (cases || []).length > 0) {
      const ids = (cases || []).map((c: any) => c.id);
      const { data: tx } = await supabase
        .from("transactions")
        .select("case_id, status")
        .eq("member_id", claims.member_id)
        .in("case_id", ids)
        .in("transaction_type", ["contribution", "case_wallet_deduction"]);
      paidCaseIds = new Set(
        (tx || []).filter((t: any) => !t.status || t.status === "completed").map((t: any) => String(t.case_id)),
      );
    }

    const mapped = (cases || []).map((c: any) => ({
      ...c,
      expected_amount:
        c.expected_amount ?? ((Number(c.contribution_per_member) || 0) * memberCount),
      paid: role === "member" ? paidCaseIds.has(String(c.id)) : null,
    }));

    return jsonResponse(200, { cases: mapped });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return jsonResponse(msg === "Forbidden" ? 403 : 401, { error: msg });
  }
});
