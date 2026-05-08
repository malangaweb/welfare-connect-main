<?php
function loadEnvFiles() {
    static $loaded = false;
    if ($loaded) return;
    $loaded = true;

    $envFiles = [
        __DIR__ . '/.env',
        dirname(__DIR__) . '/.env',
    ];

    foreach ($envFiles as $file) {
        if (!is_file($file)) continue;

        $lines = @file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) continue;

        foreach ($lines as $line) {
            $line = trim((string)$line);
            if ($line === '' || str_starts_with($line, '#')) continue;
            if (str_starts_with($line, 'export ')) {
                $line = trim(substr($line, 7));
            }

            $eqPos = strpos($line, '=');
            if ($eqPos === false) continue;

            $key = trim(substr($line, 0, $eqPos));
            $value = trim(substr($line, $eqPos + 1));
            if ($key === '') continue;

            if (strlen($value) >= 2) {
                $first = $value[0];
                $last = $value[strlen($value) - 1];
                if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                    $value = substr($value, 1, -1);
                }
            }

            if (getenv($key) === false) {
                putenv("$key=$value");
                $_ENV[$key] = $value;
            }
        }
    }
}

function generateAccessToken() {
    loadEnvFiles();

    $consumerKey = getenv('MPESA_CONSUMER_KEY') ?: '';
    $consumerSecret = getenv('MPESA_CONSUMER_SECRET') ?: '';
    $mpesaEnv = strtolower(getenv('MPESA_ENV') ?: 'production');
    $url = $mpesaEnv === 'sandbox'
        ? (getenv('MPESA_OAUTH_URL_SANDBOX') ?: 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials')
        : (getenv('MPESA_OAUTH_URL_PRODUCTION') ?: 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials');

    if ($consumerKey === '' || $consumerSecret === '') {
        return null;
    }

    $credentials = base64_encode($consumerKey . ':' . $consumerSecret);

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Basic ' . $credentials,
            'Content-Type: application/json'
        ]
    ]);

    $response = curl_exec($ch);
    @curl_close($ch); // Suppress PHP 8.5 deprecation warning

    $result = json_decode($response);
    return $result->access_token ?? null;
}
