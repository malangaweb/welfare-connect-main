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

$shortcode = '4164179';
$url = 'https://api.safaricom.co.ke/mpesa/c2b/v2/registerurl';

$payload = [
    'ShortCode' => $shortcode,
    'ResponseType' => 'Completed',
    'ConfirmationURL' => 'https://javanet.co.ke/mlg/confirmation.php',
    'ValidationURL' => 'https://javanet.co.ke/mlg/validation.php'
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
