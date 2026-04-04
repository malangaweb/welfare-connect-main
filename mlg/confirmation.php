<?php

// ==================================================
// SUPABASE CONFIG (SERVICE ROLE KEY ONLY)
// ==================================================
$supabaseUrl = 'https://hfojxbfcjozguobwtcgt.supabase.co';
$supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhmb2p4YmZjam96Z3VvYnd0Y2d0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQxMDQzMiwiZXhwIjoyMDU3OTg2NDMyfQ.wqm4HmM2zPM1h3Eb17sELQz40Zsjp2ruAwBBroQaA1c';

// ==================================================
// RECEIVE SAFARICOM CALLBACK
// ==================================================
$input = file_get_contents("php://input");
$data  = json_decode($input, true);

// Log raw callback
file_put_contents(
    'confirmation_log.json',
    date('c') . PHP_EOL . $input . PHP_EOL,
    FILE_APPEND
);

// ==================================================
// PREPARE TRANSACTION OBJECT
// ==================================================
$transaction = [
    'transaction_type'     => $data['TransactionType']     ?? null,
    'trans_id'             => $data['TransID']             ?? null,
    'trans_time'           => isset($data['TransTime'])
        ? date('Y-m-d H:i:s', strtotime($data['TransTime']) + (3 * 3600)) // UTC+3 (East Africa Time)
        : null,
    'trans_amount'         => $data['TransAmount']         ?? null,
    'business_shortcode'   => $data['BusinessShortCode']   ?? null,
    'bill_ref_number'      => trim($data['BillRefNumber'] ?? ''),
    'invoice_number'       => $data['InvoiceNumber']       ?? null,
    'org_account_balance'  => $data['OrgAccountBalance']   ?? null,
    'third_party_trans_id' => $data['ThirdPartyTransID']   ?? null,
    'msisdn'               => $data['MSISDN']              ?? null,
    'first_name'           => $data['FirstName']           ?? null,
    'middle_name'          => $data['MiddleName']          ?? null,
    'last_name'            => $data['LastName']            ?? null
];

// ==================================================
// LOG ALL TRANSACTIONS (IGNORE DUPLICATES SAFELY)
// ==================================================
supabaseInsertIgnoreDuplicates(
    '/rest/v1/mpesa_transactions',
    $transaction
);

// ==================================================
// BASIC VALIDATION
// ==================================================
if (empty($transaction['trans_id']) || empty($transaction['trans_amount'])) {
    storeWrongTransaction($transaction, 'Missing TransID or TransAmount', $data, 'unknown', null);
    respondToSafaricom();
}

// ==================================================
// IDEMPOTENCY GUARD
// ==================================================
// Safaricom may retry callbacks for the same TransID.
// If we already posted this receipt to transactions, skip re-processing.
if (transactionAlreadyPosted($transaction['trans_id'])) {
    respondToSafaricom();
}

// ==================================================
// BILL REF NUMBER VALIDATION
// ==================================================
if ($transaction['bill_ref_number'] === '') {
    storeWrongTransaction($transaction, 'Missing BillRefNumber', $data, 'unknown', null);
    respondToSafaricom();
}

// ==================================================
// PARSE COMPOUND REFERENCE
// ==================================================
$parsedReference = parseBillReference($transaction['bill_ref_number']);
$referenceType = $parsedReference['format'];

file_put_contents(
    'confirmation_log.json',
    date('c') . " PARSED: " . json_encode($parsedReference) . PHP_EOL,
    FILE_APPEND
);

// ==================================================
// RESOLVE MEMBER (from reference)
// ==================================================
$memberId = null;
$caseId = null;
$member = null;
$caseData = null;

// 1. Resolve member number if present in reference
if (!empty($parsedReference['member_number'])) {
    $memberResponse = supabaseGet(
        "/rest/v1/members?member_number=eq." .
        urlencode($parsedReference['member_number']) .
        "&select=id,wallet_balance"
    );
    if ($memberResponse['http'] === 200 && !empty($memberResponse['data'])) {
        $memberId = $memberResponse['data'][0]['id'];
        $member = $memberResponse['data'][0];
    }
}

// 2. Resolve case number if present in reference
if (!empty($parsedReference['case_number'])) {
    $caseResponse = supabaseGet(
        "/rest/v1/cases?case_number=eq." .
        urlencode($parsedReference['case_number']) .
        "&select=id,contribution_per_member,is_active,is_finalized"
    );
    if ($caseResponse['http'] === 200 && !empty($caseResponse['data'])) {
        $caseInfo = $caseResponse['data'][0];
        if ($caseInfo['is_active'] && !$caseInfo['is_finalized']) {
            $caseId = $caseInfo['id'];
            $caseData = $caseInfo;
        }
    }
}

// 3. Fallback: try payer's phone number (only when no member was specified)
if (empty($memberId) && !empty($parsedReference['phone'])) {
    // Normalize the phone from reference
    $refPhone = preg_replace('/\D/', '', $parsedReference['phone']);
    if (substr($refPhone, 0, 1) === '0') {
        $refPhone = '254' . substr($refPhone, 1);
    }
    $memberResponse = supabaseGet(
        "/rest/v1/members?phone_number=eq." .
        urlencode($refPhone) .
        "&select=id,wallet_balance"
    );
    if ($memberResponse['http'] === 200 && !empty($memberResponse['data'])) {
        $memberId = $memberResponse['data'][0]['id'];
        $member = $memberResponse['data'][0];
    }
}

// 4. Fallback: try original member number lookup (backwards compatibility)
if (empty($memberId) && $referenceType === 'member_only') {
    $memberResponse = supabaseGet(
        "/rest/v1/members?member_number=eq." .
        urlencode($transaction['bill_ref_number']) .
        "&select=id,wallet_balance"
    );
    if ($memberResponse['http'] === 200 && !empty($memberResponse['data'])) {
        $memberId = $memberResponse['data'][0]['id'];
        $member = $memberResponse['data'][0];
    }
}

// ==================================================
// DETERMINE OUTCOME
// ==================================================

// SCENARIO 1: Member + Case → Create case contribution
if (!empty($memberId) && !empty($caseId) && floatval($transaction['trans_amount']) > 0) {
    $currentWallet = floatval($member['wallet_balance'] ?? 0);
    $newWallet = $currentWallet + floatval($transaction['trans_amount']);

    // Create contribution transaction
    $txPayload = [
        'member_id' => $memberId,
        'case_id' => $caseId,
        'amount' => floatval($transaction['trans_amount']),
        'transaction_type' => 'contribution',
        'payment_method' => 'mpesa',
        'mpesa_reference' => $transaction['trans_id'],
        'reference' => $transaction['bill_ref_number'],
        'description' => 'M-Pesa Case Payment - Case ' . $parsedReference['case_number'] . ' for Member ' . $parsedReference['member_number'],
        'status' => 'completed',
        'created_at' => $transaction['trans_time'],
        'metadata' => json_encode([
            'webhook_source' => 'php_confirmation_v2',
            'payment_for' => 'case',
            'case_number' => $parsedReference['case_number'],
            'expected_contribution' => $caseData['contribution_per_member'] ?? null
        ])
    ];

    supabaseInsertStrict('/rest/v1/transactions', $txPayload);

    // Update wallet
    supabasePatch(
        "/rest/v1/members?id=eq." . $memberId,
        ['wallet_balance' => $newWallet]
    );

    sendSmsIfValid($transaction);
    respondToSafaricom();
}

// SCENARIO 2: Member only → Regular wallet funding
if (!empty($memberId) && empty($caseId) && floatval($transaction['trans_amount']) > 0) {
    $currentWallet = floatval($member['wallet_balance'] ?? 0);
    $newWallet = $currentWallet + floatval($transaction['trans_amount']);

    $walletUpdate = supabasePatch(
        "/rest/v1/members?id=eq." . $memberId,
        ['wallet_balance' => $newWallet]
    );

    if ($walletUpdate['http'] !== 204) {
        storeWrongTransaction(
            $transaction,
            'Wallet update failed',
            $data,
            $referenceType,
            $parsedReference
        );
        respondToSafaricom();
    }

    sendSmsIfValid($transaction);
    respondToSafaricom();
}

// SCENARIO 3: No member resolved → Wrong transaction
$reason = 'BillRefNumber not linked to any member';
if ($referenceType === 'member_and_case') {
    $reason = 'Member ' . $parsedReference['member_number'] . ' not found';
    if (empty($caseId) && !empty($parsedReference['case_number'])) {
        $reason = 'Case ' . $parsedReference['case_number'] . ' not found or inactive; Member ' . $parsedReference['member_number'] . ' not found';
    }
} elseif ($referenceType === 'case_only') {
    $reason = 'Case-only payment (' . $parsedReference['case_number'] . '); cannot identify which member to credit';
}

storeWrongTransaction(
    $transaction,
    $reason,
    $data,
    $referenceType,
    $parsedReference
);

sendSmsIfValid($transaction);
respondToSafaricom();


// ==================================================
// FUNCTIONS
// ==================================================

function supabaseInsertIgnoreDuplicates($path, $payload)
{
    global $supabaseUrl, $supabaseKey;

    $ch = curl_init($supabaseUrl . $path);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            "apikey: $supabaseKey",
            "Authorization: Bearer $supabaseKey",
            "Content-Type: application/json",
            "Prefer: resolution=ignore-duplicates"
        ],
        CURLOPT_POSTFIELDS => json_encode([$payload])
    ]);

    curl_exec($ch);
    @curl_close($ch); // Suppress PHP 8.5 deprecation warning
}

function supabaseInsertStrict($path, $payload)
{
    global $supabaseUrl, $supabaseKey;

    $ch = curl_init($supabaseUrl . $path);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            "apikey: $supabaseKey",
            "Authorization: Bearer $supabaseKey",
            "Content-Type: application/json",
            "Accept: application/json",
            "Prefer: return=representation"
        ],
        CURLOPT_POSTFIELDS => json_encode([$payload])
    ]);

    $response = curl_exec($ch);
    $http     = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    @curl_close($ch); // Suppress PHP 8.5 deprecation warning

    file_put_contents(
        'wrong_insert.log',
        json_encode([
            'path' => $path,
            'http' => $http,
            'payload' => $payload,
            'response' => $response
        ], JSON_PRETTY_PRINT) . PHP_EOL,
        FILE_APPEND
    );
}

function supabaseGet($path)
{
    global $supabaseUrl, $supabaseKey;

    $ch = curl_init($supabaseUrl . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            "apikey: $supabaseKey",
            "Authorization: Bearer $supabaseKey",
            "Content-Type: application/json"
        ]
    ]);

    $response = curl_exec($ch);
    $http     = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    @curl_close($ch); // Suppress PHP 8.5 deprecation warning

    return [
        'http' => $http,
        'data' => json_decode($response, true)
    ];
}

function supabasePatch($path, $payload)
{
    global $supabaseUrl, $supabaseKey;

    $ch = curl_init($supabaseUrl . $path);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => 'PATCH',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            "apikey: $supabaseKey",
            "Authorization: Bearer $supabaseKey",
            "Content-Type: application/json",
            "Prefer: return=minimal"
        ],
        CURLOPT_POSTFIELDS => json_encode($payload)
    ]);

    curl_exec($ch);
    $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    @curl_close($ch); // Suppress PHP 8.5 deprecation warning

    return ['http' => $http];
}

/**
 * Parse M-Pesa BillRefNumber into structured components.
 * 
 * Supported formats:
 * - "45" or "M045" → member only
 * - "C045" → case only
 * - "45#C045" or "M045#C045" → member AND case
 * - "079970#M299" or "079970#299" → phone AND member (legacy)
 * - "#C045" → case only (hash prefix)
 * - "893#" → member only (hash suffix)
 */
function parseBillReference($raw)
{
    $trimmed = trim($raw);
    
    if (empty($trimmed)) {
        return ['member_number' => null, 'case_number' => null, 'phone' => null, 'format' => 'unknown', 'raw' => $raw];
    }
    
    // Handle edge cases with leading/trailing hash
    if (strpos($trimmed, '#') === 0 && substr_count($trimmed, '#') === 1) {
        $afterHash = trim(substr($trimmed, 1));
        $upper = strtoupper($afterHash);
        if (preg_match('/^C\d+$/i', $upper)) {
            return ['member_number' => null, 'case_number' => $upper, 'phone' => null, 'format' => 'case_only', 'raw' => $raw];
        }
        $num = preg_replace('/^M/i', '', $upper);
        if (preg_match('/^\d+$/', $num)) {
            return ['member_number' => $num, 'case_number' => null, 'phone' => null, 'format' => 'member_only', 'raw' => $raw];
        }
    }
    
    if (substr($trimmed, -1) === '#' && strpos($trimmed, '#') === strlen($trimmed) - 1) {
        $beforeHash = trim(substr($trimmed, 0, -1));
        $num = preg_replace('/^M/i', '', $beforeHash);
        if (preg_match('/^\d+$/', $num)) {
            return ['member_number' => $num, 'case_number' => null, 'phone' => null, 'format' => 'member_only', 'raw' => $raw];
        }
    }
    
    // No hash separator - single value
    if (strpos($trimmed, '#') === false) {
        $upper = strtoupper($trimmed);
        if (preg_match('/^C\d+$/i', $upper)) {
            return ['member_number' => null, 'case_number' => $upper, 'phone' => null, 'format' => 'case_only', 'raw' => $raw];
        }
        $num = preg_replace('/^M/i', '', $upper);
        if (preg_match('/^\d+$/', $num)) {
            return ['member_number' => $num, 'case_number' => null, 'phone' => null, 'format' => 'member_only', 'raw' => $raw];
        }
        $digits = preg_replace('/\D/', '', $trimmed);
        if (strlen($digits) >= 9 && strlen($digits) <= 13) {
            return ['member_number' => null, 'case_number' => null, 'phone' => $trimmed, 'format' => 'unknown', 'raw' => $raw];
        }
        return ['member_number' => null, 'case_number' => null, 'phone' => null, 'format' => 'unknown', 'raw' => $raw];
    }
    
    // Has hash separator - compound reference
    $parts = array_values(array_filter(array_map('trim', explode('#', $trimmed))));
    
    if (count($parts) === 2) {
        $left = strtoupper($parts[0]);
        $right = strtoupper($parts[1]);
        
        $isCase = function ($s) {
            return preg_match('/^C\d+$/i', $s);
        };
        $isMemberNum = function ($s) {
            $stripped = preg_replace('/^M/i', '', $s);
            return preg_match('/^\d+$/', $stripped);
        };
        $isPhone = function ($s) {
            $digits = preg_replace('/\D/', '', $s);
            return strlen($digits) >= 9 && strlen($digits) <= 13;
        };
        $extractMemberNum = function ($s) {
            return preg_replace('/^M/i', '', $s);
        };
        
        // Pattern: Member#Case (e.g., M004#C001 or 45#C045)
        if ($isMemberNum($left) && $isCase($right)) {
            return [
                'member_number' => $extractMemberNum($left),
                'case_number' => $right,
                'phone' => null,
                'format' => 'member_and_case',
                'raw' => $raw
            ];
        }
        
        // Pattern: Case#Member (e.g., C001#M004) - reverse order
        if ($isCase($left) && $isMemberNum($right)) {
            return [
                'member_number' => $extractMemberNum($right),
                'case_number' => $left,
                'phone' => null,
                'format' => 'member_and_case',
                'raw' => $raw
            ];
        }
        
        // Pattern: Phone#Member (e.g., 079970#M299)
        if ($isPhone($left) && $isMemberNum($right)) {
            return [
                'member_number' => $extractMemberNum($right),
                'case_number' => null,
                'phone' => $left,
                'format' => 'phone_and_member',
                'raw' => $raw
            ];
        }
        
        // Pattern: Member#Phone (e.g., M299#079970) - reverse order
        if ($isMemberNum($left) && $isPhone($right)) {
            return [
                'member_number' => $extractMemberNum($left),
                'case_number' => null,
                'phone' => $right,
                'format' => 'phone_and_member',
                'raw' => $raw
            ];
        }
    }
    
    return ['member_number' => null, 'case_number' => null, 'phone' => null, 'format' => 'unknown', 'raw' => $raw];
}

function storeWrongTransaction($transaction, $reason, $rawPayload, $referenceType = 'unknown', $parsedReference = null)
{
    // Idempotency guard for suspense inserts as well
    if (!empty($transaction['trans_id']) && wrongTransactionAlreadyStored($transaction['trans_id'])) {
        return;
    }

    // Extract phone number from MSISDN (handle hashed or plain formats)
    $phoneNumber = $transaction['msisdn'] ?? '';
    // If MSISDN is hashed (64 char hex), store a truncated version for tracking
    // If it's a plain phone, normalize it
    if (!empty($phoneNumber) && preg_match('/^[a-f0-9]{64}$/i', $phoneNumber)) {
        // Store hash prefix for tracking
        $phoneNumber = 'hash_' . substr($phoneNumber, 0, 43);
    } elseif (!empty($phoneNumber)) {
        $phoneNumber = preg_replace('/\D/', '', $phoneNumber);
        if (substr($phoneNumber, 0, 1) === '0') {
            $phoneNumber = '254' . substr($phoneNumber, 1);
        }
    }
    
    // Fallback if still empty
    if (empty($phoneNumber)) {
        $phoneNumber = 'unknown';
    }

    // Build sender name from available fields
    $senderName = trim(
        $transaction['first_name'] . ' ' .
        $transaction['middle_name'] . ' ' .
        $transaction['last_name']
    );

    // Store all original data in metadata for audit
    $metadata = [
        'transaction_type'     => $transaction['transaction_type'],
        'business_shortcode'   => $transaction['business_shortcode'],
        'invoice_number'       => $transaction['invoice_number'],
        'third_party_trans_id' => $transaction['third_party_trans_id'],
        'org_account_balance'  => $transaction['org_account_balance'],
        'msisdn'               => $transaction['msisdn'],
        'first_name'           => $transaction['first_name'],
        'middle_name'          => $transaction['middle_name'],
        'last_name'            => $transaction['last_name'],
        'error_reason'         => $reason,
        'raw_payload'          => $rawPayload,
        'parsed_reference'     => $parsedReference
    ];

    $payload = [
        'mpesa_receipt_number' => $transaction['trans_id'],
        'phone_number'         => $phoneNumber,
        'amount'               => floatval($transaction['trans_amount']),
        'sender_name'          => $senderName ?: 'Unknown',
        'transaction_date'     => $transaction['trans_time'],
        'status'               => 'pending',
        'reference'            => $transaction['bill_ref_number'],
        'metadata'             => $metadata,
        'notes'                => $reason,
        'reference_type'       => $referenceType
    ];

    // Add intended_member_id and intended_case_id if available
    if ($parsedReference) {
        if (!empty($parsedReference['member_number'])) {
            // Try to look up the member ID
            $memberResponse = supabaseGet(
                "/rest/v1/members?member_number=eq." .
                urlencode($parsedReference['member_number']) .
                "&select=id"
            );
            if ($memberResponse['http'] === 200 && !empty($memberResponse['data'])) {
                $payload['intended_member_id'] = $memberResponse['data'][0]['id'];
            }
        }
        if (!empty($parsedReference['case_number'])) {
            // Try to look up the case ID
            $caseResponse = supabaseGet(
                "/rest/v1/cases?case_number=eq." .
                urlencode($parsedReference['case_number']) .
                "&select=id,is_active,is_finalized"
            );
            if ($caseResponse['http'] === 200 && !empty($caseResponse['data'])) {
                $payload['intended_case_id'] = $caseResponse['data'][0]['id'];
            }
        }
    }

    supabaseInsertStrict('/rest/v1/wrong_mpesa_transactions', $payload);
}

function transactionAlreadyPosted($transId)
{
    if (empty($transId)) return false;

    $response = supabaseGet(
        "/rest/v1/transactions?mpesa_reference=eq." .
        urlencode($transId) .
        "&select=id&limit=1"
    );

    return $response['http'] === 200 && !empty($response['data']);
}

function wrongTransactionAlreadyStored($transId)
{
    if (empty($transId)) return false;

    $response = supabaseGet(
        "/rest/v1/wrong_mpesa_transactions?mpesa_receipt_number=eq." .
        urlencode($transId) .
        "&select=id&limit=1"
    );

    return $response['http'] === 200 && !empty($response['data']);
}

function sendSmsIfValid($transaction)
{
    if (
        empty($transaction['msisdn']) ||
        !preg_match('/^(254|0)\d{9}$/', $transaction['msisdn'])
    ) {
        return;
    }

    $mobile = preg_replace('/\D/', '', $transaction['msisdn']);
    if (substr($mobile, 0, 1) === '0') {
        $mobile = '254' . substr($mobile, 1);
    }

    $message = "Asante kwa mchango wako wa Ksh " .
        number_format($transaction['trans_amount'], 2) .
        ". Tumeupokea.";

    // SEND SMS HERE (API REMOVED FOR SAFETY)
}

function respondToSafaricom()
{
    header('Content-Type: application/json');
    echo json_encode([
        'ResultCode' => 0,
        'ResultDesc' => 'Transaction received and processed'
    ]);
    exit;
}
