<?php
function generateAccessToken() {
    $consumerKey = '84auHNRfqMsJqSOGwmjKXBLNDWshxxZIBIAAXAWpkvGCKSxQ';
    $consumerSecret = 'DTcG21aSKAQ7oRWiYYoGxKjexrOdMMZ7PIYApGMYEF51xP5oswhfDhVglLASjliA';

    $credentials = base64_encode($consumerKey . ':' . $consumerSecret);
    $url = 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

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
