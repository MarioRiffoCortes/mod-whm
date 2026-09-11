<?php

/**
 * Middleware de Autenticación (mod-whm)
 * Debe ser incluido al inicio de cualquier endpoint o script interno
 * que realice acciones o devuelva datos sensibles.
 *
 * Misma lógica que config/auth.php del portal de Soporte: si no hay
 * sesión activa, responde 401 en JSON para llamadas AJAX, o redirige
 * al login (index.php de este mismo proyecto) en una navegación directa.
 */

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Verificar si el usuario ha iniciado sesión
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {

    // ¿La respuesta ya se está preparando como JSON? Todos los endpoints
    // de la API llaman header('Content-Type: application/json...') ANTES
    // de incluir este archivo, así que si ese header ya fue enviado,
    // estamos en un endpoint AJAX sí o sí.
    $expectsJson = false;
    foreach (headers_list() as $sentHeader) {
        if (stripos($sentHeader, 'Content-Type:') === 0 && stripos($sentHeader, 'application/json') !== false) {
            $expectsJson = true;
            break;
        }
    }

    $isAjax = $expectsJson ||
        (!empty($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) == 'xmlhttprequest') ||
        strpos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false;

    if ($isAjax) {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Acceso denegado. Sesión expirada o no iniciada.']);
        exit;
    } else {
        // Petición directa desde el navegador: en vez de dejar al usuario
        // en una página muerta de error 403, lo mandamos directo al login
        // (raíz de mod-whm), sea cual sea la carpeta desde la que se
        // llamó a este script.
        http_response_code(401);

        $rootFs  = rtrim(str_replace('\\', '/', dirname(__DIR__)), '/'); // .../mod-whm
        $docRoot = rtrim(str_replace('\\', '/', $_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
        $urlPrefix = '';
        if ($docRoot !== '' && strpos($rootFs, $docRoot) === 0) {
            $urlPrefix = substr($rootFs, strlen($docRoot));
        }

        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host     = $_SERVER['HTTP_HOST'] ?? '';

        header('Location: ' . $protocol . '://' . $host . $urlPrefix . '/index.php?expired=1');
        exit;
    }
}
