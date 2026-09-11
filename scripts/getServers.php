<?php
header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', 0);

require_once __DIR__ . '/../ADM/auth.php';
require_once __DIR__ . '/../ADM/config.php';

$output = [];
foreach ($WH_SERVERS as $name => $creds) {
    $output[] = [
        'server' => $name,
        'host'   => $creds['host']
    ];
}

echo json_encode(['success' => true, 'servers' => $output]);
