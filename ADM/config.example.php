<?php
/**
 * ADM/config.example.php — Plantilla de configuración
 * ────────────────────────────────────────────────────────────────────
 * Copia este archivo como "ADM/config.php" y reemplaza los valores de
 * ejemplo por los de tus propios servidores WHM. ADM/config.php NO
 * debe subirse a un repositorio público (ver .gitignore).
 */

// ──────────────────────────────────────────────────────────────
// SERVIDORES WHM — TOKENS API
// 'host'  → IP o dominio del servidor WHM/cPanel
// 'user'  → usuario root/reseller usado para autenticar contra la API
// 'token' → API Token generado en WHM (Home » Development » Manage API Tokens)
// ──────────────────────────────────────────────────────────────
$WH_SERVERS = [
    // 'SERVIDOR1' => [
    //     'host'  => 'IP_O_DOMINIO_DEL_SERVIDOR',
    //     'user'  => 'root',
    //     'token' => 'TU_API_TOKEN_AQUI',
    // ],
];

// ──────────────────────────────────────────────────────────────
// DNS OFICIALES POR SERVIDOR (opcional — solo si usas la validación
// de DNS del botón "Validar DNS"). Usado por: scripts/checkDns.php
// 'estado': 'vigente' u 'obsoleto'.
// ──────────────────────────────────────────────────────────────
$OFFICIAL_DNS = [
    // 'SERVIDOR1' => ['ns' => ['ns1.tudominio.com', 'ns2.tudominio.com'], 'estado' => 'vigente'],
];
