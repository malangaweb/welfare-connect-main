import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT } from "https://esm.sh/jose@5.9.6";

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

function normalizePhone(value: string): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("254")) {
    return digits;
  }
  if (digits.startsWith("0")) {
    return `254${digits.slice(1)}`;
  }
  return digits;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const appJwtSecret = Deno.env.get("APP_JWT_SECRET");
    if (!appJwtSecret) {
      return jsonResponse(500, { error: "Server auth secret not configured" });
    }

    const { member_number, phone_number } = await req.json();
    if (!member_number || !phone_number) {
      return jsonResponse(400, { error: "member_number and phone_number are required" });
    }

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, member_number, name, phone_number, is_active, wallet_balance")
      .eq("member_number", String(member_number))
      .maybeSingle();

    if (memberError || !member) {
      return jsonResponse(401, { error: "Invalid member credentials" });
    }

    if (!member.is_active) {
      return jsonResponse(403, { error: "Member account is inactive" });
    }

    const suppliedPhone = normalizePhone(String(phone_number));
    const storedPhone = normalizePhone(String(member.phone_number || ""));
    if (!storedPhone || suppliedPhone !== storedPhone) {
      return jsonResponse(401, { error: "Invalid member credentials" });
    }

    const token = await new SignJWT({
      role: "member",
      member_id: member.id,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(member.id)
      .setIssuedAt()
      .setExpirationTime("12h")
      .sign(new TextEncoder().encode(appJwtSecret));

    await supabase.from("audit_logs").insert({
      action: "LOGIN",
      table_name: "members",
      record_id: member.id,
      status: "success",
    }).throwOnError();

    return jsonResponse(200, {
      app_token: token,
      member: {
        id: member.id,
        member_number: member.member_number,
        name: member.name,
        phone_number: member.phone_number,
        wallet_balance: member.wallet_balance,
        is_active: member.is_active,
      },
    });
  } catch (error) {
    console.error("auth-member-login error:", error);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
