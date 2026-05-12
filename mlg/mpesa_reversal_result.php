<?php

declare(strict_types=1);

require_once __DIR__ . '/mpesa_common.php';

mlg_handle_options();
mlg_require_post();

try {
    $payload = mlg_read_json_body();
    mlg_log_json_line('mpesa_reversal_result_raw.log', $payload);

    $result = is_array($payload['Result'] ?? null) ? $payload['Result'] : [];
    $resultCode = (int)($result['ResultCode'] ?? -1);
    $resultDesc = trim((string)($result['ResultDesc'] ?? ''));
    $originatorConversationId = trim((string)($result['OriginatorConversationID'] ?? ''));
    $conversationId = trim((string)($result['ConversationID'] ?? ''));

    $parameters = [];
    $resultParameters = $result['ResultParameters']['ResultParameter'] ?? [];
    if (is_array($resultParameters)) {
        foreach ($resultParameters as $item) {
            if (!is_array($item)) {
                continue;
            }
            $name = trim((string)($item['Key'] ?? $item['Name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $parameters[$name] = $item['Value'] ?? null;
        }
    }

    $occasion = trim((string)($result['Occasion'] ?? ''));
    $transactionId = '';
    if (str_starts_with($occasion, 'REV_TX_')) {
        $transactionId = substr($occasion, 7);
    }

    if ($transactionId !== '') {
        $txResp = mlg_supabase_request(
            'GET',
            '/rest/v1/transactions?id=eq.' . rawurlencode($transactionId) . '&select=id,member_id,metadata&limit=1'
        );

        if (($txResp['status'] ?? 0) >= 200 && ($txResp['status'] ?? 0) < 300 && is_array($txResp['json']) && isset($txResp['json'][0]) && is_array($txResp['json'][0])) {
            $tx = $txResp['json'][0];
            $metadata = is_array($tx['metadata'] ?? null) ? $tx['metadata'] : [];
            $metadata['mpesa_reversal'] = array_merge(
                is_array($metadata['mpesa_reversal'] ?? null) ? $metadata['mpesa_reversal'] : [],
                [
                    'callback_received_at' => date('c'),
                    'callback_result_code' => $resultCode,
                    'callback_result_desc' => $resultDesc,
                    'originator_conversation_id' => $originatorConversationId !== '' ? $originatorConversationId : null,
                    'conversation_id' => $conversationId !== '' ? $conversationId : null,
                    'callback_parameters' => $parameters,
                    'completed' => $resultCode === 0,
                ]
            );

            mlg_supabase_request(
                'PATCH',
                '/rest/v1/transactions?id=eq.' . rawurlencode((string)$tx['id']),
                ['metadata' => $metadata],
                'return=minimal'
            );

            mlg_supabase_request('POST', '/rest/v1/audit_logs', [
                'user_id' => $tx['member_id'] ?? null,
                'action' => $resultCode === 0 ? 'MPESA_REVERSAL_COMPLETED' : 'MPESA_REVERSAL_FAILED',
                'table_name' => 'transactions',
                'record_id' => $tx['id'] ?? null,
                'status' => $resultCode === 0 ? 'success' : 'failed',
                'metadata' => [
                    'originator_conversation_id' => $originatorConversationId,
                    'conversation_id' => $conversationId,
                    'result_code' => $resultCode,
                    'result_desc' => $resultDesc,
                    'parameters' => $parameters,
                ],
            ]);
        }
    } else {
        mlg_log_json_line('mpesa_reversal_errors.log', [
            'where' => 'reversal_callback_missing_transaction_link',
            'originator_conversation_id' => $originatorConversationId,
            'conversation_id' => $conversationId,
            'occasion' => $occasion,
            'result_code' => $resultCode,
            'result_desc' => $resultDesc,
        ]);
    }

    mlg_json_response(200, ['ResultCode' => 0, 'ResultDesc' => 'Accepted']);
} catch (Throwable $e) {
    mlg_log_json_line('mpesa_reversal_errors.log', [
        'where' => 'reversal_callback_exception',
        'error' => $e->getMessage(),
    ]);

    // Always acknowledge Daraja callbacks to avoid retries.
    mlg_json_response(200, ['ResultCode' => 0, 'ResultDesc' => 'Accepted']);
}

