import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { corsHeaders } from "../_shared/cors.ts";
import { requireMemberManagementRole, verifyAppJwtFromRequest } from "../_shared/app_jwt.ts";

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
    if (role !== "member") {
      requireMemberManagementRole(role);
    }
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const caseId = url.searchParams.get("case_id") || String((body as any).case_id || "");
    if (!caseId) return jsonResponse(400, { error: "case_id is required" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: c, error: cErr } = await supabase
      .from("cases")
      .select("*")
      .eq("id", caseId)
      .maybeSingle();
    if (cErr || !c) return jsonResponse(404, { error: "Case not found" });

    const { data: tx } = await supabase
      .from("transactions")
      .select("id, member_id, amount, transaction_type, status, created_at")
      .eq("case_id", caseId)
      .in("transaction_type", ["contribution", "contribution_refund", "case_wallet_deduction", "case_wallet_refund"])
      .order("created_at", { ascending: false });

    const completed = (tx || []).filter((t: any) => !t.status || t.status === "completed");
    const contributions = completed
      .filter((t: any) => ["contribution", "case_wallet_deduction"].includes(t.transaction_type))
      .reduce((sum: number, t: any) => sum + Math.abs(Number(t.amount) || 0), 0);
    const refunds = completed
      .filter((t: any) => ["contribution_refund", "case_wallet_refund"].includes(t.transaction_type))
      .reduce((sum: number, t: any) => sum + Math.max(Number(t.amount) || 0, 0), 0);
    const net = Math.max(0, contributions - refunds);

    let paid: boolean | null = null;
    if (role === "member" && claims.member_id) {
      paid = completed.some((t: any) =>
        String(t.member_id) === String(claims.member_id) &&
        ["contribution", "case_wallet_deduction"].includes(t.transaction_type),
      );
    }

    return jsonResponse(200, {
      case: {
        ...c,
        actual_amount: net,
        paid,
      },
      transactions: completed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return jsonResponse(msg === "Forbidden" ? 403 : 401, { error: msg });
  }
});
