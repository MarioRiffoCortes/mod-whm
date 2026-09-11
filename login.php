<?php
session_start();
header('Content-Type: application/json');

$data = json_decode(file_get_contents('php://input'), true);
$username = $data['username'] ?? '';
$password = $data['password'] ?? '';

require __DIR__ . '/ADM/config-ad.php';

if (isset($USERS[$username]) && $USERS[$username] === $password) {
    $_SESSION['logged_in'] = true;
    $_SESSION['user'] = $username;
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'message' => 'Credenciales incorrectas']);
}
