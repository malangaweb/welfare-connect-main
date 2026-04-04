// M-Pesa STK Push Edge Function
// Initiates STK Push payment request to member's phone

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MpesaConfig {
  consumerKey: string
  consumerSecret: string
  passkey: string
  shortcode: string
  environment: 'sandbox' | 'production'
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phone, amount, accountReference, memberId, transactionDesc } = await req.json()

    // Validate required fields
    if (!phone || !amount || !memberId) {
      throw new Error('Missing required fields: phone, amount, memberId')
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: req.headers.get('Authorization')! } }
      }
    )

    // Get M-Pesa configuration from settings
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('mpesa_consumer_key, mpesa_consumer_secret, mpesa_passkey, mpesa_shortcode, mpesa_env')
      .single()

    if (settingsError || !settings) {
      throw new Error('M-Pesa configuration not found. Please configure in Settings.')
    }

    const mpesaConfig: MpesaConfig = {
      consumerKey: settings.mpesa_consumer_key || '',
      consumerSecret: settings.mpesa_consumer_secret || '',
      passkey: settings.mpesa_passkey || '',
      shortcode: settings.mpesa_shortcode || '174379',
      environment: (settings.mpesa_env as 'sandbox' | 'production') || 'sandbox',
    }

    if (!mpesaConfig.consumerKey || !mpesaConfig.consumerSecret) {
      throw new Error('M-Pesa credentials not configured')
    }

    // Get access token
    const accessToken = await getMpesaToken(mpesaConfig)

    // Generate timestamp and password
    const timestamp = getTimestamp()
    const password = generatePassword(mpesaConfig.shortcode, mpesaConfig.passkey, timestamp)

    // Format phone number (ensure 254 prefix)
    const formattedPhone = formatPhoneNumber(phone)

    // Prepare STK Push payload
    const stkPayload = {
      BusinessShortCode: mpesaConfig.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.floor(amount),
      PartyA: formattedPhone,
      PartyB: mpesaConfig.shortcode,
      PhoneNumber: formattedPhone,
      AccountReference: accountReference || `WELFARE-${memberId}`,
      TransactionDesc: transactionDesc || 'Welfare Society Payment',
      CallBackURL: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mpesa-callback`,
    }

    // Initiate STK Push
    const response = await fetch(
      `${mpesaConfig.environment === 'production' 
        ? 'https://api.safaricom.co.ke' 
        : 'https://sandbox.safaricom.co.ke'
      }/stkpush/v1/processrequest`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(stkPayload),
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.errorMessage || 'STK Push initiation failed')
    }

    const stkResponse = await response.json()

    // Create pending transaction record
    const { error: txError } = await supabase.from('transactions').insert({
      member_id: memberId,
      amount: amount,
      transaction_type: 'wallet_funding',
      payment_method: 'mpesa',
      reference: stkResponse.CheckoutRequestID,
      mpesa_reference: stkResponse.CheckoutRequestID,
      status: 'pending',
      description: transactionDesc || `M-Pesa STK Push - ${accountReference}`,
      metadata: {
        checkout_request_id: stkResponse.CheckoutRequestID,
        merchant_request_id: stkResponse.MerchantRequestID,
        phone: formattedPhone,
        initiated_at: new Date().toISOString(),
      },
    })

    if (txError) {
      console.error('Error creating transaction record:', txError)
      // Don't fail the request, just log the error
    }

    // Log audit trail
    await supabase.from('audit_logs').insert({
      action: 'STK_PUSH_INITIATED',
      table_name: 'transactions',
      status: 'success',
      metadata: {
        member_id: memberId,
        amount: amount,
        phone: formattedPhone,
        checkout_request_id: stkResponse.CheckoutRequestID,
      },
    })

    return new Response(JSON.stringify(stkResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error('STK Push error:', error)
    return new Response(
      JSON.stringify({ error: error.message, success: false }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})

// Get M-Pesa access token
async function getMpesaToken(config: MpesaConfig): Promise<string> {
  const auth = btoa(`${config.consumerKey}:${config.consumerSecret}`)
  
  const response = await fetch(
    `${config.environment === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke'
    }/oauth/v1/generate?grant_type=client_credentials`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
      },
    }
  )

  if (!response.ok) {
    throw new Error('Failed to get M-Pesa access token')
  }

  const data = await response.json()
  return data.access_token
}

// Generate timestamp for M-Pesa
function getTimestamp(): string {
  const now = new Date()
  return now
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14)
}

// Generate M-Pesa password
function generatePassword(shortcode: string, passkey: string, timestamp: string): string {
  const key = `${shortcode}${passkey}${timestamp}`
  return btoa(key)
}

// Format phone number to 254 format
function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  
  if (cleaned.startsWith('254')) {
    return cleaned
  }
  
  if (cleaned.startsWith('0')) {
    return '254' + cleaned.slice(1)
  }
  
  if (cleaned.startsWith('+')) {
    return cleaned.slice(1)
  }
  
  // Assume it's a local number without the leading 0
  return '254' + cleaned
}
