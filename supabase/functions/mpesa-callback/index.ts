// M-Pesa Callback Edge Function - REFACTORED
// Handles STK Push callbacks from M-Pesa
// Validation-first approach with proper routing

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
    console.log('========== STK CALLBACK RECEIVED ==========')
    console.log('Full callback:', JSON.stringify(callback, null, 2))

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const stkCallback = callback.Body?.stkCallback

    if (!stkCallback) {
      console.error('❌ REJECTED: Invalid callback format - missing stkCallback')
      
      await supabase.from('audit_logs').insert({
        action: 'STK_CALLBACK_INVALID_FORMAT',
        table_name: 'transactions',
        status: 'rejected',
        new_values: {
          reason: 'Missing stkCallback in request body',
          raw_callback: JSON.stringify(callback).substring(0, 500),
        },
      })

      return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Rejected - Invalid format' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
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
      new_values: {
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
      const normalizedReceipt = normalizeMpesaReference(String(MpesaReceiptNumber || ''))

      console.log('=== EXTRACTED METADATA ===')
      console.log('Amount:', Amount)
      console.log('MpesaReceiptNumber:', MpesaReceiptNumber)
      console.log('PhoneNumber:', PhoneNumber)
      console.log('AccountReference:', AccountReference)
      console.log('==========================')

      // STEP 1: VALIDATE critical data BEFORE any operation
      if (!Amount || Number(Amount) <= 0) {
        console.error('❌ VALIDATION FAILED: Missing or zero amount')
        
        await supabase.from('audit_logs').insert({
          action: 'STK_CALLBACK_VALIDATION_FAILED',
          table_name: 'transactions',
          status: 'rejected',
          new_values: {
            reason: 'Missing or zero amount',
            checkout_request_id: CheckoutRequestID,
            extracted_amount: Amount,
          },
        })

        return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Rejected - Missing amount' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (!normalizedReceipt) {
        console.error('❌ VALIDATION FAILED: Missing MpesaReceiptNumber')
        
        await supabase.from('audit_logs').insert({
          action: 'STK_CALLBACK_VALIDATION_FAILED',
          table_name: 'transactions',
          status: 'rejected',
          new_values: {
            reason: 'Missing MpesaReceiptNumber',
            checkout_request_id: CheckoutRequestID,
          },
        })

        return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Rejected - Missing receipt number' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Normalize phone number
      const normalizedPhone = normalizePhoneNumber(PhoneNumber || '')
      const parsedTransactionDate = parseMpesaTimestamp(String(TransactionDate || ''))

      // Guard idempotency by receipt first. If this receipt already exists, do not insert a new row.
      const { data: existingByReceipt } = await supabase
        .from('transactions')
        .select('id, status, member_id')
        .eq('mpesa_reference', normalizedReceipt)
        .limit(1)
        .maybeSingle()

      if (existingByReceipt) {
        console.warn('⚠️ Duplicate STK callback skipped by receipt:', normalizedReceipt, 'existing tx:', existingByReceipt.id)

        if (existingByReceipt.status !== 'completed') {
          await supabase
            .from('transactions')
            .update({
              status: 'completed',
              payment_method: 'mpesa',
            })
            .eq('id', existingByReceipt.id)
        }

        await supabase.from('audit_logs').insert({
          action: 'PAYMENT_RECEIVED',
          table_name: 'transactions',
          record_id: existingByReceipt.id,
          status: 'ignored',
          new_values: {
            custom_action: 'STK_DUPLICATE_RECEIPT_SKIPPED',
            mpesa_receipt: normalizedReceipt,
            checkout_request_id: CheckoutRequestID,
          },
        })

        return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // STEP 2: Find the transaction by CheckoutRequestID
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .select('id, member_id, amount, status')
        .eq('reference', CheckoutRequestID)
        .single()

      if (txError || !transaction) {
        console.log('⚠️ No existing transaction found - checking member match')

        // STEP 3: Try to find member by phone
        const { data: member, error: memberError } = await supabase
          .from('members')
          .select('id, member_number, name')
          .eq('phone_number', normalizedPhone)
          .single()

        if (member) {
          // === ROUTE TO TRANSACTIONS (Member Found) ===
          console.log('✅ Member found:', member.name, '- Creating transaction')

          const transactionData = {
            member_id: member.id,
            amount: Number(Amount),
            transaction_type: 'wallet_funding',
            payment_method: 'mpesa',
            mpesa_reference: normalizedReceipt,
            reference: CheckoutRequestID,
            description: `M-Pesa STK Push - ${AccountReference || 'Payment'}`,
            status: 'completed',
            created_at: parsedTransactionDate.toISOString(),
            metadata: {
              webhook_source: 'stk_push',
              mpesa_receipt: normalizedReceipt,
              phone_number: normalizedPhone,
              account_reference: AccountReference,
              checkout_request_id: CheckoutRequestID,
              merchant_request_id: MerchantRequestID,
              transaction_date_raw: TransactionDate || null,
            },
          }

          console.log('=== INSERTING TO TRANSACTIONS ===')
          console.log('Data:', JSON.stringify(transactionData, null, 2))

          const { error: insertTxError } = await supabase.from('transactions').insert(transactionData)

          if (insertTxError) {
            console.error('❌ ERROR creating transaction:', insertTxError.message)
          } else {
            console.log('✅ SUCCESS: Transaction created')

            await supabase.from('audit_logs').insert({
              action: 'PAYMENT_RECEIVED',
              table_name: 'transactions',
              status: 'success',
              new_values: {
                amount: Amount,
                mpesa_receipt: normalizedReceipt,
                phone_number: normalizedPhone,
                member_id: member.id,
              },
            })
          }
        } else {
          // === ROUTE TO WRONG_MPESA_TRANSACTIONS (No Member Found) ===
          console.log('⚠️ No member found - routing to suspense account')

          const suspenseData = {
            mpesa_receipt_number: normalizedReceipt,
            phone_number: normalizedPhone || 'UNKNOWN',
            amount: Number(Amount),
            sender_name: AccountReference || 'Unknown',
            transaction_date: parsedTransactionDate.toISOString(),
            status: 'pending',
            payment_method: 'mpesa',
            source: 'stk_push',
            reference: CheckoutRequestID,
            metadata: {
              webhook_source: 'stk_push',
              account_reference: AccountReference || null,
              normalized_phone: normalizedPhone || null,
              checkout_request_id: CheckoutRequestID,
              merchant_request_id: MerchantRequestID,
              transaction_date_raw: TransactionDate || null,
            },
            notes: `M-Pesa STK Push - ${AccountReference || 'Payment'}`,
          }

          console.log('=== INSERTING TO SUSPENSE ===')
          console.log('Data:', JSON.stringify(suspenseData, null, 2))

          const { error: suspenseError } = await supabase
            .from('wrong_mpesa_transactions')
            .insert(suspenseData)
            .select()
            .single()

          if (suspenseError) {
            console.error('❌ ERROR inserting into suspense:', suspenseError.message)
            
            await supabase.from('audit_logs').insert({
              action: 'STK_SUSPENSE_INSERT_FAILED',
              table_name: 'wrong_mpesa_transactions',
              status: 'error',
              new_values: {
                error: suspenseError.message,
                data: suspenseData,
              },
            })
          } else {
            console.log('✅ SUCCESS: Inserted into suspense - ID:', suspenseData.mpesa_receipt_number)
            
            await supabase.from('audit_logs').insert({
              action: 'UNMATCHED_STK_PAYMENT',
              table_name: 'wrong_mpesa_transactions',
              status: 'pending',
              new_values: {
                mpesa_receipt: MpesaReceiptNumber,
                mpesa_receipt_normalized: normalizedReceipt,
                phone: normalizedPhone,
                amount: Amount,
                checkout_request_id: CheckoutRequestID,
              },
            })
          }
        }

        // Still return success to M-Pesa
        return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // STEP 4: Update existing transaction
      console.log('✅ Updating existing transaction:', transaction.id)

      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: 'completed',
          payment_method: 'mpesa',
          mpesa_reference: normalizedReceipt,
          reference: normalizedReceipt,
          metadata: {
            webhook_source: 'stk_push',
            mpesa_receipt: normalizedReceipt,
            mpesa_code: ResultCode,
            callback_time: new Date().toISOString(),
            transaction_date: parsedTransactionDate.toISOString(),
            transaction_date_raw: TransactionDate || null,
            checkout_request_id: CheckoutRequestID,
            merchant_request_id: MerchantRequestID,
            account_reference: AccountReference,
            phone_number: PhoneNumber,
            amount: Amount,
          },
        })
        .eq('id', transaction.id)

      if (updateError) {
        console.error('❌ ERROR updating transaction:', updateError.message)
      }

      // Log successful payment
      await supabase.from('audit_logs').insert({
        action: 'PAYMENT_RECEIVED',
        table_name: 'transactions',
        record_id: transaction.id,
        status: 'success',
        new_values: {
          amount: Amount,
          mpesa_receipt: normalizedReceipt,
          phone_number: PhoneNumber,
          member_id: transaction.member_id,
        },
      })

      // Send SMS notification (if configured)
      try {
        await supabase.functions.invoke('send-sms', {
          body: {
            phoneNumber: PhoneNumber,
            message: `Payment received: KES ${Amount}. M-Pesa Ref: ${normalizedReceipt}. Thank you!`,
          },
        })
      } catch (smsError) {
        console.error('SMS notification failed:', smsError.message)
      }

    } else {
      // Payment failed
      console.log('❌ Payment failed:', ResultDesc)

      const { data: failedTransaction } = await supabase
        .from('transactions')
        .select('id')
        .eq('reference', CheckoutRequestID)
        .maybeSingle()

      if (failedTransaction) {
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
          .eq('id', failedTransaction.id)

        if (updateError) {
          console.error('Error updating failed transaction:', updateError.message)
        }
      } else {
        await supabase.from('wrong_mpesa_transactions').insert({
          mpesa_receipt_number: normalizedReceipt || null,
          phone_number: normalizedPhone || null,
          amount: Number(Amount || 0) || null,
          sender_name: AccountReference || 'STK Push',
          transaction_date: parsedTransactionDate.toISOString(),
          status: 'failed',
          payment_method: 'mpesa',
          source: 'stk_push',
          reference: CheckoutRequestID || null,
          metadata: {
            webhook_source: 'stk_push',
            checkout_request_id: CheckoutRequestID,
            merchant_request_id: MerchantRequestID,
            mpesa_code: ResultCode,
            mpesa_desc: ResultDesc,
          },
          notes: 'STK callback failed and no matching pending transaction was found',
        })
      }

      // Log failed payment
      await supabase.from('audit_logs').insert({
        action: 'PAYMENT_FAILED',
        table_name: 'transactions',
        record_id: failedTransaction?.id ?? null,
        status: failedTransaction ? 'failed' : 'warning',
        new_values: {
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
    console.error('========== STK CALLBACK ERROR ==========')
    console.error('Error:', error.message)
    console.error('Stack:', error.stack)

    // Log error
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      await supabase.from('audit_logs').insert({
        action: 'STK_CALLBACK_ERROR',
        table_name: 'transactions',
        status: 'error',
        new_values: {
          error: error.message,
          stack: error.stack,
        },
      })
    } catch (logError) {
      console.error('Failed to log error:', logError.message)
    }

    // Still return success to M-Pesa to prevent retries
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted (Error logged)' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

function normalizePhoneNumber(phone: string): string {
  if (!phone) return ''
  // Remove non-digits
  let cleaned = phone.replace(/\D/g, '')

  // Handle different formats
  if (cleaned.startsWith('254')) {
    return '+' + cleaned
  }
  if (cleaned.startsWith('0')) {
    return '+254' + cleaned.substring(1)
  }
  if (!cleaned.startsWith('+')) {
    return '+' + cleaned
  }

  return phone
}

function normalizeMpesaReference(value: string): string {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase()
}

function parseMpesaTimestamp(value: string): Date {
  const cleaned = value.replace(/\D/g, '')
  if (cleaned.length === 14) {
    const isoLike = `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}T${cleaned.slice(8, 10)}:${cleaned.slice(10, 12)}:${cleaned.slice(12, 14)}+03:00`
    const parsed = new Date(isoLike)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }
  }

  const fallback = new Date(value)
  if (!Number.isNaN(fallback.getTime())) {
    return fallback
  }

  return new Date()
}
