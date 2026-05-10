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
  if (digits.length === 9 && digits.startsWith("7")) {
    return `254${digits}`;
  }
  if (digits.startsWith("0")) {
    return `254${digits.slice(1)}`;
  }
  return digits;
}

function memberNumberCandidates(value: unknown): string[] {
  const raw = String(value ?? "").trim();
  const upper = raw.toUpperCase();
  const withoutPrefix = upper.startsWith("M") ? upper.slice(1).trim() : upper;
  const digits = withoutPrefix.replace(/\D/g, "");
  const digitsNoLeadingZero = digits.replace(/^0+/, "");

  const candidates = [raw, upper, withoutPrefix, digits, digitsNoLeadingZero]
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

  return Array.from(new Set(candidates));
}

async function findMemberByNumber(
  supabase: ReturnType<typeof createClient>,
  input: unknown,
) {
  const candidates = memberNumberCandidates(input);
  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from("members")
      .select("id, member_number, name, phone_number, is_active, wallet_balance")
      .eq("member_number", candidate)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (data) {
      return data;
    }
  }

  return null;
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

    const member = await findMemberByNumber(supabase, member_number);
    if (!member) {
      return jsonResponse(401, { error: "Invalid member credentials" });
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
