import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.9.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-token",
};

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
  for (const selector of selectors) {
    const byId = await supabase
      .from("members")
      .select("id, member_number, name, wallet_balance, is_active")
      .eq("id", selector)
      .maybeSingle();

    if (byId.data) {
      return byId.data;
    }
    if (byId.error && !isInvalidUuidError(byId.error)) {
      throw byId.error;
    }

    const byMemberNumber = await supabase
      .from("members")
      .select("id, member_number, name, wallet_balance, is_active")
      .eq("member_number", selector)
      .maybeSingle();

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

    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select("id, case_id, amount, transaction_type, description, created_at, status, mpesa_reference")
      .eq("member_id", resolvedMemberId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (txError) {
      throw txError;
    }

    const { data: activeCases, error: casesError } = await supabase
      .from("cases")
      .select("id, case_number, case_type, contribution_per_member, is_active, is_finalized, start_date, end_date")
      .eq("is_active", true)
      .eq("is_finalized", false);

    if (casesError) {
      throw casesError;
    }

    const caseIds = (activeCases || []).map((c) => c.id);
    let paidCaseIds = new Set<string>();

    if (caseIds.length > 0) {
      const { data: caseTx } = await supabase
        .from("transactions")
        .select("case_id, status")
        .eq("member_id", resolvedMemberId)
        .in("case_id", caseIds)
        .in("transaction_type", ["contribution", "case_wallet_deduction"]);

      paidCaseIds = new Set(
        (caseTx || [])
          .filter((r) => !r.status || r.status === "completed")
          .map((r) => String(r.case_id)),
      );
    }

    const activeCasesSummary = (activeCases || []).map((c) => ({
      ...c,
      paid: paidCaseIds.has(String(c.id)),
    }));

    return jsonResponse(200, {
      member: {
        id: member.id,
        member_number: member.member_number,
        name: member.name,
        wallet_balance: member.wallet_balance,
        is_active: member.is_active,
      },
      wallet_balance: member.wallet_balance,
      recent_transactions: transactions || [],
      active_cases_summary: activeCasesSummary,
    });
  } catch (error: unknown) {
    console.error("api-member-summary error:", error);
    return jsonResponse(401, { error: "Unauthorized or invalid request" });
  }
});
