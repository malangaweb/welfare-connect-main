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

    const startedAt = new Date().toISOString();

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

    let totalMembersEligible = 0;
    let membersProcessed = 0;
    let finalizedCasesPaid = 0;
    let activeCasesPaid = 0;
    let penaltyPayments = 0;
    let reactivations = 0;
    const errors: Array<{ member_id: string; error: string }> = [];

    for (const member of members || []) {
      const { data: applies } = await supabase.rpc("member_case_obligation_applies", {
        p_member_id: member.id,
        p_case_id: caseId,
      });

      if (!applies) continue;

      totalMembersEligible++;

      try {
        const { data: wfResult, error: wfErr } = await supabase.rpc(
          "apply_wallet_payment_waterfall",
          { p_member_id: member.id },
        );

        if (wfErr) {
          errors.push({ member_id: member.id, error: wfErr.message });
          continue;
        }

        membersProcessed++;

        const result = (wfResult || {}) as Record<string, unknown>;
        if (result.skipped) continue;

        finalizedCasesPaid += Number(result.finalized_cases_paid || 0);
        activeCasesPaid += Number(result.active_cases_paid || 0);
        penaltyPayments += Number(result.penalty_payments || 0);

        if (result.flipped_to === "probation") {
          reactivations++;
        }
      } catch (wfErr) {
        errors.push({
          member_id: member.id,
          error: wfErr instanceof Error ? wfErr.message : String(wfErr),
        });
      }
    }

    let membersMarkedInactive = 0;

    try {
      const { data: disciplineResults } = await supabase
        .rpc("check_and_apply_member_discipline");

      if (Array.isArray(disciplineResults)) {
        membersMarkedInactive = disciplineResults
          .filter((r: Record<string, unknown>) => r.action === "marked_inactive")
          .length;
      }
    } catch (discErr) {
      console.error("Discipline sweep error:", discErr);
    }

    const completedAt = new Date().toISOString();

    const auditPayload = {
      case_id: caseId,
      case_number: caseRow.case_number,
      total_members_eligible: totalMembersEligible,
      members_processed: membersProcessed,
      finalized_cases_paid: finalizedCasesPaid,
      active_cases_paid: activeCasesPaid,
      penalty_payments: penaltyPayments,
      reactivations: reactivations,
      members_marked_inactive: membersMarkedInactive,
      errors: errors,
      started_at: startedAt,
      completed_at: completedAt,
    };

    try {
      await supabase.from("case_creation_audit").insert(auditPayload);
    } catch (auditErr) {
      console.error("Audit insert error:", auditErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        case_id: caseId,
        case_number: caseRow.case_number,
        summary: {
          total_members_eligible: totalMembersEligible,
          members_processed: membersProcessed,
          finalized_cases_paid: finalizedCasesPaid,
          active_cases_paid: activeCasesPaid,
          penalty_payments: penaltyPayments,
          reactivations: reactivations,
          members_marked_inactive: membersMarkedInactive,
          errors: errors.length,
        },
        errors: errors.length > 0 ? errors : undefined,
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
