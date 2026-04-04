<?php
include 'access_token.php';

$access_token = generateAccessToken();
$shortcode = '600990'; // Your test shortcode
$msisdn = '254708374149'; // Sandbox test number

$url = 'https://sandbox.safaricom.co.ke/mpesa/c2b/v1/simulate';

$curl_post_data = [
    'ShortCode' => $shortcode,
    'CommandID' => 'CustomerPayBillOnline',
    'Amount' => '100',
    'Msisdn' => $msisdn,
    'BillRefNumber' => 'M011'
];

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type:application/json',
    'Authorization:Bearer ' . $access_token
]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($curl_post_data));

$response = curl_exec($ch);
curl_close($ch);

echo $response;
?>
