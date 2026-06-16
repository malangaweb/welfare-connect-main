// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { requirePrivilegedRole, verifyAppJwtFromRequest } from "../_shared/app_jwt.ts"
import { sendSmsMessage } from "../_shared/sms.ts"

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const claims = await verifyAppJwtFromRequest(req)
    requirePrivilegedRole(claims.role)

    const body = await req.json();
    const rawRecipients = Array.isArray(body?.recipients)
      ? body.recipients
      : body?.phoneNumbers
        ? body.phoneNumbers
        : body?.phoneNumber
          ? [body.phoneNumber]
          : [];
    const message = String(body?.message || '').trim();
    const triggerKey = String(body?.triggerKey || body?.trigger_key || 'manual_custom').trim();
    const source = String(body?.source || body?.origin || 'admin_dashboard').trim();
    const tableName = String(body?.tableName || body?.table_name || 'sms').trim();

    const recipients = rawRecipients
      .map((recipient: unknown) => typeof recipient === 'string' ? recipient : String(recipient?.phoneNumber || recipient?.phone_number || '').trim())
      .filter(Boolean);

    if (recipients.length === 0 || !message) {
      return new Response(
        JSON.stringify({ error: 'At least one recipient and a message are required' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const results = await sendSmsMessage(recipients, message);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    await Promise.all(results.map((result, index) => supabase.from("audit_logs").insert({
      action: result.status === 'failed' ? 'SMS_FAILED' : result.status === 'delivered' ? 'SMS_DELIVERED' : 'SMS_SENT',
      table_name: tableName,
      status: result.status === 'failed' ? 'error' : 'success',
      user_id: claims.sub || null,
      metadata: {
        source,
        trigger_key: triggerKey,
        provider: result.provider,
        recipient_index: index,
        recipient_count: results.length,
        phone_number: result.phoneNumber,
        message,
        provider_message_id: result.providerMessageId,
        provider_response: result.raw,
      },
    })));

    const delivered = results.filter((result) => result.status === 'delivered').length;
    const failed = results.filter((result) => result.status === 'failed').length;
    const sent = results.length - failed;

    return new Response(
      JSON.stringify({
        success: failed === 0,
        sent,
        delivered,
        failed,
        recipients: results.length,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error in send-sms function:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An error occurred while sending SMS',
        details: String(error)
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
