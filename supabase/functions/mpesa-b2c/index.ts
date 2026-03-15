// M-Pesa B2C (Business to Customer) Edge Function
// Used for disbursements and payment reversals

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MpesaConfig {
  consumerKey: string
  consumerSecret: string
  shortcode: string
  initiatorName: string
  initiatorPassword: string
  environment: 'sandbox' | 'production'
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { 
      phone, 
      amount, 
      memberId, 
      reason, 
      isReversal = false,
      transactionId 
    } = await req.json()

    // Validate required fields
    if (!phone || !amount || !reason) {
      throw new Error('Missing required fields: phone, amount, reason')
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
      .select('mpesa_consumer_key, mpesa_consumer_secret, mpesa_shortcode, mpesa_initiator_name, mpesa_initiator_password, mpesa_env')
      .single()

    if (settingsError || !settings) {
      throw new Error('M-Pesa configuration not found. Please configure in Settings.')
    }

    const mpesaConfig: MpesaConfig = {
      consumerKey: settings.mpesa_consumer_key || '',
      consumerSecret: settings.mpesa_consumer_secret || '',
      shortcode: settings.mpesa_shortcode || '174379',
      initiatorName: settings.mpesa_initiator_name || 'testapi',
      initiatorPassword: settings.mpesa_initiator_password || '',
      environment: (settings.mpesa_env as 'sandbox' | 'production') || 'sandbox',
    }

    if (!mpesaConfig.consumerKey || !mpesaConfig.consumerSecret) {
      throw new Error('M-Pesa credentials not configured')
    }

    if (!mpesaConfig.initiatorName || !mpesaConfig.initiatorPassword) {
      throw new Error('M-Pesa initiator credentials not configured')
    }

    // Get access token
    const accessToken = await getMpesaToken(mpesaConfig)

    // Format phone number
    const formattedPhone = formatPhoneNumber(phone)

    // Determine CommandID based on payment type
    const commandID = isReversal ? 'BusinessPayment' : 'SalaryPayment'
    const occasion = isReversal ? 'REVERSAL' : 'DISBURSEMENT'

    // Prepare B2C payload
    const b2cPayload = {
      InitiatorName: mpesaConfig.initiatorName,
      SecurityCredential: await encryptCredential(mpesaConfig.initiatorPassword),
      CommandID: commandID,
      Amount: Math.floor(amount),
      PartyA: mpesaConfig.shortcode,
      PartyB: formattedPhone,
      Remarks: reason,
      QueueTimeOutURL: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mpesa-b2c-callback`,
      ResultURL: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mpesa-b2c-callback`,
      Occasion: occasion,
    }

    // Initiate B2C payment
    const response = await fetch(
      `${mpesaConfig.environment === 'production'
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke'
      }/mpesa/b2c/v1/paymentrequest`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(b2cPayload),
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.errorMessage || 'B2C payment initiation failed')
    }

    const b2cResponse = await response.json()

    // Create transaction record for disbursement/reversal
    if (memberId && transactionId) {
      const { error: txError } = await supabase.from('transactions').insert({
        member_id: memberId,
        amount: -Math.abs(amount), // Negative for disbursement
        transaction_type: isReversal ? 'transfer' : 'disbursement',
        payment_method: 'mpesa',
        reference: b2cResponse.ConversationID || b2cResponse.OriginatorConversationID,
        status: 'pending',
        description: isReversal 
          ? `M-Pesa Reversal: ${reason}` 
          : `M-Pesa Disbursement: ${reason}`,
        metadata: {
          conversation_id: b2cResponse.ConversationID,
          originator_conversation_id: b2cResponse.OriginatorConversationID,
          phone: formattedPhone,
          is_reversal: isReversal,
          reversed_transaction_id: isReversal ? transactionId : null,
          initiated_at: new Date().toISOString(),
        },
      })

      if (txError) {
        console.error('Error creating B2C transaction record:', txError)
      }
    }

    // Log audit trail
    await supabase.from('audit_logs').insert({
      action: isReversal ? 'MPESA_REVERSAL_INITIATED' : 'MPESA_DISBURSEMENT_INITIATED',
      table_name: 'transactions',
      status: 'success',
      metadata: {
        member_id: memberId,
        amount: amount,
        phone: formattedPhone,
        reason: reason,
        is_reversal: isReversal,
        conversation_id: b2cResponse.ConversationID,
      },
    })

    return new Response(JSON.stringify(b2cResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error('B2C error:', error)
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

// Encrypt credential for M-Pesa (simple base64 for sandbox, use proper encryption for production)
async function encryptCredential(credential: string): Promise<string> {
  // For production, you need to encrypt with M-Pesa public certificate
  // For sandbox, base64 encoding works
  return btoa(credential)
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
  
  return '254' + cleaned
}
