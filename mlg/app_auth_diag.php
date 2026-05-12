<?php

declare(strict_types=1);

require_once __DIR__ . '/mpesa_common.php';

mlg_handle_options();

/**
 * Safe auth diagnostics endpoint.
 *
 * It never returns raw secrets or full token values.
 * Optional auth guard: set APP_DIAG_KEY on host and provide it via
 *   - x-diag-key header, or
 *   - ?key=<value> query param.
 */
mlg_load_env_files();

$requiredDiagKey = trim((string)(getenv('APP_DIAG_KEY') ?: ''));
$providedDiagKey = trim((string)(mlg_get_header_value('x-diag-key') ?: ($_GET['key'] ?? '')));

if ($requiredDiagKey !== '' && !hash_equals($requiredDiagKey, $providedDiagKey)) {
    mlg_json_response(403, ['error' => 'Forbidden']);
}

$sanitizeSecret = static function (string $raw): string {
    $secret = trim($raw);
    if (strlen($secret) >= 2) {
        $first = $secret[0];
        $last = $secret[strlen($secret) - 1];
        if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
            $secret = substr($secret, 1, -1);
        }
    }
    return trim($secret);
};

$fp = static function (string $value): ?string {
    if ($value === '') return null;
    return substr(hash('sha256', $value), 0, 12);
};

$token = mlg_get_app_token_from_request();
$tokenParts = [];
$verification = [];

if ($token !== '') {
    $parts = explode('.', $token);
    if (count($parts) === 3) {
        [$h, $p, $s] = $parts;
        $headerJson = mlg_base64url_decode($h);
        $payloadJson = mlg_base64url_decode($p);
        $header = json_decode($headerJson, true);
        $payload = json_decode($payloadJson, true);
        if (is_array($header)) {
            $tokenParts['header'] = $header;
        }
        if (is_array($payload)) {
            $tokenParts['payload_subset'] = [
                'sub' => $payload['sub'] ?? null,
                'role' => $payload['role'] ?? null,
                'member_id' => $payload['member_id'] ?? null,
                'iat' => $payload['iat'] ?? null,
                'exp' => $payload['exp'] ?? null,
            ];
        }
    }
}

$secretMap = [
    'APP_JWT_SECRET' => $sanitizeSecret((string)(getenv('APP_JWT_SECRET') ?: '')),
    'APP_AUTH_SECRET' => $sanitizeSecret((string)(getenv('APP_AUTH_SECRET') ?: '')),
];

if ($token !== '') {
    foreach ($secretMap as $name => $secret) {
        if ($secret === '') {
            $verification[$name] = ['configured' => false, 'valid' => false, 'reason' => 'not configured'];
            continue;
        }

        try {
            $parts = explode('.', $token);
            if (count($parts) !== 3) {
                throw new RuntimeException('invalid jwt format');
            }

            [$encodedHeader, $encodedPayload, $encodedSig] = $parts;
            $signature = mlg_base64url_decode($encodedSig);
            if ($signature === '') {
                throw new RuntimeException('invalid signature encoding');
            }

            $signedPart = $encodedHeader . '.' . $encodedPayload;
            $expected = hash_hmac('sha256', $signedPart, $secret, true);
            if (!hash_equals($expected, $signature)) {
                throw new RuntimeException('signature mismatch');
            }

            $payloadJson = mlg_base64url_decode($encodedPayload);
            $payload = json_decode($payloadJson, true);
            $now = time();
            $exp = is_array($payload) && isset($payload['exp']) ? (int)$payload['exp'] : 0;
            $expired = $exp > 0 && $exp <= $now;

            $verification[$name] = [
                'configured' => true,
                'valid' => !$expired,
                'reason' => $expired ? 'token expired' : 'ok',
            ];
        } catch (Throwable $e) {
            $verification[$name] = ['configured' => true, 'valid' => false, 'reason' => $e->getMessage()];
        }
    }
}

mlg_json_response(200, [
    'ok' => true,
    'timestamp' => date('c'),
    'secrets' => [
        'APP_JWT_SECRET' => [
            'configured' => $secretMap['APP_JWT_SECRET'] !== '',
            'sha256_12' => $fp($secretMap['APP_JWT_SECRET']),
        ],
        'APP_AUTH_SECRET' => [
            'configured' => $secretMap['APP_AUTH_SECRET'] !== '',
            'sha256_12' => $fp($secretMap['APP_AUTH_SECRET']),
        ],
    ],
    'token_provided' => $token !== '',
    'token' => $tokenParts,
    'verification' => $verification,
]);

