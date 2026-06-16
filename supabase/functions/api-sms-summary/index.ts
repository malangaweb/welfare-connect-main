import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { corsHeaders } from "../_shared/cors.ts";
import { requirePrivilegedRole, verifyAppJwtFromRequest } from "../_shared/app_jwt.ts";
import { fetchSmsBalance } from "../_shared/sms.ts";

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  try {
    const claims = await verifyAppJwtFromRequest(req);
    requirePrivilegedRole(claims.role);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const [sentCount, deliveredCount, failedCount, topUpRows, recentRows, balanceResult] = await Promise.all([
      supabase.from("audit_logs").select("id", { count: "exact", head: true }).eq("table_name", "sms").eq("action", "SMS_SENT"),
      supabase.from("audit_logs").select("id", { count: "exact", head: true }).eq("table_name", "sms").eq("action", "SMS_DELIVERED"),
      supabase.from("audit_logs").select("id", { count: "exact", head: true }).eq("table_name", "sms").eq("action", "SMS_FAILED"),
      supabase.from("audit_logs").select("metadata, timestamp").eq("table_name", "sms").eq("action", "SMS_TOP_UP_RECORDED").order("timestamp", { ascending: false }),
      supabase.from("audit_logs").select("action, status, metadata, timestamp").eq("table_name", "sms").order("timestamp", { ascending: false }).limit(12),
      fetchSmsBalance().catch((error) => ({ balance: null, raw: { error: error instanceof Error ? error.message : String(error) } })),
    ]);

    const topUpTotal = (topUpRows.data || []).reduce((sum, row: any) => {
      const amount = Number(row?.metadata?.amount ?? row?.metadata?.top_up_amount ?? 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);

    return jsonResponse(200, {
      sent: sentCount.count || 0,
      delivered: deliveredCount.count || 0,
      failed: failedCount.count || 0,
      balance: balanceResult.balance,
      topUpTotal,
      recent: recentRows.data || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Forbidden" ? 403 : 500;
    return jsonResponse(status, { error: message });
  }
});

