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

function normalizeCandidate(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v.length > 0 ? v : null;
}

function isInvalidUuidError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = String(error.message || "").toLowerCase();
  return error.code === "22P02" || msg.includes("invalid input syntax for type uuid");
}

async function resolveMemberId(
  supabase: ReturnType<typeof createClient>,
  selectors: string[],
): Promise<string | null> {
  for (const selector of selectors) {
    const byId = await supabase
      .from("members")
      .select("id")
      .eq("id", selector)
      .maybeSingle();

    if (byId.data?.id) {
      return String(byId.data.id);
    }
    if (byId.error && !isInvalidUuidError(byId.error)) {
      throw byId.error;
    }

    const byMemberNumber = await supabase
      .from("members")
      .select("id")
      .eq("member_number", selector)
      .maybeSingle();

    if (byMemberNumber.error) {
      throw byMemberNumber.error;
    }
    if (byMemberNumber.data?.id) {
      return String(byMemberNumber.data.id);
    }
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!["GET", "POST"].includes(req.method)) return jsonResponse(405, { error: "Method not allowed" });

  try {
    const claims = await verifyAppJwtFromRequest(req);
    requireMemberManagementRole(claims.role);

    const body: Record<string, unknown> = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);

    const selectors = Array.from(
      new Set(
        [
          url.searchParams.get("member_id"),
          body.member_id,
          url.searchParams.get("member_number"),
          body.member_number,
        ]
          .map(normalizeCandidate)
          .filter((v): v is string => v != null),
      ),
    );

    if (selectors.length === 0) {
      return jsonResponse(400, { error: "member_id or member_number is required" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const memberId = await resolveMemberId(supabase, selectors);
    if (!memberId) {
      return jsonResponse(404, { error: "Member not found" });
    }

    const { data: member, error: memberErr } = await supabase
      .from("members")
      .select("id, member_number, name, phone_number, email, wallet_balance, is_active, created_at")
      .eq("id", memberId)
      .maybeSingle();

    if (memberErr || !member) {
      return jsonResponse(404, { error: "Member not found" });
    }

    const { data: cases, error: casesErr } = await supabase
      .from("cases")
      .select("id, case_number, case_type, contribution_per_member, expected_amount, actual_amount, is_active, is_finalized, created_at")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (casesErr) throw casesErr;

    const { data: transactions, error: txErr } = await supabase
      .from("transactions")
      .select("id, amount, transaction_type, payment_method, mpesa_reference, reference, description, status, created_at, case_id")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false })
      .limit(40);

    if (txErr) throw txErr;

    return jsonResponse(200, {
      member,
      cases: cases || [],
      transactions: transactions || [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return jsonResponse(msg === "Forbidden" ? 403 : 401, { error: msg });
  }
});
