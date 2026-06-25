import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { requirePrivilegedRole, verifyAppJwtFromRequest } from "../_shared/app_jwt.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const claims = await verifyAppJwtFromRequest(req);
    requirePrivilegedRole(claims.role);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const url = new URL(req.url);
    const method = req.method;

    // GET — list all templates
    if (method === "GET") {
      const { data, error } = await supabase
        .from("sms_templates")
        .select("trigger_key, label, description, category, raw_template, is_active, updated_at")
        .order("category")
        .order("label");

      if (error) throw error;
      return new Response(JSON.stringify({ templates: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST — update a single template (frontend invokeWithAppToken uses POST)
    if (method === "POST") {
      const body = await req.json();
      const triggerKey = String(body.trigger_key || "").trim();
      if (!triggerKey) {
        return new Response(JSON.stringify({ error: "trigger_key is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updates: Record<string, unknown> = {};
      if (body.label !== undefined) updates.label = String(body.label).trim();
      if (body.description !== undefined) updates.description = String(body.description).trim();
      if (body.raw_template !== undefined) updates.raw_template = String(body.raw_template).trim();
      if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);

      if (Object.keys(updates).length === 0) {
        return new Response(JSON.stringify({ error: "No fields to update" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      updates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from("sms_templates")
        .update(updates)
        .eq("trigger_key", triggerKey)
        .select("trigger_key, label, description, category, raw_template, is_active, updated_at")
        .single();

      if (error) throw error;
      return new Response(JSON.stringify({ template: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    if (msg === "Forbidden") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
