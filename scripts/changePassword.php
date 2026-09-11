<?php
header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', 0);

set_error_handler(function ($errno, $errstr, $errfile, $errline) {
    $msg = "Error PHP [$errno] $errstr en $errfile:$errline";
    echo json_encode(["success" => false, "message" => $msg]);
    exit;
});

set_exception_handler(function ($e) {
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
    exit;
});

require_once __DIR__ . '/../ADM/auth.php';
require_once __DIR__ . '/../ADM/config.php';

$input = json_decode(file_get_contents("php://input"), true);
$domain = $input['domain'] ?? null;
$password = $input['password'] ?? null;
$sv = $input['sv'] ?? null;

if (!$domain || !$password || !$sv) {
    echo json_encode(["success" => false, "message" => "Error al cargar la información. Faltan parámetros requeridos."]);
    exit;
}

if (!isset($WH_SERVERS[$sv])) {
    echo json_encode(["success" => false, "message" => "Servidor '$sv' no configurado en el sistema."]);
    exit;
}

$creds = $WH_SERVERS[$sv];
$whmHost  = $creds['host'];
$whmUser  = $creds['user'];
$whmToken = $creds['token'];

$domainForWhm = $domain;
if (function_exists('idn_to_ascii')) {
    $converted = idn_to_ascii($domain, IDNA_DEFAULT, INTL_IDNA_VARIANT_UTS46);
    if ($converted !== false) {
        $domainForWhm = $converted;
    }
}

// 1. Buscar usuario de cPanel a través de listaccts
$listUrl = "https://$whmHost:2087/json-api/listaccts?api.version=1&search=" . urlencode($domainForWhm) . "&searchtype=domain";

$ch = curl_init($listUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => ["Authorization: whm $whmUser:$whmToken"],
    CURLOPT_SSL_VERIFYHOST => 0,
    CURLOPT_SSL_VERIFYPEER => 0,
    CURLOPT_TIMEOUT        => 20,
]);
$response = curl_exec($ch);
if ($response === false) {
    echo json_encode(["success" => false, "message" => "Error cURL al consultar WHM: " . curl_error($ch)]);
    exit;
}
curl_close($ch);

$data = json_decode($response, true);

if (empty($data['data']['acct'][0]['user'])) {
    echo json_encode(["success" => false, "message" => "Dominio no encontrado en el servidor WHM. Por favor verifique."]);
    exit;
}

$cpUser = $data['data']['acct'][0]['user'];

// 2. Ejecutar cambio de clave (passwd API)
$uapiUrl = "https://$whmHost:2087/json-api/passwd?api.version=1&user=" . urlencode($cpUser) . "&password=" . urlencode($password);

$ch = curl_init($uapiUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => ["Authorization: whm $whmUser:$whmToken"],
    CURLOPT_SSL_VERIFYHOST => 0,
    CURLOPT_SSL_VERIFYPEER => 0,
    CURLOPT_TIMEOUT        => 20,
]);
$response = curl_exec($ch);
if ($response === false) {
    echo json_encode(["success" => false, "message" => "Error cURL al cambiar contraseña en WHM: " . curl_error($ch)]);
    exit;
}
curl_close($ch);

$data = json_decode($response, true);

if (!empty($data['metadata']['result']) && $data['metadata']['result'] == 1) {
    echo json_encode(["success" => true, "message" => "Contraseña cambiada correctamente."]);
} else {
    echo json_encode([
        "success" => false,
        "message" => "Error al cambiar la contraseña en el servidor WHM.",
        "details" => $data
    ]);
}
exit;
