<?php

declare(strict_types=1);

function mlg_load_env_files(): void
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

            // Strip optional wrapping quotes.
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

function mlg_json_response(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, x-app-token');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function mlg_handle_options(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
        mlg_json_response(200, ['ok' => true]);
    }
}

function mlg_require_post(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        mlg_json_response(405, ['error' => 'Method not allowed']);
    }
}

function mlg_read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function mlg_get_header_value(string $name): string
{
    $target = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    $val = $_SERVER[$target] ?? '';
    return is_string($val) ? trim($val) : '';
}

function mlg_get_app_token_from_request(): string
{
    $token = mlg_get_header_value('x-app-token');
    if ($token !== '') {
        return $token;
    }

    $auth = mlg_get_header_value('Authorization');
    if (stripos($auth, 'Bearer ') === 0) {
        return trim(substr($auth, 7));
    }

    return '';
}

function mlg_base64url_decode(string $input): string
{
    $remainder = strlen($input) % 4;
    if ($remainder > 0) {
        $input .= str_repeat('=', 4 - $remainder);
    }
    $input = strtr($input, '-_', '+/');
    $decoded = base64_decode($input, true);
    return $decoded === false ? '' : $decoded;
}

function mlg_verify_app_jwt(): array
{
    mlg_load_env_files();

    $token = mlg_get_app_token_from_request();
    if ($token === '') {
        throw new RuntimeException('Missing bearer token');
    }

    $secret = getenv('APP_JWT_SECRET') ?: '';
    $localError = '';

    if ($secret !== '') {
        try {
            $parts = explode('.', $token);
            if (count($parts) !== 3) {
                throw new RuntimeException('Invalid JWT format');
            }

            [$encodedHeader, $encodedPayload, $encodedSig] = $parts;
            $headerJson = mlg_base64url_decode($encodedHeader);
            $payloadJson = mlg_base64url_decode($encodedPayload);
            $signature = mlg_base64url_decode($encodedSig);

            if ($headerJson === '' || $payloadJson === '' || $signature === '') {
                throw new RuntimeException('Invalid JWT encoding');
            }

            $header = json_decode($headerJson, true);
            $payload = json_decode($payloadJson, true);
            if (!is_array($header) || !is_array($payload)) {
                throw new RuntimeException('Invalid JWT payload');
            }

            if (($header['alg'] ?? '') !== 'HS256') {
                throw new RuntimeException('Unsupported JWT algorithm');
            }

            $signedPart = $encodedHeader . '.' . $encodedPayload;
            $expected = hash_hmac('sha256', $signedPart, $secret, true);

            if (!hash_equals($expected, $signature)) {
                throw new RuntimeException('Signature verification failed');
            }

            $now = time();
            $exp = isset($payload['exp']) ? (int)$payload['exp'] : 0;
            if ($exp > 0 && $exp <= $now) {
                throw new RuntimeException('Session expired');
            }

            return $payload;
        } catch (Throwable $e) {
            $localError = $e->getMessage();
        }
    } else {
        $localError = 'APP_JWT_SECRET is not configured';
    }

    $remoteClaims = mlg_verify_app_token_via_supabase_functions($token);
    if (is_array($remoteClaims)) {
        return $remoteClaims;
    }

    throw new RuntimeException($localError !== '' ? $localError : 'Unauthorized');
}

function mlg_verify_app_token_via_supabase_functions(string $token): ?array
{
    $baseUrl = mlg_supabase_url();
    $serviceKey = mlg_supabase_key();
    if ($baseUrl === '' || $serviceKey === '') {
        return null;
    }

    $headers = [
        'apikey: ' . $serviceKey,
        'Authorization: Bearer ' . $serviceKey,
        'x-app-token: ' . $token,
    ];

    // Member token path (works without request member_id because function can infer from claims).
    $memberResp = mlg_http_json(
        'POST',
        $baseUrl . '/functions/v1/api-member-summary',
        [],
        $headers
    );

    if (($memberResp['status'] ?? 0) >= 200 && ($memberResp['status'] ?? 0) < 300 && is_array($memberResp['json'])) {
        $member = $memberResp['json']['member'] ?? null;
        if (is_array($member) && !empty($member['id'])) {
            return [
                'sub' => (string)$member['id'],
                'member_id' => (string)$member['id'],
                'member_number' => isset($member['member_number']) ? (string)$member['member_number'] : null,
                'role' => 'member',
            ];
        }
    }

    // Finance token path.
    $financeResp = mlg_http_json(
        'GET',
        $baseUrl . '/functions/v1/api-accounts-summary',
        null,
        $headers
    );

    if (($financeResp['status'] ?? 0) >= 200 && ($financeResp['status'] ?? 0) < 300) {
        return [
            'sub' => null,
            'member_id' => null,
            'member_number' => null,
            // Role value chosen to satisfy existing finance check in stk_push.php.
            'role' => 'treasurer',
        ];
    }

    return null;
}

function mlg_normalize_phone(string $phone): string
{
    $digits = preg_replace('/\D+/', '', $phone) ?? '';
    if ($digits === '') {
        return '';
    }
    if (str_starts_with($digits, '254')) {
        return $digits;
    }
    if (strlen($digits) === 9 && str_starts_with($digits, '7')) {
        return '254' . $digits;
    }
    if (str_starts_with($digits, '0')) {
        return '254' . substr($digits, 1);
    }
    return $digits;
}

function mlg_first_non_empty(array $values): string
{
    foreach ($values as $value) {
        $v = trim((string)($value ?? ''));
        if ($v !== '') {
            return $v;
        }
    }
    return '';
}

function mlg_http_json(string $method, string $url, ?array $payload = null, array $headers = []): array
{
    $ch = curl_init($url);
    $httpHeaders = array_merge(['Accept: application/json'], $headers);

    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_HTTPHEADER => $httpHeaders,
        CURLOPT_TIMEOUT => 45,
        CURLOPT_CONNECTTIMEOUT => 15,
    ];

    if ($payload !== null) {
        $opts[CURLOPT_POSTFIELDS] = json_encode($payload, JSON_UNESCAPED_SLASHES);
        $opts[CURLOPT_HTTPHEADER][] = 'Content-Type: application/json';
    }

    curl_setopt_array($ch, $opts);
    $raw = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    $text = is_string($raw) ? trim($raw) : '';
    $decoded = null;
    if ($text !== '') {
        $json = json_decode($text, true);
        if (is_array($json)) {
            $decoded = $json;
        }
    }

    return [
        'status' => $status,
        'raw' => $text,
        'json' => $decoded,
        'error' => $err,
    ];
}

function mlg_mpesa_base_url(): string
{
    mlg_load_env_files();
    $env = strtolower((string)(getenv('MPESA_ENV') ?: 'production'));
    return $env === 'sandbox' ? 'https://sandbox.safaricom.co.ke' : 'https://api.safaricom.co.ke';
}

function mlg_mpesa_access_token(): string
{
    mlg_load_env_files();

    $consumerKey = trim((string)(getenv('MPESA_CONSUMER_KEY') ?: ''));
    $consumerSecret = trim((string)(getenv('MPESA_CONSUMER_SECRET') ?: ''));

    if ($consumerKey === '' || $consumerSecret === '') {
        throw new RuntimeException('Missing MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET');
    }

    $auth = base64_encode($consumerKey . ':' . $consumerSecret);
    $url = mlg_mpesa_base_url() . '/oauth/v1/generate?grant_type=client_credentials';
    $resp = mlg_http_json('GET', $url, null, [
        'Authorization: Basic ' . $auth,
        'Cache-Control: no-cache',
    ]);

    if (($resp['status'] ?? 0) < 200 || ($resp['status'] ?? 0) >= 300) {
        $message = mlg_first_non_empty([
            $resp['json']['errorMessage'] ?? null,
            $resp['json']['error_description'] ?? null,
            $resp['raw'] ?? null,
        ]);
        throw new RuntimeException('Failed to get M-Pesa access token' . ($message !== '' ? ': ' . $message : ''));
    }

    $token = trim((string)($resp['json']['access_token'] ?? ''));
    if ($token === '') {
        throw new RuntimeException('M-Pesa access token response missing access_token');
    }

    return $token;
}

function mlg_mpesa_timestamp(): string
{
    $dt = new DateTime('now', new DateTimeZone('Africa/Nairobi'));
    return $dt->format('YmdHis');
}

function mlg_supabase_url(): string
{
    mlg_load_env_files();
    return rtrim((string)(getenv('SUPABASE_URL') ?: ''), '/');
}

function mlg_supabase_key(): string
{
    mlg_load_env_files();
    return (string)(getenv('SUPABASE_SERVICE_ROLE_KEY') ?: getenv('SUPABASE_KEY') ?: '');
}

function mlg_supabase_request(string $method, string $path, ?array $payload = null, string $prefer = ''): array
{
    $baseUrl = mlg_supabase_url();
    $key = mlg_supabase_key();

    if ($baseUrl === '' || $key === '') {
        throw new RuntimeException('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured');
    }

    $headers = [
        'apikey: ' . $key,
        'Authorization: Bearer ' . $key,
    ];

    if ($prefer !== '') {
        $headers[] = 'Prefer: ' . $prefer;
    }

    return mlg_http_json($method, $baseUrl . $path, $payload, $headers);
}

function mlg_log_json_line(string $fileName, array $data): void
{
    $line = json_encode([
        'time' => date('c'),
        'data' => $data,
    ], JSON_UNESCAPED_SLASHES) . PHP_EOL;

    file_put_contents(__DIR__ . '/' . $fileName, $line, FILE_APPEND);
}
