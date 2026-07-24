import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireMemberManagementRole, verifyAppJwtFromRequest } from "../_shared/app_jwt.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const claims = await verifyAppJwtFromRequest(req);
    requireMemberManagementRole(claims.role);

    const body = await req.json();
    const caseId = String(body?.case_id || "").trim();
    if (!caseId) {
      return new Response(JSON.stringify({ error: "case_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: caseRow, error: caseErr } = await supabase
      .from("cases")
      .select("id, case_number")
      .eq("id", caseId)
      .maybeSingle();

    if (caseErr || !caseRow) {
      return new Response(JSON.stringify({ error: "Case not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: members, error: memberErr } = await supabase
      .from("members")
      .select("id")
      .gt("wallet_balance", 0);

    if (memberErr) throw memberErr;

    const results: Array<{ member_id: string; success: boolean; error?: string }> = [];

    for (const member of members || []) {
      const { data: applies } = await supabase.rpc("member_case_obligation_applies", {
        p_member_id: member.id,
        p_case_id: caseId,
      });

      if (!applies) continue;

      try {
        const { data: wfResult, error: wfErr } = await supabase.rpc(
          "apply_wallet_payment_waterfall",
          { p_member_id: member.id },
        );

        if (wfErr) {
          results.push({ member_id: member.id, success: false, error: wfErr.message });
        } else {
          results.push({ member_id: member.id, success: true });
        }
      } catch (wfErr) {
        results.push({
          member_id: member.id,
          success: false,
          error: wfErr instanceof Error ? wfErr.message : String(wfErr),
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        case_id: caseId,
        case_number: caseRow.case_number,
        processed: results.length,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in api-trigger-waterfall:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "An error occurred",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
