<?php

declare(strict_types=1);

require_once __DIR__ . '/mpesa_common.php';

mlg_handle_options();
mlg_require_post();

try {
    $payload = mlg_read_json_body();
    mlg_log_json_line('stk_callback_raw.log', $payload);

    $stk = $payload['Body']['stkCallback'] ?? null;
    if (!is_array($stk)) {
        mlg_log_json_line('stk_callback_errors.log', [
            'reason' => 'missing_stkCallback',
            'payload' => $payload,
        ]);
        mlg_json_response(200, ['ResultCode' => 0, 'ResultDesc' => 'Accepted']);
    }

    $checkoutRequestId = trim((string)($stk['CheckoutRequestID'] ?? ''));
    $merchantRequestId = trim((string)($stk['MerchantRequestID'] ?? ''));
    $resultCode = (int)($stk['ResultCode'] ?? -1);
    $resultDesc = trim((string)($stk['ResultDesc'] ?? ''));

    $metadataItems = $stk['CallbackMetadata']['Item'] ?? [];
    $metadata = [];
    if (is_array($metadataItems)) {
        foreach ($metadataItems as $item) {
            if (!is_array($item)) {
                continue;
            }
            $name = trim((string)($item['Name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $metadata[$name] = $item['Value'] ?? null;
        }
    }

    $receipt = trim((string)($metadata['MpesaReceiptNumber'] ?? ''));
    $amount = (float)($metadata['Amount'] ?? 0);
    $phone = mlg_normalize_phone((string)($metadata['PhoneNumber'] ?? ''));

    $txLookup = null;
    if ($checkoutRequestId !== '') {
        $path = '/rest/v1/transactions?reference=eq.' . rawurlencode($checkoutRequestId) . '&select=id,member_id,amount,status&limit=1';
        $lookupResp = mlg_supabase_request('GET', $path);
        if (($lookupResp['status'] ?? 0) >= 200 && ($lookupResp['status'] ?? 0) < 300 && is_array($lookupResp['json']) && isset($lookupResp['json'][0]) && is_array($lookupResp['json'][0])) {
            $txLookup = $lookupResp['json'][0];
        }
    }

    if ($resultCode === 0) {
        if ($txLookup) {
            $updatePayload = [
                'status' => 'completed',
                'payment_method' => 'mpesa',
                'mpesa_reference' => $receipt !== '' ? $receipt : ($txLookup['mpesa_reference'] ?? null),
                'metadata' => [
                    'mpesa_receipt' => $receipt !== '' ? $receipt : null,
                    'mpesa_code' => $resultCode,
                    'callback_time' => date('c'),
                    'callback_desc' => $resultDesc,
                    'phone_number' => $phone !== '' ? $phone : null,
                    'merchant_request_id' => $merchantRequestId,
                    'checkout_request_id' => $checkoutRequestId,
                ],
            ];

            mlg_supabase_request(
                'PATCH',
                '/rest/v1/transactions?id=eq.' . rawurlencode((string)$txLookup['id']),
                $updatePayload,
                'return=representation'
            );

            mlg_supabase_request('POST', '/rest/v1/audit_logs', [
                'user_id' => $txLookup['member_id'] ?? null,
                'action' => 'PAYMENT_RECEIVED',
                'table_name' => 'transactions',
                'record_id' => $txLookup['id'] ?? null,
                'status' => 'success',
                'metadata' => [
                    'amount' => $amount,
                    'mpesa_receipt' => $receipt,
                    'phone_number' => $phone,
                    'checkout_request_id' => $checkoutRequestId,
                ],
            ]);
        } else {
            mlg_supabase_request('POST', '/rest/v1/wrong_mpesa_transactions', [
                'mpesa_receipt_number' => $receipt,
                'phone_number' => $phone !== '' ? $phone : 'UNKNOWN',
                'amount' => $amount,
                'sender_name' => 'STK Push',
                'transaction_date' => date('c'),
                'status' => 'pending',
                'payment_method' => 'mpesa',
                'source' => 'stk_push',
                'reference' => $checkoutRequestId,
                'metadata' => [
                    'checkout_request_id' => $checkoutRequestId,
                    'merchant_request_id' => $merchantRequestId,
                    'result_code' => $resultCode,
                    'result_desc' => $resultDesc,
                ],
                'notes' => 'STK callback arrived without matching pending transaction',
            ]);
        }
    } else {
        if ($txLookup) {
            mlg_supabase_request(
                'PATCH',
                '/rest/v1/transactions?id=eq.' . rawurlencode((string)$txLookup['id']),
                [
                    'status' => 'failed',
                    'metadata' => [
                        'mpesa_code' => $resultCode,
                        'mpesa_desc' => $resultDesc,
                        'callback_time' => date('c'),
                        'merchant_request_id' => $merchantRequestId,
                        'checkout_request_id' => $checkoutRequestId,
                    ],
                ],
                'return=representation'
            );
        }

        mlg_supabase_request('POST', '/rest/v1/audit_logs', [
            'action' => 'PAYMENT_FAILED',
            'table_name' => 'transactions',
            'record_id' => $txLookup['id'] ?? null,
            'status' => 'failed',
            'metadata' => [
                'result_code' => $resultCode,
                'result_desc' => $resultDesc,
                'checkout_request_id' => $checkoutRequestId,
            ],
        ]);
    }

    mlg_json_response(200, ['ResultCode' => 0, 'ResultDesc' => 'Accepted']);
} catch (Throwable $e) {
    mlg_log_json_line('stk_callback_errors.log', [
        'error' => $e->getMessage(),
    ]);

    // Always acknowledge callback to avoid repeated retries; error is logged.
    mlg_json_response(200, ['ResultCode' => 0, 'ResultDesc' => 'Accepted']);
}
