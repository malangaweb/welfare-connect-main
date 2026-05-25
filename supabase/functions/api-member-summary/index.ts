import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.9.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-token",
};
const FINANCE_ROLES = new Set(["super_admin", "treasurer"]);

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeCandidate(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v.length > 0 ? v : null;
}

function isInvalidUuidError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = String(error.message || "").toLowerCase();
  return error.code === "22P02" || msg.includes("invalid input syntax for type uuid");
}

async function resolveMember(
  supabase: ReturnType<typeof createClient>,
  selectors: string[],
) {
  const memberSelect = "id, member_number, name, wallet_balance, is_active, status";

  for (const selector of selectors) {
    const [byId, byMemberNumber] = await Promise.all([
      supabase.from("members").select(memberSelect).eq("id", selector).maybeSingle(),
      supabase.from("members").select(memberSelect).eq("member_number", selector).maybeSingle(),
    ]);

    if (byId.data) {
      return byId.data;
    }
    if (byId.error && !isInvalidUuidError(byId.error)) {
      throw byId.error;
    }

    if (byMemberNumber.error) {
      throw byMemberNumber.error;
    }
    if (byMemberNumber.data) {
      return byMemberNumber.data;
    }
  }
  return null;
}

async function verifyToken(req: Request) {
  const appTokenHeader = req.headers.get("x-app-token") || "";
  if (appTokenHeader) {
    const appJwtSecret = Deno.env.get("APP_JWT_SECRET");
    if (!appJwtSecret) {
      throw new Error("APP_JWT_SECRET is not configured");
    }
    const verified = await jwtVerify(appTokenHeader, new TextEncoder().encode(appJwtSecret));
    return verified.payload as { sub?: string; role?: string; member_id?: string; member_number?: string };
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    throw new Error("Missing bearer token");
  }

  const appJwtSecret = Deno.env.get("APP_JWT_SECRET");
  if (!appJwtSecret) {
    throw new Error("APP_JWT_SECRET is not configured");
  }

  const verified = await jwtVerify(token, new TextEncoder().encode(appJwtSecret));
  return verified.payload as { sub?: string; role?: string; member_id?: string; member_number?: string };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!["GET", "POST"].includes(req.method)) {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const claims = await verifyToken(req);
    const role = String(claims.role || "").toLowerCase();
    if (role !== "member" && !FINANCE_ROLES.has(role)) {
      throw new Error("Forbidden");
    }
    const url = new URL(req.url);
    const body: Record<string, unknown> = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const requestedMemberId = normalizeCandidate(url.searchParams.get("member_id") ?? body["member_id"]);
    const selectors = Array.from(
      new Set(
        (role === "member"
          ? [claims.member_id, claims.sub, claims.member_number, requestedMemberId]
          : [requestedMemberId, claims.member_id, claims.sub])
          .map(normalizeCandidate)
          .filter((v): v is string => v != null),
      ),
    );

    if (selectors.length === 0) {
      return jsonResponse(400, { error: "member_id is required" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const member = await resolveMember(supabase, selectors);
    if (!member) {
      return jsonResponse(404, { error: "Member not found" });
    }

    const resolvedMemberId = String(member.id);

    // Run independent reads in parallel; avoid loading full case history (was limit 1000).
    const casesSelect =
      "id, case_number, case_type, contribution_per_member, is_active, is_finalized, start_date, end_date";
    const payableCaseFilter =
      "is_active.eq.true,is_finalized.eq.true,end_date.not.is.null";

    const [
      { data: streakRow, error: streakError },
      { data: transactions, error: txError },
      { data: allCases, error: casesError },
    ] = await Promise.all([
      supabase
        .from("member_default_streaks")
        .select("current_streak, last_defaulted, updated_at")
        .eq("member_id", resolvedMemberId)
        .maybeSingle(),
      supabase
        .from("transactions")
        .select("id, case_id, amount, transaction_type, description, created_at, status, mpesa_reference")
        .eq("member_id", resolvedMemberId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("cases")
        .select(casesSelect)
        .or(payableCaseFilter)
        .order("created_at", { ascending: false })
        .limit(400),
    ]);

    if (streakError) throw streakError;
    if (txError) throw txError;
    if (casesError) throw casesError;

    const payableCandidates = (allCases || []).filter((c: any) =>
      Boolean(c?.is_active) || Boolean(c?.is_finalized) || Boolean(c?.end_date),
    );
    const caseIds = payableCandidates.map((c) => c.id);
    const netByCase = new Map<string, number>();

    if (caseIds.length > 0) {
      const { data: caseTx } = await supabase
        .from("transactions")
        .select("case_id, status, amount, transaction_type")
        .eq("member_id", resolvedMemberId)
        .in("case_id", caseIds)
        .in("transaction_type", [
          "contribution",
          "case_wallet_deduction",
          "arrears",
          "contribution_refund",
          "case_wallet_refund",
        ]);

      (caseTx || [])
        .filter((r) => !r.status || r.status === "completed")
        .forEach((r) => {
          const caseId = String(r.case_id || "");
          if (!caseId) return;
          const txType = String(r.transaction_type || "");
          const amount = Number(r.amount) || 0;
          const current = netByCase.get(caseId) || 0;
          if (txType === "contribution" || txType === "case_wallet_deduction" || txType === "arrears") {
            netByCase.set(caseId, current + Math.abs(amount));
            return;
          }
          if (txType === "contribution_refund" || txType === "case_wallet_refund") {
            netByCase.set(caseId, current - Math.abs(amount));
          }
        });
    }

    const activeCasesSummary = payableCandidates.map((c) => {
      const caseId = String(c.id || "");
      const required = Number(c.contribution_per_member) || 0;
      const rawNetPaid = netByCase.get(caseId) || 0;
      const amountPaid = Math.max(rawNetPaid, 0);
      const remainingAmount = Math.max(required - amountPaid, 0);
      const progress =
        required > 0 ? Math.min(amountPaid / required, 1) : amountPaid > 0 ? 1 : 0;

      return {
        ...c,
        amount_paid: amountPaid,
        remaining_amount: remainingAmount,
        progress,
        paid: required > 0 ? amountPaid >= required : amountPaid > 0,
        late_payment: Boolean(!c.is_active || c.is_finalized),
      };
    });

    return jsonResponse(200, {
      member: {
        id: member.id,
        member_number: member.member_number,
        name: member.name,
        wallet_balance: member.wallet_balance,
        is_active: member.is_active,
        status: (member as any).status || null,
      },
      wallet_balance: member.wallet_balance,
      discipline: {
        consecutive_default_streak: Number((streakRow as any)?.current_streak || 0),
        last_case_defaulted: Boolean((streakRow as any)?.last_defaulted || false),
        last_streak_updated_at: (streakRow as any)?.updated_at || null,
      },
      recent_transactions: transactions || [],
      active_cases_summary: activeCasesSummary,
    });
  } catch (error: unknown) {
    console.error("api-member-summary error:", error);
    const msg = error instanceof Error ? error.message : "Unauthorized or invalid request";
    if (msg === "Forbidden") return jsonResponse(403, { error: msg });
    return jsonResponse(401, { error: "Unauthorized or invalid request" });
  }
});
