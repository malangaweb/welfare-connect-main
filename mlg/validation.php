<?php
$validationResponse = file_get_contents('php://input');

// Save or log to file for testing
file_put_contents('validation_log.json', $validationResponse, FILE_APPEND);

// Always respond with a 200 OK and success message
header("Content-Type: application/json");
echo json_encode([
    "ResultCode" => 0,
    "ResultDesc" => "Validation successful"
]);
?>
