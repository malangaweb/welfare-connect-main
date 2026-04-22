import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { corsHeaders } from "../_shared/cors.ts";
import { verifyAppJwtFromRequest } from "../_shared/app_jwt.ts";

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
    const body = await req.json().catch(() => ({}));
    const memberId = String(body?.memberId || claims.member_id || "");
    if (!memberId) return jsonResponse(400, { error: "memberId is required" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: settings, error: settingsError } = await supabase
      .from("settings")
      .select("mpesa_consumer_key, mpesa_consumer_secret, mpesa_passkey, mpesa_shortcode, mpesa_env")
      .single();
    if (settingsError || !settings) return jsonResponse(500, { error: "M-Pesa configuration missing" });

    const consumerKey = settings.mpesa_consumer_key;
    const consumerSecret = settings.mpesa_consumer_secret;
    const passkey = settings.mpesa_passkey;
    const shortcode = settings.mpesa_shortcode || "174379";
    const env = (settings.mpesa_env || "sandbox") as "sandbox" | "production";
    if (!consumerKey || !consumerSecret || !passkey) {
      return jsonResponse(500, { error: "M-Pesa credentials are incomplete" });
    }

    const phone = String(body?.phone || "");
    const amount = Math.floor(Number(body?.amount || 0));
    const accountReference = String(body?.accountReference || `WELFARE-${memberId}`);
    const transactionDesc = String(body?.transactionDesc || "Welfare Society Payment");
    if (!phone || amount <= 0) return jsonResponse(400, { error: "phone and positive amount required" });

    const auth = btoa(`${consumerKey}:${consumerSecret}`);
    const tokenResp = await fetch(
      `${env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke"}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${auth}` } },
    );
    if (!tokenResp.ok) return jsonResponse(502, { error: "Failed to get M-Pesa access token" });
    const tokenJson = await tokenResp.json();
    const accessToken = tokenJson.access_token as string;

    const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
    const password = btoa(`${shortcode}${passkey}${ts}`);
    const clean = phone.replace(/\D/g, "");
    const formattedPhone = clean.startsWith("254")
      ? clean
      : clean.startsWith("0")
          ? `254${clean.slice(1)}`
          : clean;

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: ts,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: formattedPhone,
      PartyB: shortcode,
      PhoneNumber: formattedPhone,
      AccountReference: accountReference,
      TransactionDesc: transactionDesc,
      CallBackURL: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mpesa-callback`,
    };

    const stkResp = await fetch(
      `${env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke"}/stkpush/v1/processrequest`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const stkJson = await stkResp.json();
    if (!stkResp.ok) {
      return jsonResponse(502, { error: stkJson?.errorMessage || "STK push failed" });
    }

    await supabase.from("transactions").insert({
      member_id: memberId,
      amount,
      transaction_type: "wallet_funding",
      payment_method: "mpesa",
      reference: stkJson.CheckoutRequestID,
      mpesa_reference: stkJson.CheckoutRequestID,
      status: "pending",
      description: transactionDesc,
      metadata: {
        checkout_request_id: stkJson.CheckoutRequestID,
        merchant_request_id: stkJson.MerchantRequestID,
        phone: formattedPhone,
        initiated_at: new Date().toISOString(),
        source: "api-stk-push",
      },
    });

    return jsonResponse(200, stkJson);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return jsonResponse(401, { error: msg });
  }
});
