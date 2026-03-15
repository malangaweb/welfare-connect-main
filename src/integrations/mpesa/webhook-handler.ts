// M-Pesa Webhook Handler for payment callbacks
// This handles STK Push callbacks and B2C payment confirmations

import { supabase } from '@/integrations/supabase/client';
import { StkPushCallback } from './client';

export interface MpesaCallbackItem {
  Name: string;
  Value: string | number;
}

export interface ProcessedCallback {
  CheckoutRequestID: string;
  ResultCode: number;
  ResultDesc: string;
  Amount?: number;
  MpesaReceiptNumber?: string;
  TransactionDate?: string;
  PhoneNumber?: string;
  MerchantRequestID: string;
}

export async function processStkPushCallback(
  callback: StkPushCallback
): Promise<void> {
  const stkCallback = callback.Body.stkCallback;

  const processed: ProcessedCallback = {
    CheckoutRequestID: stkCallback.CheckoutRequestID,
    MerchantRequestID: stkCallback.MerchantRequestID,
    ResultCode: stkCallback.ResultCode,
    ResultDesc: stkCallback.ResultDesc,
  };

  // Parse callback metadata if payment was successful
  if (stkCallback.ResultCode === 0 && stkCallback.CallbackMetadata) {
    const items = stkCallback.CallbackMetadata.Item;
    for (const item of items) {
      switch (item.Name) {
        case 'Amount':
          processed.Amount = item.Value as number;
          break;
        case 'MpesaReceiptNumber':
          processed.MpesaReceiptNumber = item.Value as string;
          break;
        case 'TransactionDate':
          processed.TransactionDate = item.Value as string;
          break;
        case 'PhoneNumber':
          processed.PhoneNumber = item.Value as string;
          break;
      }
    }
  }

  // Find the transaction record by CheckoutRequestID
  const { data: transaction, error: transactionError } = await supabase
    .from('transactions')
    .select('id, member_id, amount, reference')
    .eq('reference', processed.CheckoutRequestID)
    .single();

  if (transactionError) {
    console.error('Transaction not found:', processed.CheckoutRequestID);
    return;
  }

  if (stkCallback.ResultCode === 0) {
    // Payment successful
    await updateTransactionSuccess(
      transaction.id,
      transaction.member_id,
      processed,
      transaction.amount
    );
  } else {
    // Payment failed
    await updateTransactionFailure(transaction.id, processed);
  }
}

async function updateTransactionSuccess(
  transactionId: string,
  memberId: string,
  callback: ProcessedCallback,
  amount: number
): Promise<void> {
  // Update transaction record
  const { error: updateError } = await supabase
    .from('transactions')
    .update({
      status: 'completed',
      payment_method: 'mpesa',
      reference: callback.MpesaReceiptNumber,
      metadata: {
        mpesa_receipt: callback.MpesaReceiptNumber,
        mpesa_code: callback.ResultCode,
        callback_time: new Date().toISOString(),
      },
    })
    .eq('id', transactionId);

  if (updateError) {
    console.error('Failed to update transaction:', updateError);
    return;
  }

  // Update member wallet balance
  const { error: balanceError } = await supabase.rpc('update_wallet_balance', {
    p_member_id: memberId,
    p_amount: amount,
    p_transaction_type: 'deposit',
  });

  if (balanceError) {
    console.error('Failed to update wallet balance:', balanceError);
    return;
  }

  // Log the successful payment
  await supabase.from('audit_logs').insert({
    user_id: memberId,
    action: 'PAYMENT_RECEIVED',
    table_name: 'transactions',
    record_id: transactionId,
    status: 'success',
    metadata: {
      amount,
      mpesa_receipt: callback.MpesaReceiptNumber,
      phone_number: callback.PhoneNumber,
    },
  });
}

async function updateTransactionFailure(
  transactionId: string,
  callback: ProcessedCallback
): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({
      status: 'failed',
      metadata: {
        mpesa_code: callback.ResultCode,
        mpesa_desc: callback.ResultDesc,
        callback_time: new Date().toISOString(),
      },
    })
    .eq('id', transactionId);

  if (error) {
    console.error('Failed to update failed transaction:', error);
  }
}

export async function reconcilePayments(): Promise<{
  reconciled: number;
  failed: number;
}> {
  // Find pending transactions (created more than 1 hour ago but still pending)
  const { data: pendingTransactions, error: fetchError } = await supabase
    .from('transactions')
    .select('id, reference')
    .eq('status', 'pending')
    .eq('payment_method', 'mpesa')
    .lt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

  if (fetchError) {
    console.error('Error fetching pending transactions:', fetchError);
    return { reconciled: 0, failed: 0 };
  }

  let reconciled = 0;
  let failed = 0;

  // Check status of each transaction (requires M-Pesa client)
  for (const transaction of pendingTransactions || []) {
    // This would call the M-Pesa API to check status
    // For now, mark old pending transactions as failed
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        status: 'failed',
        metadata: {
          reason: 'auto_reconciliation_timeout',
        },
      })
      .eq('id', transaction.id);

    if (updateError) {
      failed++;
    } else {
      reconciled++;
    }
  }

  return { reconciled, failed };
}