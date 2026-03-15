// M-Pesa Callback Edge Function
// Handles STK Push callbacks from M-Pesa

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
    console.log('M-Pesa Callback received:', JSON.stringify(callback))

    // Initialize Supabase client with service role key for full access
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const stkCallback = callback.Body?.stkCallback

    if (!stkCallback) {
      throw new Error('Invalid callback format')
    }

    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
    } = stkCallback

    // Log the callback for debugging
    await supabase.from('audit_logs').insert({
      action: 'MPESA_CALLBACK_RECEIVED',
      table_name: 'transactions',
      status: ResultCode === 0 ? 'success' : 'failed',
      metadata: {
        checkout_request_id: CheckoutRequestID,
        merchant_request_id: MerchantRequestID,
        result_code: ResultCode,
        result_desc: ResultDesc,
      },
    })

    if (ResultCode === 0) {
      // Payment successful - extract metadata
      const metadataItems = stkCallback.CallbackMetadata?.Item || []
      const metadata: Record<string, any> = {}
      
      for (const item of metadataItems) {
        metadata[item.Name] = item.Value
      }

      const {
        Amount,
        MpesaReceiptNumber,
        TransactionDate,
        PhoneNumber,
        AccountReference,
      } = metadata

      // Find the transaction by CheckoutRequestID
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .select('id, member_id, amount, status')
        .eq('reference', CheckoutRequestID)
        .single()

      if (txError || !transaction) {
        console.error('Transaction not found:', CheckoutRequestID)
        // Still return success to M-Pesa
        return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Update transaction status
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: 'completed',
          payment_method: 'mpesa',
          mpesa_reference: MpesaReceiptNumber,
          reference: MpesaReceiptNumber,
          metadata: {
            mpesa_receipt: MpesaReceiptNumber,
            mpesa_code: ResultCode,
            callback_time: new Date().toISOString(),
            transaction_date: TransactionDate,
            phone_number: PhoneNumber,
            amount: Amount,
          },
        })
        .eq('id', transaction.id)

      if (updateError) {
        console.error('Error updating transaction:', updateError)
      }

      // Update member wallet balance
      const { error: balanceError } = await supabase.rpc('update_wallet_balance', {
        p_member_id: transaction.member_id,
        p_amount: Amount,
        p_transaction_type: 'deposit',
      })

      if (balanceError) {
        console.error('Error updating wallet balance:', balanceError)
      }

      // Log successful payment
      await supabase.from('audit_logs').insert({
        action: 'PAYMENT_RECEIVED',
        table_name: 'transactions',
        record_id: transaction.id,
        status: 'success',
        metadata: {
          amount: Amount,
          mpesa_receipt: MpesaReceiptNumber,
          phone_number: PhoneNumber,
          member_id: transaction.member_id,
        },
      })

      // Send SMS notification (if configured)
      try {
        await supabase.functions.invoke('send-sms', {
          body: {
            phoneNumber: PhoneNumber,
            message: `Payment received: KES ${Amount}. M-Pesa Ref: ${MpesaReceiptNumber}. Thank you!`,
          },
        })
      } catch (smsError) {
        console.error('SMS notification failed:', smsError)
      }

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
          },
        })
        .eq('reference', CheckoutRequestID)

      if (updateError) {
        console.error('Error updating failed transaction:', updateError)
      }

      // Log failed payment
      await supabase.from('audit_logs').insert({
        action: 'PAYMENT_FAILED',
        table_name: 'transactions',
        status: 'failed',
        metadata: {
          checkout_request_id: CheckoutRequestID,
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
    console.error('Callback processing error:', error)
    
    // Still return success to M-Pesa to prevent retries
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
