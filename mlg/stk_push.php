<?php

declare(strict_types=1);

require_once __DIR__ . '/mpesa_common.php';

mlg_handle_options();
mlg_require_post();

try {
    $claims = mlg_verify_app_jwt();
    $role = strtolower(trim((string)($claims['role'] ?? '')));

    $body = mlg_read_json_body();

    $financeRoles = ['super_admin', 'treasurer'];
    if ($role !== 'member' && !in_array($role, $financeRoles, true)) {
        mlg_json_response(403, ['error' => 'Forbidden']);
    }

    $memberId = $role === 'member'
        ? trim((string)($claims['member_id'] ?? $claims['sub'] ?? ''))
        : trim((string)($body['memberId'] ?? $claims['member_id'] ?? ''));

    if ($memberId === '') {
        mlg_json_response(400, ['error' => 'memberId is required']);
    }

    $amount = (int)floor((float)($body['amount'] ?? 0));
    $phone = mlg_normalize_phone((string)($body['phone'] ?? ''));
    $accountReference = trim((string)($body['accountReference'] ?? ''));
    $transactionDesc = trim((string)($body['transactionDesc'] ?? ''));

    if ($amount <= 0 || $phone === '') {
        mlg_json_response(400, ['error' => 'phone and positive amount required']);
    }

    if ($accountReference === '') {
        $accountReference = 'WELFARE-' . $memberId;
    }

    if ($transactionDesc === '') {
        $transactionDesc = 'Welfare Society Payment';
    }

    $passkey = trim((string)(getenv('MPESA_PASSKEY') ?: ''));
    $shortcode = trim((string)(getenv('MPESA_SHORTCODE') ?: '174379'));
    if ($passkey === '' || $shortcode === '') {
        mlg_json_response(500, ['error' => 'Missing MPESA_PASSKEY or MPESA_SHORTCODE']);
    }

    $timestamp = mlg_mpesa_timestamp();
    $password = base64_encode($shortcode . $passkey . $timestamp);
    $accessToken = mlg_mpesa_access_token();

    $callbackUrl = trim((string)(getenv('MPESA_STK_CALLBACK_URL') ?: ''));
    if ($callbackUrl === '') {
        $host = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        if ($host !== '') {
            $callbackUrl = $scheme . '://' . $host . '/mlg/stk_callback.php';
        }
    }

    if ($callbackUrl === '') {
        mlg_json_response(500, ['error' => 'Missing MPESA_STK_CALLBACK_URL']);
    }

    $mpesaPayload = [
        'BusinessShortCode' => $shortcode,
        'Password' => $password,
        'Timestamp' => $timestamp,
        'TransactionType' => 'CustomerPayBillOnline',
        'Amount' => $amount,
        'PartyA' => $phone,
        'PartyB' => $shortcode,
        'PhoneNumber' => $phone,
        'AccountReference' => $accountReference,
        'TransactionDesc' => $transactionDesc,
        'CallBackURL' => $callbackUrl,
    ];

    $stkResp = mlg_http_json(
        'POST',
        mlg_mpesa_base_url() . '/mpesa/stkpush/v1/processrequest',
        $mpesaPayload,
        ['Authorization: Bearer ' . $accessToken]
    );

    if (($stkResp['status'] ?? 0) < 200 || ($stkResp['status'] ?? 0) >= 300) {
        $message = mlg_first_non_empty([
            $stkResp['json']['errorMessage'] ?? null,
            $stkResp['json']['error_description'] ?? null,
            $stkResp['json']['ResponseDescription'] ?? null,
            $stkResp['raw'] ?? null,
        ]);
        mlg_json_response(502, [
            'error' => 'STK push failed' . ($message !== '' ? ': ' . $message : ''),
        ]);
    }

    $checkoutRequestId = trim((string)($stkResp['json']['CheckoutRequestID'] ?? ''));
    if ($checkoutRequestId === '') {
        mlg_json_response(502, ['error' => 'M-Pesa STK response missing CheckoutRequestID']);
    }

    $txPayload = [
        'member_id' => $memberId,
        'amount' => $amount,
        'transaction_type' => 'wallet_funding',
        'payment_method' => 'mpesa',
        'reference' => $checkoutRequestId,
        'mpesa_reference' => $checkoutRequestId,
        'status' => 'pending',
        'description' => $transactionDesc,
        'metadata' => [
            'checkout_request_id' => $checkoutRequestId,
            'merchant_request_id' => $stkResp['json']['MerchantRequestID'] ?? null,
            'phone' => $phone,
            'initiated_at' => date('c'),
            'source' => 'php-stk-push',
        ],
    ];

    $txResp = mlg_supabase_request('POST', '/rest/v1/transactions', $txPayload, 'return=representation');
    if (($txResp['status'] ?? 0) < 200 || ($txResp['status'] ?? 0) >= 300) {
        mlg_log_json_line('stk_push_errors.log', [
            'where' => 'insert_pending_transaction',
            'status' => $txResp['status'] ?? 0,
            'response' => $txResp['raw'] ?? '',
            'checkout_request_id' => $checkoutRequestId,
        ]);
    }

    mlg_json_response(200, [
        'success' => true,
        'CheckoutRequestID' => $checkoutRequestId,
        'MerchantRequestID' => $stkResp['json']['MerchantRequestID'] ?? null,
        'ResponseCode' => $stkResp['json']['ResponseCode'] ?? null,
        'ResponseDescription' => $stkResp['json']['ResponseDescription'] ?? 'STK request accepted',
    ]);
} catch (Throwable $e) {
    $message = $e->getMessage();
    $lower = strtolower($message);

    if (str_contains($lower, 'forbidden')) {
        mlg_json_response(403, ['error' => $message]);
    }

    if (
        str_contains($lower, 'missing bearer token') ||
        str_contains($lower, 'jwt') ||
        str_contains($lower, 'session expired') ||
        str_contains($lower, 'signature verification')
    ) {
        mlg_json_response(401, ['error' => $message]);
    }

    mlg_json_response(500, ['error' => $message !== '' ? $message : 'Request failed']);
}
