<?php
include 'access_token.php';

$access_token = generateAccessToken();
if (!$access_token) {
    die(json_encode([
        'success' => false,
        'message' => 'Failed to get access token'
    ]));
}

// Debug
error_log("Access Token: $access_token");

$mpesaEnv = strtolower(getenv('MPESA_ENV') ?: 'production');
$shortcode = getenv('MPESA_SHORTCODE') ?: '';
$url = $mpesaEnv === 'sandbox'
    ? (getenv('MPESA_REGISTER_URL_SANDBOX') ?: 'https://sandbox.safaricom.co.ke/mpesa/c2b/v2/registerurl')
    : (getenv('MPESA_REGISTER_URL_PRODUCTION') ?: 'https://api.safaricom.co.ke/mpesa/c2b/v2/registerurl');
$confirmationUrl = getenv('MPESA_CONFIRMATION_URL') ?: '';
$validationUrl = getenv('MPESA_VALIDATION_URL') ?: '';

if ($shortcode === '' || $confirmationUrl === '' || $validationUrl === '') {
    die(json_encode([
        'success' => false,
        'message' => 'Missing env config: MPESA_SHORTCODE / MPESA_CONFIRMATION_URL / MPESA_VALIDATION_URL',
    ]));
}

$payload = [
    'ShortCode' => $shortcode,
    'ResponseType' => 'Completed',
    'ConfirmationURL' => $confirmationUrl,
    'ValidationURL' => $validationUrl
];

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $access_token,
        'Content-Type: application/json'
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($payload)
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

// Output response
echo json_encode([
    'http_status' => $httpCode,
    'curl_error' => $error,
    'token_used' => $access_token,
    'response' => json_decode($response, true),
    'raw_response' => $response
], JSON_PRETTY_PRINT);
?>
