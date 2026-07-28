import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const callback = await req.json()
    console.log('M-Pesa Reversal Callback received:', JSON.stringify(callback))

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const result = callback.Result
    if (!result) {
      throw new Error('Invalid callback format')
    }

    const {
      ResultCode,
      ResultDesc,
      OriginatorConversationID,
      ConversationID,
      TransactionID,
    } = result

    await supabase.from('audit_logs').insert({
      action: 'MPESA_REVERSAL_CALLBACK_RECEIVED',
      table_name: 'transactions',
      status: ResultCode === 0 ? 'success' : 'failed',
      metadata: {
        conversation_id: ConversationID,
        originator_conversation_id: OriginatorConversationID,
        transaction_id: TransactionID,
        result_code: ResultCode,
        result_desc: ResultDesc,
      },
    })

    const lookupRef = OriginatorConversationID || ConversationID
    if (!lookupRef) {
      console.error('Reversal callback missing both OriginatorConversationID and ConversationID')
      return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: reversalTxs, error: txError } = await supabase
      .from('transactions')
      .select('id, member_id, amount, metadata')
      .or(`reference.eq.${lookupRef},metadata->>originator_conversation_id.eq.${OriginatorConversationID},metadata->>conversation_id.eq.${ConversationID}`)
      .eq('transaction_type', 'transfer')
      .order('created_at', { ascending: false })
      .limit(5)

    if (txError || !reversalTxs || reversalTxs.length === 0) {
      console.error('No reversal transaction found for:', lookupRef)
      return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    for (const tx of reversalTxs) {
      const meta = tx.metadata as Record<string, unknown> || {}

      if (ResultCode === 0) {
        const { error: updateError } = await supabase
          .from('transactions')
          .update({
            status: 'completed',
            mpesa_reference: TransactionID,
            metadata: {
              ...meta,
              mpesa_transaction_id: TransactionID,
              reversal_api_result_code: ResultCode,
              callback_time: new Date().toISOString(),
              completed_at: new Date().toISOString(),
            },
          })
          .eq('id', tx.id)

        if (updateError) {
          console.error('Error updating reversal transaction:', updateError)
        }

        const reversedTxId = meta.reversed_transaction_id
        if (reversedTxId) {
          const { data: originalTx } = await supabase
            .from('transactions')
            .select('metadata')
            .eq('id', reversedTxId)
            .single()

          if (originalTx) {
            const originalMeta = originalTx.metadata as Record<string, unknown> || {}
            await supabase
              .from('transactions')
              .update({
                metadata: {
                  ...originalMeta,
                  reversal_completed: true,
                  reversal_mpesa_ref: TransactionID,
                  reversal_api_result_code: ResultCode,
                },
              })
              .eq('id', reversedTxId)
          }
        }

        await supabase.from('audit_logs').insert({
          action: 'MPESA_REVERSAL_COMPLETED',
          table_name: 'transactions',
          record_id: tx.id,
          status: 'success',
          metadata: {
            amount: tx.amount,
            mpesa_transaction_id: TransactionID,
            member_id: tx.member_id,
            reversed_transaction_id: reversedTxId,
          },
        })
      } else {
        const { error: updateError } = await supabase
          .from('transactions')
          .update({
            status: 'failed',
            metadata: {
              ...meta,
              mpesa_code: ResultCode,
              mpesa_desc: ResultDesc,
              callback_time: new Date().toISOString(),
              failure_reason: ResultDesc,
            },
          })
          .eq('id', tx.id)

        if (updateError) {
          console.error('Error updating failed reversal:', updateError)
        }
      }
    }

    if (ResultCode !== 0) {
      await supabase.from('audit_logs').insert({
        action: 'MPESA_REVERSAL_FAILED',
        table_name: 'transactions',
        status: 'failed',
        metadata: {
          conversation_id: ConversationID,
          mpesa_code: ResultCode,
          mpesa_desc: ResultDesc,
        },
      })
    }

    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('Reversal callback processing error:', error)
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
