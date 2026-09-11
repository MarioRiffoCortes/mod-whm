<?php
header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', 0);

require_once __DIR__ . '/../ADM/auth.php';
require_once __DIR__ . '/../ADM/config.php';

// Leer datos de entrada (JSON POST o FORM POST)
$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

$action = $input['action'] ?? null;
$server = $input['server'] ?? null;
$user   = $input['user'] ?? null;
$domain = $input['domain'] ?? '';
$reason = $input['reason'] ?? '';

if (!$action || !$server || !$user) {
    echo json_encode(['success' => false, 'message' => 'Faltan parámetros requeridos (action, server, user).']);
    exit;
}

if (!isset($WH_SERVERS[$server])) {
    echo json_encode(['success' => false, 'message' => 'Servidor no encontrado en la configuración.']);
    exit;
}

$creds = $WH_SERVERS[$server];
$whmHost  = $creds['host'];
$whmUser  = $creds['user']; // El usuario root o admin para conectarse
$whmToken = $creds['token'];

$apiUrl = '';

switch ($action) {
    case 'suspend':
        $apiUrl = "https://$whmHost:2087/json-api/suspendacct?api.version=1&user=" . urlencode($user);
        if ($reason) {
            $apiUrl .= "&reason=" . urlencode($reason);
        }
        break;

    case 'unsuspend':
        $apiUrl = "https://$whmHost:2087/json-api/unsuspendacct?api.version=1&user=" . urlencode($user);
        break;

    case 'remove':
        $apiUrl = "https://$whmHost:2087/json-api/removeacct?api.version=1&user=" . urlencode($user);
        break;

    default:
        echo json_encode(['success' => false, 'message' => 'Acción no válida.']);
        exit;
}

// Ejecutar cURL a WHM
$ch = curl_init($apiUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => ["Authorization: whm $whmUser:$whmToken"],
    CURLOPT_SSL_VERIFYHOST => 0,
    CURLOPT_SSL_VERIFYPEER => 0,
    CURLOPT_TIMEOUT        => 30, // Algunas operaciones como remove pueden tardar más
]);

$res = curl_exec($ch);
$err = curl_error($ch);
curl_close($ch);

if ($err) {
    echo json_encode(['success' => false, 'message' => "Error cURL: $err"]);
    exit;
}

$data = json_decode($res, true);

if (!$data) {
    echo json_encode(['success' => false, 'message' => 'Respuesta WHM inválida o vacía.']);
    exit;
}

// Verificar metadata de la respuesta de WHM
$metadata = $data['metadata'] ?? [];
if (($metadata['result'] ?? 0) === 1) {

    // Reflejar el cambio en la caché local (data_<SERVIDOR>.json) que
    // alimenta el panel, para que la ficha se vea actualizada al instante
    // sin tener que "Recargar este servidor" (que sí vuelve a consultar
    // WHM de verdad). Es solo una actualización de la vista.
    updateCacheAccount($server, $user, $domain, $action, $reason);

    $msg = $metadata['reason'] ?? 'Acción ejecutada con éxito.';
    echo json_encode(['success' => true, 'message' => $msg]);

} else {
    echo json_encode(['success' => false, 'message' => $metadata['reason'] ?? 'Error desconocido en WHM.']);
}


// ──────────────────────────────────────────────
// Actualizar la ficha de una cuenta dentro de la caché data_<SERVIDOR>.json
// (solo la cuenta afectada, sin volver a consultar WHM).
// ──────────────────────────────────────────────
function updateCacheAccount(string $server, string $user, string $domain, string $action, string $reason): void
{
    $cacheFile = __DIR__ . '/cache/data_' . preg_replace('/[^a-zA-Z0-9_-]/', '_', $server) . '.json';
    if (!file_exists($cacheFile)) {
        return; // Sin caché previa: nada que actualizar (el próximo listAccounts.php la generará).
    }

    $cached = json_decode(file_get_contents($cacheFile), true);
    if (!is_array($cached) || empty($cached['accounts']) || !is_array($cached['accounts'])) {
        return;
    }

    $changed = false;

    foreach ($cached['accounts'] as &$acc) {
        if (($acc['user'] ?? '') !== $user) continue;
        if ($domain !== '' && ($acc['domain'] ?? '') !== $domain) continue;

        if ($action === 'suspend') {
            $acc['suspended']     = true;
            $acc['suspendReason'] = $reason;
            $acc['suspendTime']   = time();
        } elseif ($action === 'unsuspend') {
            $acc['suspended']     = false;
            $acc['suspendReason'] = '';
            $acc['suspendTime']   = null;
        } elseif ($action === 'remove') {
            $acc['removed'] = true;
        }

        $changed = true;
        break;
    }
    unset($acc);

    if ($changed) {
        @file_put_contents($cacheFile, json_encode($cached));
    }
}
