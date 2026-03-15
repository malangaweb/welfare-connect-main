// M-Pesa B2C Callback Edge Function
// Handles B2C payment completion callbacks

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const callback = await req.json()
    console.log('M-Pesa B2C Callback received:', JSON.stringify(callback))

    // Initialize Supabase client with service role key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const result = callback.Result

    if (!result) {
      throw new Error('Invalid callback format')
    }

    const {
      ResultType,
      ResultCode,
      ResultDesc,
      OriginatorConversationID,
      ConversationID,
      TransactionID,
    } = result

    // Log the callback
    await supabase.from('audit_logs').insert({
      action: 'MPESA_B2C_CALLBACK_RECEIVED',
      table_name: 'transactions',
      status: ResultCode === 0 ? 'success' : 'failed',
      metadata: {
        conversation_id: ConversationID,
        originator_conversation_id: OriginatorConversationID,
        transaction_id: TransactionID,
        result_code: ResultCode,
        result_desc: ResultDesc,
        result_type: ResultType,
      },
    })

    if (ResultCode === 0) {
      // Payment successful
      // Find transaction by OriginatorConversationID
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .select('id, member_id, amount, metadata')
        .eq('reference', OriginatorConversationID)
        .single()

      if (txError || !transaction) {
        console.error('B2C transaction not found:', OriginatorConversationID)
        return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Update transaction status
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: 'completed',
          mpesa_reference: TransactionID,
          metadata: {
            ...transaction.metadata,
            mpesa_transaction_id: TransactionID,
            mpesa_code: ResultCode,
            callback_time: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          },
        })
        .eq('id', transaction.id)

      if (updateError) {
        console.error('Error updating B2C transaction:', updateError)
      }

      // If this is a reversal, update the original transaction
      if (transaction.metadata?.is_reversal && transaction.metadata?.reversed_transaction_id) {
        await supabase
          .from('transactions')
          .update({
            metadata: {
              ...transaction.metadata,
              reversal_completed: true,
              reversal_mpesa_ref: TransactionID,
            },
          })
          .eq('id', transaction.metadata.reversed_transaction_id)
      }

      // Log successful B2C payment
      await supabase.from('audit_logs').insert({
        action: 'MPESA_B2C_COMPLETED',
        table_name: 'transactions',
        record_id: transaction.id,
        status: 'success',
        metadata: {
          amount: transaction.amount,
          mpesa_transaction_id: TransactionID,
          member_id: transaction.member_id,
          is_reversal: transaction.metadata?.is_reversal || false,
        },
      })

    } else {
      // Payment failed
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: 'failed',
          metadata: {
            mpesa_code: ResultCode,
            mpesa_desc: ResultDesc,
            callback_time: new Date().toISOString(),
            failure_reason: ResultDesc,
          },
        })
        .eq('reference', OriginatorConversationID)

      if (updateError) {
        console.error('Error updating failed B2C transaction:', updateError)
      }

      // Log failed B2C payment
      await supabase.from('audit_logs').insert({
        action: 'MPESA_B2C_FAILED',
        table_name: 'transactions',
        status: 'failed',
        metadata: {
          conversation_id: ConversationID,
          mpesa_code: ResultCode,
          mpesa_desc: ResultDesc,
        },
      })
    }

    // Return success to M-Pesa
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('B2C callback processing error:', error)
    
    // Still return success to M-Pesa
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
