import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { corsHeaders } from "../_shared/cors.ts";
import { requireFinanceRole, verifyAppJwtFromRequest } from "../_shared/app_jwt.ts";

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!["GET", "POST"].includes(req.method)) return jsonResponse(405, { error: "Method not allowed" });

  try {
    const claims = await verifyAppJwtFromRequest(req);
    requireFinanceRole(claims.role);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const [{ data: members, error: membersErr }, { data: txRows, error: txErr }, { data: suspenseRows, error: suspenseErr }] =
      await Promise.all([
        supabase.from("members").select("id, is_active, wallet_balance"),
        supabase
          .from("transactions")
          .select("amount, transaction_type, status")
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("wrong_mpesa_transactions")
          .select("amount, status")
          .in("status", ["pending", "PENDING_REVIEW"]),
      ]);

    if (membersErr) throw membersErr;
    if (txErr) throw txErr;
    if (suspenseErr) throw suspenseErr;

    const memberList = members || [];
    const walletBalance = memberList.reduce((sum: number, m: any) => sum + toNum(m.wallet_balance), 0);
    const activeMembers = memberList.filter((m: any) => m.is_active === true).length;

    const completed = (txRows || []).filter((t: any) => {
      const status = String(t.status || "").toLowerCase();
      return status.length === 0 || status === "completed" || status === "success";
    });

    const contributionTypes = new Set(["contribution", "case_wallet_deduction"]);
    const fundingTypes = new Set(["wallet_funding"]);
    const refundTypes = new Set(["contribution_refund", "case_wallet_refund", "refund", "wallet_refund"]);

    let contributions = 0;
    let walletFunding = 0;
    let refunds = 0;

    for (const row of completed) {
      const txType = String((row as any).transaction_type || "");
      const amount = toNum((row as any).amount);
      if (contributionTypes.has(txType)) contributions += Math.abs(amount);
      if (fundingTypes.has(txType)) walletFunding += Math.abs(amount);
      if (refundTypes.has(txType)) refunds += Math.abs(amount);
    }

    const suspenseList = suspenseRows || [];
    const suspensePendingCount = suspenseList.length;
    const suspensePendingAmount = suspenseList.reduce(
      (sum: number, row: any) => sum + Math.abs(toNum(row.amount)),
      0,
    );

    return jsonResponse(200, {
      accounts: {
        active_members: activeMembers,
        total_members: memberList.length,
        wallet_balance_total: walletBalance,
        contributions_total: contributions,
        wallet_funding_total: walletFunding,
        refunds_total: refunds,
        suspense_pending_count: suspensePendingCount,
        suspense_pending_amount: suspensePendingAmount,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return jsonResponse(msg === "Forbidden" ? 403 : 401, { error: msg });
  }
});
