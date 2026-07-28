import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireFinanceRole, verifyAppJwtFromRequest } from "../_shared/app_jwt.ts"

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const claims = await verifyAppJwtFromRequest(req)
    requireFinanceRole(claims.role)

    const {
      transactionId,
      mpesaReceiptNumber,
      amount,
      reason,
      memberId,
    } = await req.json()

    if (!mpesaReceiptNumber || !amount || !reason || !transactionId || !memberId) {
      throw new Error('Missing required fields: transactionId, mpesaReceiptNumber, amount, reason, memberId')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: req.headers.get('Authorization')! } },
      }
    )

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

    const accessToken = await getMpesaToken(mpesaConfig)

    const baseUrl = mpesaConfig.environment === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke'

    const reversalPayload = {
      InitiatorName: mpesaConfig.initiatorName,
      SecurityCredential: await encryptCredential(mpesaConfig.initiatorPassword),
      CommandID: 'Reversal',
      TransactionID: mpesaReceiptNumber,
      Amount: Math.floor(amount),
      ReceiverParty: mpesaConfig.shortcode,
      RecieverIdentifierType: '11',
      ResultURL: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mpesa-reversal-callback`,
      QueueTimeOutURL: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mpesa-reversal-callback`,
      Remarks: reason,
      Occasion: 'REVERSAL',
    }

    const response = await fetch(
      `${baseUrl}/mpesa/reversal/v1/request`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reversalPayload),
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.errorMessage || 'Reversal initiation failed')
    }

    const reversalResponse = await response.json()

    const { error: txError } = await supabase.from('transactions').insert({
      member_id: memberId,
      amount: -Math.abs(amount),
      transaction_type: 'transfer',
      payment_method: 'mpesa',
      reference: reversalResponse.OriginatorConversationID || reversalResponse.ConversationID,
      status: 'pending',
      description: `M-Pesa Reversal via API: ${reason}`,
      metadata: {
        conversation_id: reversalResponse.ConversationID,
        originator_conversation_id: reversalResponse.OriginatorConversationID,
        mpesa_receipt_reversed: mpesaReceiptNumber,
        reversed_transaction_id: transactionId,
        is_reversal: true,
        reversal_api: true,
        initiated_at: new Date().toISOString(),
      },
    })

    if (txError) {
      console.error('Error creating reversal transaction record:', txError)
    }

    await supabase.from('audit_logs').insert({
      action: 'MPESA_REVERSAL_INITIATED',
      table_name: 'transactions',
      status: 'success',
      metadata: {
        transaction_id: transactionId,
        mpesa_receipt: mpesaReceiptNumber,
        amount: amount,
        reason: reason,
        conversation_id: reversalResponse.ConversationID,
        originator_conversation_id: reversalResponse.OriginatorConversationID,
      },
    })

    return new Response(JSON.stringify(reversalResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error('M-Pesa Reversal error:', error)
    return new Response(
      JSON.stringify({ error: error.message, success: false }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})

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

async function encryptCredential(credential: string): Promise<string> {
  return btoa(credential)
}
