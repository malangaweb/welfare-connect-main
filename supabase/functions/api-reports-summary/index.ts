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

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!["GET", "POST"].includes(req.method)) return jsonResponse(405, { error: "Method not allowed" });

  try {
    const claims = await verifyAppJwtFromRequest(req);
    requirePrivilegedRole(claims.role);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    const [
      { count: totalMembers, error: membersCountErr },
      { count: activeMembers, error: activeMembersErr },
      { count: totalCases, error: casesCountErr },
      { count: activeCases, error: activeCasesErr },
      { count: totalTransactions, error: txCountErr },
      { count: defaulters, error: defaultersErr },
      { data: monthTx, error: monthTxErr },
      { data: suspenseRows, error: suspenseErr },
    ] = await Promise.all([
      supabase.from("members").select("id", { count: "exact", head: true }),
      supabase.from("members").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("cases").select("id", { count: "exact", head: true }),
      supabase.from("cases").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("transactions").select("id", { count: "exact", head: true }),
      supabase.from("members").select("id", { count: "exact", head: true }).lt("wallet_balance", 0),
      supabase
        .from("transactions")
        .select("amount, transaction_type, status")
        .gte("created_at", startOfMonth),
      supabase
        .from("wrong_mpesa_transactions")
        .select("amount")
        .in("status", ["pending", "PENDING_REVIEW"]),
    ]);

    if (membersCountErr) throw membersCountErr;
    if (activeMembersErr) throw activeMembersErr;
    if (casesCountErr) throw casesCountErr;
    if (activeCasesErr) throw activeCasesErr;
    if (txCountErr) throw txCountErr;
    if (defaultersErr) throw defaultersErr;
    if (monthTxErr) throw monthTxErr;
    if (suspenseErr) throw suspenseErr;

    const inflowTypes = new Set(["wallet_funding", "contribution", "case_wallet_deduction"]);
    const monthlyCollection = (monthTx || []).reduce((sum: number, row: any) => {
      const status = String(row.status || "").toLowerCase();
      if (!(status === "" || status === "completed" || status === "success")) return sum;
      if (!inflowTypes.has(String(row.transaction_type || ""))) return sum;
      return sum + Math.abs(toNum(row.amount));
    }, 0);

    const suspensePendingAmount = (suspenseRows || []).reduce(
      (sum: number, row: any) => sum + Math.abs(toNum(row.amount)),
      0,
    );

    return jsonResponse(200, {
      report: {
        total_members: totalMembers || 0,
        active_members: activeMembers || 0,
        total_cases: totalCases || 0,
        active_cases: activeCases || 0,
        total_transactions: totalTransactions || 0,
        defaulter_count: defaulters || 0,
        monthly_collection: monthlyCollection,
        suspense_pending_count: (suspenseRows || []).length,
        suspense_pending_amount: suspensePendingAmount,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return jsonResponse(msg === "Forbidden" ? 403 : 401, { error: msg });
  }
});
