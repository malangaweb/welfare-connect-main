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
    requireMemberManagementRole(claims.role);

    const body: Record<string, unknown> = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);

    const search = String(url.searchParams.get("search") ?? body.search ?? "").trim();
    const status = String(url.searchParams.get("status") ?? body.status ?? "all").trim().toLowerCase();
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? body.limit ?? 100), 1), 300);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? body.offset ?? 0), 0);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let query = supabase
      .from("members")
      .select("id, member_number, name, phone_number, wallet_balance, is_active, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(
        `member_number.ilike.%${search}%,name.ilike.%${search}%,phone_number.ilike.%${search}%`,
      );
    }

    if (status === "active") {
      query = query.eq("is_active", true);
    } else if (status === "inactive") {
      query = query.eq("is_active", false);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return jsonResponse(200, {
      members: data || [],
      total: count || 0,
      limit,
      offset,
      has_more: (count || 0) > offset + limit,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return jsonResponse(msg === "Forbidden" ? 403 : 401, { error: msg });
  }
});
