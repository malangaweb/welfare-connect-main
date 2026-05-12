<?php

declare(strict_types=1);

require_once __DIR__ . '/mpesa_common.php';

mlg_handle_options();
mlg_require_post();

try {
    $claims = mlg_verify_app_jwt();
    $role = strtolower(trim((string)($claims['role'] ?? '')));
    $financeRoles = ['super_admin', 'treasurer', 'chairperson'];
    if (!in_array($role, $financeRoles, true)) {
        mlg_json_response(403, ['error' => 'Forbidden']);
    }

    $body = mlg_read_json_body();
    $transactionId = trim((string)($body['transactionId'] ?? ''));
    $reason = trim((string)($body['reason'] ?? ''));

    if ($transactionId === '') {
        mlg_json_response(400, ['error' => 'transactionId is required']);
    }

    if ($reason === '') {
        mlg_json_response(400, ['error' => 'reason is required']);
    }

    $txResp = mlg_supabase_request(
        'GET',
        '/rest/v1/transactions?id=eq.' . rawurlencode($transactionId) .
        '&select=id,member_id,amount,payment_method,mpesa_reference,status,metadata&limit=1'
    );

    if (($txResp['status'] ?? 0) < 200 || ($txResp['status'] ?? 0) >= 300 || !is_array($txResp['json']) || !isset($txResp['json'][0])) {
        mlg_json_response(404, ['error' => 'Transaction not found']);
    }

    $tx = is_array($txResp['json'][0]) ? $txResp['json'][0] : [];
    $paymentMethod = strtolower(trim((string)($tx['payment_method'] ?? '')));
    if ($paymentMethod !== 'mpesa') {
        mlg_json_response(400, ['error' => 'Only M-Pesa transactions can be reversed via Daraja']);
    }

    $status = strtolower(trim((string)($tx['status'] ?? '')));
    if ($status === 'reversed') {
        mlg_json_response(400, ['error' => 'Transaction already reversed']);
    }

    $receipt = trim((string)($body['mpesaReceipt'] ?? $tx['mpesa_reference'] ?? ''));
    if ($receipt === '') {
        mlg_json_response(400, ['error' => 'M-Pesa receipt reference is required']);
    }

    $amount = (int)floor((float)($body['amount'] ?? abs((float)($tx['amount'] ?? 0))));
    if ($amount <= 0) {
        mlg_json_response(400, ['error' => 'amount must be positive']);
    }

    $initiator = trim((string)(getenv('MPESA_INITIATOR_NAME') ?: ''));
    $securityCredential = trim((string)(getenv('MPESA_SECURITY_CREDENTIAL') ?: ''));
    $shortcode = trim((string)(getenv('MPESA_SHORTCODE') ?: ''));

    if ($initiator === '' || $securityCredential === '' || $shortcode === '') {
        mlg_json_response(500, ['error' => 'Missing MPESA_INITIATOR_NAME, MPESA_SECURITY_CREDENTIAL or MPESA_SHORTCODE']);
    }

    $resultUrl = trim((string)(getenv('MPESA_REVERSAL_RESULT_URL') ?: ''));
    $timeoutUrl = trim((string)(getenv('MPESA_REVERSAL_TIMEOUT_URL') ?: ''));

    if ($resultUrl === '' || $timeoutUrl === '') {
        $host = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        if ($host !== '') {
            $fallback = $scheme . '://' . $host . '/mlg/mpesa_reversal_result.php';
            if ($resultUrl === '') {
                $resultUrl = $fallback;
            }
            if ($timeoutUrl === '') {
                $timeoutUrl = $fallback;
            }
        }
    }

    if ($resultUrl === '' || $timeoutUrl === '') {
        mlg_json_response(500, ['error' => 'Missing MPESA_REVERSAL_RESULT_URL or MPESA_REVERSAL_TIMEOUT_URL']);
    }

    $accessToken = mlg_mpesa_access_token();
    $reversalPayload = [
        'Initiator' => $initiator,
        'SecurityCredential' => $securityCredential,
        'CommandID' => 'TransactionReversal',
        'TransactionID' => $receipt,
        'Amount' => $amount,
        'ReceiverParty' => $shortcode,
        'RecieverIdentifierType' => '11',
        'ResultURL' => $resultUrl,
        'QueueTimeOutURL' => $timeoutUrl,
        'Remarks' => mb_substr($reason, 0, 100),
        'Occasion' => 'REV_TX_' . $transactionId,
    ];

    $darajaResp = mlg_http_json(
        'POST',
        mlg_mpesa_base_url() . '/mpesa/reversal/v1/request',
        $reversalPayload,
        ['Authorization: Bearer ' . $accessToken]
    );

    if (($darajaResp['status'] ?? 0) < 200 || ($darajaResp['status'] ?? 0) >= 300) {
        mlg_log_json_line('mpesa_reversal_errors.log', [
            'where' => 'daraja_reversal_request',
            'transaction_id' => $transactionId,
            'http_status' => $darajaResp['status'] ?? 0,
            'daraja_json' => $darajaResp['json'] ?? null,
            'daraja_raw' => $darajaResp['raw'] ?? null,
        ]);

        $message = mlg_first_non_empty([
            $darajaResp['json']['errorMessage'] ?? null,
            $darajaResp['json']['error_description'] ?? null,
            $darajaResp['json']['ResponseDescription'] ?? null,
            $darajaResp['raw'] ?? null,
        ]);

        mlg_json_response(502, ['error' => 'Daraja reversal request failed' . ($message !== '' ? ': ' . $message : '')]);
    }

    $originatorConversationId = trim((string)($darajaResp['json']['OriginatorConversationID'] ?? ''));
    $conversationId = trim((string)($darajaResp['json']['ConversationID'] ?? ''));

    $metadata = is_array($tx['metadata'] ?? null) ? $tx['metadata'] : [];
    $metadata['mpesa_reversal'] = [
        'initiated' => true,
        'initiated_at' => date('c'),
        'initiated_by_role' => $role,
        'reason' => $reason,
        'transaction_id' => $receipt,
        'amount' => $amount,
        'originator_conversation_id' => $originatorConversationId !== '' ? $originatorConversationId : null,
        'conversation_id' => $conversationId !== '' ? $conversationId : null,
        'result_url' => $resultUrl,
        'timeout_url' => $timeoutUrl,
    ];

    mlg_supabase_request(
        'PATCH',
        '/rest/v1/transactions?id=eq.' . rawurlencode($transactionId),
        ['metadata' => $metadata],
        'return=minimal'
    );

    mlg_supabase_request('POST', '/rest/v1/audit_logs', [
        'user_id' => $tx['member_id'] ?? null,
        'action' => 'MPESA_REVERSAL_INITIATED',
        'table_name' => 'transactions',
        'record_id' => $transactionId,
        'status' => 'success',
        'metadata' => [
            'mpesa_receipt' => $receipt,
            'amount' => $amount,
            'reason' => $reason,
            'originator_conversation_id' => $originatorConversationId,
            'conversation_id' => $conversationId,
        ],
    ]);

    mlg_json_response(200, [
        'success' => true,
        'ResponseCode' => $darajaResp['json']['ResponseCode'] ?? null,
        'ResponseDescription' => $darajaResp['json']['ResponseDescription'] ?? 'Reversal request accepted',
        'OriginatorConversationID' => $originatorConversationId !== '' ? $originatorConversationId : null,
        'ConversationID' => $conversationId !== '' ? $conversationId : null,
    ]);
} catch (Throwable $e) {
    $message = $e->getMessage();
    $lower = strtolower($message);

    if (
        str_contains($lower, 'missing bearer token') ||
        str_contains($lower, 'jwt') ||
        str_contains($lower, 'session expired') ||
        str_contains($lower, 'signature verification')
    ) {
        mlg_json_response(401, ['error' => $message]);
    }

    if (str_contains($lower, 'forbidden')) {
        mlg_json_response(403, ['error' => $message]);
    }

    mlg_json_response(500, ['error' => $message !== '' ? $message : 'Reversal request failed']);
}

