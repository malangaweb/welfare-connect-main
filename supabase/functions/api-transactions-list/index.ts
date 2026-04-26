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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!["GET", "POST"].includes(req.method)) return jsonResponse(405, { error: "Method not allowed" });

  try {
    const claims = await verifyAppJwtFromRequest(req);
    requireFinanceRole(claims.role);

    const body: Record<string, unknown> = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);

    const page = Math.max(Number(url.searchParams.get("page") ?? body.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(url.searchParams.get("page_size") ?? body.page_size ?? 30), 1), 200);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const search = String(url.searchParams.get("search") ?? body.search ?? "").trim();
    const type = String(url.searchParams.get("type") ?? body.type ?? "all").trim();
    const status = String(url.searchParams.get("status") ?? body.status ?? "all").trim();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let query = supabase
      .from("transactions")
      .select(
        "id, member_id, case_id, amount, transaction_type, payment_method, mpesa_reference, reference, description, status, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (type != "all" && type.isNotEmpty) {
      query = query.eq("transaction_type", type);
    }

    if (status != "all" && status.isNotEmpty) {
      query = query.eq("status", status);
    }

    if (search.isNotEmpty) {
      query = query.or(
        `reference.ilike.%${search}%,mpesa_reference.ilike.%${search}%,description.ilike.%${search}%`,
      );
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const txList = data || [];
    const memberIds = Array.from(new Set(txList.map((t: any) => t.member_id).filter(Boolean)));

    let memberMap = new Map<string, { name: string | null; member_number: string | null }>();
    if (memberIds.length > 0) {
      const { data: members, error: membersErr } = await supabase
        .from("members")
        .select("id, name, member_number")
        .in("id", memberIds);

      if (membersErr) throw membersErr;

      memberMap = new Map(
        (members || []).map((m: any) => [
          String(m.id),
          {
            name: m.name ?? null,
            member_number: m.member_number ?? null,
          },
        ]),
      );
    }

    const transactions = txList.map((tx: any) => ({
      ...tx,
      member_name: memberMap.get(String(tx.member_id))?.name ?? null,
      member_number: memberMap.get(String(tx.member_id))?.member_number ?? null,
    }));

    return jsonResponse(200, {
      transactions,
      total: count || 0,
      page,
      page_size: pageSize,
      has_more: (count || 0) > to + 1,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return jsonResponse(msg === "Forbidden" ? 403 : 401, { error: msg });
  }
});
