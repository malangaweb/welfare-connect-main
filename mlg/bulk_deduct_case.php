<?php
/**
 * Bulk "Deduct to Case" — debits member wallets for an active case (server-side, idempotent).
 * Called only from Supabase Edge (api-case-bulk-deduct) using X-Mlg-Internal-Key.
 */

header('Content-Type: application/json; charset=utf-8');

$configPath = __DIR__ . '/bulk_deduct_config.php';
if (!file_exists($configPath)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'bulk_deduct_config.php missing. Copy bulk_deduct_config.example.php.']);
    exit;
}

require_once $configPath;

$internal = $_SERVER['HTTP_X_MLG_INTERNAL_KEY'] ?? '';
if (!isset($MLG_INTERNAL_BULK_KEY) || $internal === '' || !hash_equals((string) $MLG_INTERNAL_BULK_KEY, (string) $internal)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid JSON body']);
    exit;
}

$caseId = isset($body['case_id']) ? trim((string) $body['case_id']) : '';
$memberIds = isset($body['member_ids']) && is_array($body['member_ids']) ? $body['member_ids'] : [];

if ($caseId === '' || empty($memberIds)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'case_id and non-empty member_ids are required']);
    exit;
}

// Dedupe member IDs while preserving order
$seen = [];
$uniqueMemberIds = [];
foreach ($memberIds as $mid) {
    $s = trim((string) $mid);
    if ($s === '' || isset($seen[$s])) {
        continue;
    }
    $seen[$s] = true;
    $uniqueMemberIds[] = $s;
}

global $supabaseUrl, $supabaseServiceRoleKey;
$key = $supabaseServiceRoleKey;

function sb_get(string $path, string $supabaseUrl, string $key): array
{
    $ch = curl_init($supabaseUrl . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            "apikey: $key",
            "Authorization: Bearer $key",
            "Content-Type: application/json",
        ],
    ]);
    $response = curl_exec($ch);
    $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    @curl_close($ch);
    return ['http' => $http, 'data' => json_decode($response, true)];
}

function sb_post(string $path, array $rows, string $supabaseUrl, string $key): array
{
    $ch = curl_init($supabaseUrl . $path);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            "apikey: $key",
            "Authorization: Bearer $key",
            "Content-Type: application/json",
            "Accept: application/json",
            "Prefer: return=minimal",
        ],
        CURLOPT_POSTFIELDS => json_encode($rows),
    ]);
    $response = curl_exec($ch);
    $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    @curl_close($ch);
    return ['http' => $http, 'body' => $response];
}

$caseResp = sb_get(
    '/rest/v1/cases?id=eq.' . rawurlencode($caseId) .
    '&select=id,case_number,contribution_per_member,is_active,is_finalized',
    $supabaseUrl,
    $key
);

if ($caseResp['http'] !== 200 || empty($caseResp['data'][0])) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Case not found']);
    exit;
}

$case = $caseResp['data'][0];
if (empty($case['is_active']) || !empty($case['is_finalized'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Case must be active and not finalized']);
    exit;
}

$required = floatval($case['contribution_per_member'] ?? 0);
if ($required <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid contribution_per_member on case']);
    exit;
}

$caseNumber = (string) ($case['case_number'] ?? '');

$deducted = [];
$skipped_already_paid = [];
$skipped_insufficient = [];
$skipped_ineligible = [];

foreach ($uniqueMemberIds as $memberId) {
    $paidResp = sb_get(
        '/rest/v1/transactions?member_id=eq.' . rawurlencode($memberId) .
        '&case_id=eq.' . rawurlencode($caseId) .
        '&transaction_type=in.(contribution,case_wallet_deduction)' .
        '&status=eq.completed' .
        '&select=id&limit=1',
        $supabaseUrl,
        $key
    );
    if ($paidResp['http'] === 200 && !empty($paidResp['data'])) {
        $skipped_already_paid[] = $memberId;
        continue;
    }

    $memResp = sb_get(
        '/rest/v1/members?id=eq.' . rawurlencode($memberId) .
        '&select=id,wallet_balance,is_active,status&limit=1',
        $supabaseUrl,
        $key
    );
    if ($memResp['http'] !== 200 || empty($memResp['data'][0])) {
        $skipped_insufficient[] = ['member_id' => $memberId, 'reason' => 'member_not_found'];
        continue;
    }

    $member = $memResp['data'][0];
    $isActive = !empty($member['is_active']);
    $status = strtolower(trim((string)($member['status'] ?? '')));
    if (!$isActive || !in_array($status, ['active', 'probation'], true)) {
        $skipped_ineligible[] = [
            'member_id' => $memberId,
            'reason' => 'member_not_eligible',
            'is_active' => $isActive,
            'status' => $status,
        ];
        continue;
    }

    $wallet = floatval($member['wallet_balance'] ?? 0);
    if ($wallet + 1e-6 < $required) {
        $skipped_insufficient[] = ['member_id' => $memberId, 'reason' => 'insufficient_balance', 'wallet_balance' => $wallet];
        continue;
    }

    $payload = [
        'member_id' => $memberId,
        'case_id' => $caseId,
        'amount' => round($required, 2),
        'transaction_type' => 'case_wallet_deduction',
        'payment_method' => 'wallet',
        'description' => 'Case wallet deduction — Case ' . $caseNumber,
        'status' => 'completed',
        'reference' => 'case_deduct:' . $caseId . ':' . $memberId,
        'metadata' => [
            'source' => 'php_bulk_deduct_case',
            'case_number' => $caseNumber,
        ],
    ];

    $ins = sb_post('/rest/v1/transactions', [$payload], $supabaseUrl, $key);

    if ($ins['http'] === 201 || $ins['http'] === 200) {
        $deducted[] = $memberId;
        continue;
    }

    // Unique violation / duplicate → treat as already deducted (idempotent retry)
    if ($ins['http'] === 409) {
        $skipped_already_paid[] = $memberId;
        continue;
    }

    $skipped_insufficient[] = [
        'member_id' => $memberId,
        'reason' => 'insert_failed',
        'http' => $ins['http'],
        'detail' => $ins['body'],
    ];
}

echo json_encode([
    'success' => true,
    'case_id' => $caseId,
    'case_number' => $caseNumber,
    'required_amount' => $required,
    'deducted' => $deducted,
    'skipped_already_paid' => $skipped_already_paid,
    'skipped_ineligible' => $skipped_ineligible,
    'skipped_insufficient' => $skipped_insufficient,
]);
