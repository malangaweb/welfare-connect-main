import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.9.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function verifyToken(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) throw new Error("Missing bearer token");

  const appJwtSecret = Deno.env.get("APP_JWT_SECRET");
  if (!appJwtSecret) throw new Error("APP_JWT_SECRET is not configured");

  const verified = await jwtVerify(token, new TextEncoder().encode(appJwtSecret));
  return verified.payload as { role?: string; member_id?: string };
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
    const requestedMemberId = url.searchParams.get("member_id") || String(body["member_id"] || "") || null;
    const memberId = role === "member" ? claims.member_id : (requestedMemberId || claims.member_id);
    if (!memberId) {
      return jsonResponse(400, { error: "member_id is required" });
    }

    const page = Math.max(Number(url.searchParams.get("page") || body["page"] || 1), 1);
    const pageSize = Math.min(Math.max(Number(url.searchParams.get("page_size") || body["page_size"] || 20), 1), 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data, error, count } = await supabase
      .from("transactions")
      .select("id, member_id, case_id, amount, transaction_type, payment_method, mpesa_reference, reference, description, status, created_at", { count: "exact" })
      .eq("member_id", memberId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }

    return jsonResponse(200, {
      page,
      page_size: pageSize,
      total: count || 0,
      has_more: (count || 0) > to + 1,
      transactions: data || [],
    });
  } catch (error) {
    console.error("api-member-transactions error:", error);
    return jsonResponse(401, { error: "Unauthorized or invalid request" });
  }
});
