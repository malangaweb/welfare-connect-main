import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcryptjs from "https://esm.sh/bcryptjs@2.4.3";
import { SignJWT } from "https://esm.sh/jose@5.9.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_ROLES = new Set(["super_admin", "chairperson", "treasurer", "secretary"]);

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeRole(role: unknown): string {
  return String(role || "").toLowerCase().trim();
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

    const { username, password } = await req.json();
    if (!username || !password) {
      return jsonResponse(400, { error: "Username and password are required" });
    }

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, username, name, email, password, role, member_id, is_active")
      .eq("username", String(username))
      .maybeSingle();

    if (userError || !user) {
      return jsonResponse(401, { error: "Invalid credentials" });
    }

    if (!user.is_active) {
      return jsonResponse(403, { error: "Account is inactive" });
    }

    const role = normalizeRole(user.role);
    if (!ADMIN_ROLES.has(role)) {
      return jsonResponse(403, { error: "This account is not allowed in admin login" });
    }

    const storedPassword = String(user.password || "");
    let passwordValid = false;
    if (storedPassword.startsWith("$2")) {
      passwordValid = await bcryptjs.compare(String(password), storedPassword);
    } else {
      passwordValid = String(password) === storedPassword;
    }

    if (!passwordValid) {
      await supabase.from("audit_logs").insert({
        action: "LOGIN_FAILED",
        table_name: "users",
        record_id: user.id,
        status: "failed",
      }).throwOnError();

      return jsonResponse(401, { error: "Invalid credentials" });
    }

    const token = await new SignJWT({
      role,
      member_id: user.member_id ?? null,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime("12h")
      .sign(new TextEncoder().encode(appJwtSecret));

    await supabase.from("audit_logs").insert({
      action: "LOGIN",
      table_name: "users",
      record_id: user.id,
      status: "success",
    }).throwOnError();

    return jsonResponse(200, {
      app_token: token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        member_id: user.member_id,
        is_active: user.is_active,
      },
    });
  } catch (error) {
    console.error("auth-admin-login error:", error);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
