<?php
/**
 * Bulk "Deduct to Case" — debits member wallets for an active case (server-side, idempotent).
 * Called only from Supabase Edge (api-case-bulk-deduct) using X-Mlg-Internal-Key.
 */

header('Content-Type: application/json; charset=utf-8');

if (!function_exists('mlg_load_local_env_files')) {
    function mlg_load_local_env_files(): void
    {
        static $loaded = false;
        if ($loaded) {
            return;
        }
        $loaded = true;

        $envFiles = [
            __DIR__ . '/.env',
            dirname(__DIR__) . '/.env',
        ];

        foreach ($envFiles as $file) {
            if (!is_file($file)) {
                continue;
            }
            $lines = @file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if (!is_array($lines)) {
                continue;
            }
            foreach ($lines as $line) {
                $line = trim((string)$line);
                if ($line === '' || str_starts_with($line, '#')) {
                    continue;
                }
                if (str_starts_with($line, 'export ')) {
                    $line = trim(substr($line, 7));
                }
                $eqPos = strpos($line, '=');
                if ($eqPos === false) {
                    continue;
                }
                $key = trim(substr($line, 0, $eqPos));
                $value = trim(substr($line, $eqPos + 1));
                if ($key === '') {
                    continue;
                }
                if (strlen($value) >= 2) {
                    $first = $value[0];
                    $last = $value[strlen($value) - 1];
                    if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                        $value = substr($value, 1, -1);
                    }
                }
                if (getenv($key) === false) {
                    putenv("{$key}={$value}");
                    $_ENV[$key] = $value;
                }
            }
        }
    }
}
mlg_load_local_env_files();

$supabaseUrl = rtrim((string)(getenv('SUPABASE_URL') ?: ''), '/');
$supabaseServiceRoleKey = (string)(getenv('SUPABASE_SERVICE_ROLE_KEY') ?: getenv('SUPABASE_KEY') ?: '');
$MLG_INTERNAL_BULK_KEY = (string)(getenv('MLG_INTERNAL_BULK_KEY') ?: '');

// Optional override file (recommended for cPanel)
$configPath = __DIR__ . '/bulk_deduct_config.php';
if (file_exists($configPath)) {
    require_once $configPath;
}

if ($supabaseUrl === '' || $supabaseServiceRoleKey === '' || $MLG_INTERNAL_BULK_KEY === '') {
    $missing = [];
    if ($supabaseUrl === '') {
        $missing[] = 'SUPABASE_URL';
    }
    if ($supabaseServiceRoleKey === '') {
        $missing[] = 'SUPABASE_SERVICE_ROLE_KEY';
    }
    if ($MLG_INTERNAL_BULK_KEY === '') {
        $missing[] = 'MLG_INTERNAL_BULK_KEY';
    }

    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Server misconfigured: missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or MLG_INTERNAL_BULK_KEY',
        'missing' => $missing,
    ]);
    exit;
}

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

function sb_patch(string $path, array $payload, string $supabaseUrl, string $key): array
{
    $ch = curl_init($supabaseUrl . $path);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => 'PATCH',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            "apikey: $key",
            "Authorization: Bearer $key",
            "Content-Type: application/json",
            "Accept: application/json",
            "Prefer: return=representation",
        ],
        CURLOPT_POSTFIELDS => json_encode($payload),
    ]);
    $response = curl_exec($ch);
    $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    @curl_close($ch);
    return ['http' => $http, 'body' => $response];
}

function getNetPaidForCase(string $memberId, string $caseId, string $supabaseUrl, string $key): float
{
    $resp = sb_get(
        '/rest/v1/transactions?member_id=eq.' . rawurlencode($memberId) .
        '&case_id=eq.' . rawurlencode($caseId) .
        '&or=(status.eq.completed,status.is.null)' .
        '&transaction_type=in.(contribution,case_wallet_deduction,contribution_refund,case_wallet_refund)' .
        '&select=transaction_type,amount',
        $supabaseUrl,
        $key
    );
    if ($resp['http'] !== 200 || !is_array($resp['data'])) {
        return 0.0;
    }

    $gross = 0.0;
    $refunded = 0.0;
    foreach ($resp['data'] as $row) {
        $type = strtolower(trim((string)($row['transaction_type'] ?? '')));
        $amount = floatval($row['amount'] ?? 0);
        if ($type === 'contribution' || $type === 'case_wallet_deduction') {
            $gross += abs($amount);
            continue;
        }
        if ($type === 'contribution_refund' || $type === 'case_wallet_refund') {
            if ($amount >= 0) {
                $refunded += $amount;
            } else {
                $gross += $amount; // negative refund behaves like deduction
            }
        }
    }
    return $gross - $refunded;
}

function resolveCaseDeductionConflict(
    string $memberId,
    string $caseId,
    float $required,
    float $netPaid,
    string $supabaseUrl,
    string $key
): array {
    if ($netPaid + 1e-6 >= $required) {
        return ['ok' => false, 'reason' => 'already_paid'];
    }

    $existingResp = sb_get(
        '/rest/v1/transactions?member_id=eq.' . rawurlencode($memberId) .
        '&case_id=eq.' . rawurlencode($caseId) .
        '&transaction_type=eq.case_wallet_deduction' .
        '&select=id,amount,status&order=created_at.desc&limit=1',
        $supabaseUrl,
        $key
    );

    if ($existingResp['http'] !== 200 || empty($existingResp['data'][0]['id'])) {
        return [
            'ok' => false,
            'reason' => 'conflict_row_not_found',
            'http' => $existingResp['http'],
            'response' => $existingResp['data'],
        ];
    }

    $existing = $existingResp['data'][0];
    $existingAmount = abs(floatval($existing['amount'] ?? 0));
    $existingStatus = strtolower(trim((string)($existing['status'] ?? '')));
    $currentCounted = ($existingStatus === '' || $existingStatus === 'completed') ? $existingAmount : 0.0;

    // Add one required deduction to the currently counted contribution.
    // If the previous row was reversed, currentCounted=0, so this restores one deduction.
    $newAmount = round($currentCounted + $required, 2);
    if ($newAmount <= 0) {
        $newAmount = round($required, 2);
    }

    $patch = sb_patch(
        '/rest/v1/transactions?id=eq.' . rawurlencode((string) $existing['id']),
        [
            'amount' => $newAmount,
            'status' => 'completed',
            'payment_method' => 'wallet',
        ],
        $supabaseUrl,
        $key
    );

    if ($patch['http'] === 200 || $patch['http'] === 204) {
        return ['ok' => true];
    }

    return [
        'ok' => false,
        'reason' => 'conflict_patch_failed',
        'http' => $patch['http'],
        'response' => $patch['body'],
    ];
}

$caseResp = sb_get(
    '/rest/v1/cases?id=eq.' . rawurlencode($caseId) .
    '&select=id,case_number,contribution_per_member,is_active,is_finalized',
    $supabaseUrl,
    $key
);

if ($caseResp['http'] !== 200 || empty($caseResp['data'][0])) {
    http_response_code(404);
    echo json_encode([
        'success' => false,
        'error' => 'Case not found',
        'debug' => [
            'http' => $caseResp['http'],
            'case_id' => $caseId,
            'data' => $caseResp['data'],
        ]
    ]);
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
    $netPaid = getNetPaidForCase($memberId, $caseId, $supabaseUrl, $key);
    if ($netPaid + 1e-6 >= $required) {
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
        $skipped_insufficient[] = [
            'member_id' => $memberId,
            'reason' => 'member_not_found',
            'http_status' => $memResp['http'],
            'response' => $memResp['data'],
        ];
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

    // Unique violation / duplicate
    if ($ins['http'] === 409) {
        $conflictResolved = resolveCaseDeductionConflict($memberId, $caseId, $required, $netPaid, $supabaseUrl, $key);
        if (!empty($conflictResolved['ok'])) {
            $deducted[] = $memberId;
            continue;
        }
        if (($conflictResolved['reason'] ?? '') === 'already_paid') {
            $skipped_already_paid[] = $memberId;
            continue;
        }
        $skipped_insufficient[] = [
            'member_id' => $memberId,
            'reason' => 'conflict_recovery_failed',
            'detail' => $conflictResolved,
        ];
        continue;
    }

    // Compatibility retry: some deployments enforce stricter constraints
    // on optional columns like payment_method/metadata. Retry without them.
    $compatPayload = $payload;
    unset($compatPayload['payment_method']);
    unset($compatPayload['metadata']);
    $insCompat = sb_post('/rest/v1/transactions', [$compatPayload], $supabaseUrl, $key);

    if ($insCompat['http'] === 201 || $insCompat['http'] === 200) {
        $deducted[] = $memberId;
        continue;
    }
    if ($insCompat['http'] === 409) {
        $conflictResolved = resolveCaseDeductionConflict($memberId, $caseId, $required, $netPaid, $supabaseUrl, $key);
        if (!empty($conflictResolved['ok'])) {
            $deducted[] = $memberId;
            continue;
        }
        if (($conflictResolved['reason'] ?? '') === 'already_paid') {
            $skipped_already_paid[] = $memberId;
            continue;
        }
        $skipped_insufficient[] = [
            'member_id' => $memberId,
            'reason' => 'conflict_recovery_failed',
            'detail' => $conflictResolved,
        ];
        continue;
    }

    $skipped_insufficient[] = [
        'member_id' => $memberId,
        'reason' => 'insert_failed',
        'http' => $ins['http'],
        'detail' => $ins['body'],
        'retry_http' => $insCompat['http'],
        'retry_detail' => $insCompat['body'],
    ];
}

echo json_encode([
    'success' => true,
    'case_id' => $caseId,
    'case_number' => $caseNumber,
    'required_amount' => $required,
    'deducted' => $deducted,
    'deducted_count' => count($deducted),
    'skipped_already_paid' => $skipped_already_paid,
    'skipped_already_paid_count' => count($skipped_already_paid),
    'skipped_ineligible' => $skipped_ineligible,
    'skipped_ineligible_count' => count($skipped_ineligible),
    'skipped_insufficient' => $skipped_insufficient,
    'skipped_insufficient_count' => count($skipped_insufficient),
    'total_processed' => count($uniqueMemberIds),
]);
