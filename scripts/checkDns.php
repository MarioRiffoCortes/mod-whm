<?php
/**
 * checkDns.php — Valida que los NS REGISTRADOS EN NIC.CL para un dominio
 * .cl coincidan con los NS oficiales configurados para el servidor al
 * que pertenece la cuenta. Los NS oficiales viven en el config.php
 * propio de este módulo ($OFFICIAL_DNS).
 *
 * IMPORTANTE — por qué se consulta WHOIS y no solo DNS:
 * dns_get_record($domain, DNS_NS) no siempre refleja lo que dice
 * Nic.cl. Ese lookup pregunta a los propios servidores DNS del
 * dominio qué NS tienen configurados EN SU ZONA, lo cual puede haber
 * quedado desactualizado (ej: el cliente cambió el NS en Nic.cl pero
 * el servidor de nombres antiguo sigue respondiendo con su propio
 * registro NS interno, que no se actualizó). Lo único que coincide
 * 100% con lo que el usuario ve al entrar a Nic.cl es el WHOIS de
 * NIC Chile (whois.nic.cl), así que esa es la fuente principal aquí.
 * Si el WHOIS no responde (timeout, mantenimiento, TLD distinto de
 * .cl), se usa dns_get_record() como respaldo y se marca 'source'
 * como 'dns' para que quede claro en el resultado.
 *
 * Cada servidor en $OFFICIAL_DNS tiene además un 'estado' ('vigente' u
 * 'obsoleto'). Sirve para detectar dominios cuyo DNS quedó apuntando a
 * un servidor dado de baja (ej: SERVIDOR2, SERVIDOR3) aunque la cuenta
 * WHM ya no viva ahí.
 *
 * Además de comparar contra el servidor solicitado, hace una búsqueda
 * inversa: si los NS encontrados coinciden con OTRO servidor conocido,
 * lo informa (matched_server) para poder decir "está apuntando a X,
 * cámbialo a Y".
 *
 * GET params:
 *   domain  (requerido) — dominio a validar, ej: midominio.cl
 *   server  (requerido) — clave del servidor esperado, ej: SERVIDOR1
 */

header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', 0);

require_once __DIR__ . '/../ADM/auth.php';
require_once __DIR__ . '/../ADM/config.php';

$domain = isset($_GET['domain']) ? trim($_GET['domain']) : '';
$server = isset($_GET['server']) ? trim($_GET['server']) : '';

if (!$domain || !$server) {
    echo json_encode(['success' => false, 'message' => 'Faltan parámetros requeridos (domain, server).']);
    exit;
}

if (!isset($OFFICIAL_DNS[$server])) {
    echo json_encode(['success' => false, 'message' => "No hay DNS oficiales configurados para el servidor '$server'."]);
    exit;
}

function normalizeNsList(array $list): array
{
    return array_values(array_unique(array_map(fn($ns) => strtolower(rtrim($ns, '.')), $list)));
}

/**
 * Consulta el WHOIS oficial de NIC Chile (whois.nic.cl, puerto 43) y
 * devuelve los "Name Server" registrados, tal cual los muestra la web
 * de Nic.cl. Devuelve null si no se pudo consultar (timeout, etc.) —
 * en ese caso el llamador debe usar el respaldo por DNS.
 */
function queryNicClWhois(string $domain, int $timeoutSeconds = 5): ?array
{
    $fp = @fsockopen('whois.nic.cl', 43, $errno, $errstr, $timeoutSeconds);
    if (!$fp) {
        return null;
    }
    stream_set_timeout($fp, $timeoutSeconds);

    fwrite($fp, $domain . "\r\n");

    $response = '';
    while (!feof($fp)) {
        $chunk = fread($fp, 4096);
        if ($chunk === false) break;
        $response .= $chunk;
        $meta = stream_get_meta_data($fp);
        if (!empty($meta['timed_out'])) break;
    }
    fclose($fp);

    if (trim($response) === '') {
        return null;
    }

    // Nic.cl responde con líneas "Name Server: nsX.dominio.cl"
    $nsList = [];
    foreach (preg_split('/\r\n|\r|\n/', $response) as $line) {
        if (preg_match('/^\s*Name\s*Server\s*:\s*(.+)$/i', $line, $m)) {
            $ns = strtolower(trim(rtrim(trim($m[1]), '.')));
            if ($ns !== '') {
                $nsList[] = $ns;
            }
        }
    }

    return !empty($nsList) ? array_values(array_unique($nsList)) : null;
}

// Normalizar dominio (aceptar con protocolo, www, barra final, etc.)
$domainClean = strtolower($domain);
$domainClean = preg_replace('/^https?:\/\//', '', $domainClean);
$domainClean = preg_replace('/^www\./', '', $domainClean);
$domainClean = explode('/', $domainClean)[0];

// Convertir a Punycode si viene con acentos/ñ (las consultas requieren ASCII)
if (function_exists('idn_to_ascii') && preg_match('/[^\x00-\x7F]/', $domainClean)) {
    $ascii = idn_to_ascii($domainClean, 0, INTL_IDNA_VARIANT_UTS46);
    if ($ascii) $domainClean = $ascii;
}

$expectedNs     = normalizeNsList($OFFICIAL_DNS[$server]['ns']);
$expectedEstado = $OFFICIAL_DNS[$server]['estado'] ?? 'vigente';

$isClDomain = (bool) preg_match('/\.cl$/i', $domainClean);

$foundNs = null;
$source  = 'dns';

// 1) Fuente primaria para dominios .cl: WHOIS de Nic.cl (lo que el
//    usuario ve manualmente en la web de Nic.cl).
if ($isClDomain) {
    $whoisNs = queryNicClWhois($domainClean);
    if ($whoisNs !== null) {
        $foundNs = $whoisNs;
        $source  = 'nic.cl';
    }
}

// 2) Respaldo: si no es .cl, o si el WHOIS de Nic.cl no respondió,
//    se usa la resolución DNS normal.
if ($foundNs === null) {
    $nsRecords = @dns_get_record($domainClean, DNS_NS);
    if ($nsRecords !== false && !empty($nsRecords)) {
        $tmp = [];
        foreach ($nsRecords as $record) {
            if (isset($record['target'])) {
                $tmp[] = strtolower(rtrim($record['target'], '.'));
            }
        }
        $foundNs = array_values(array_unique($tmp));
    }
    $source = ($isClDomain ? 'dns_fallback' : 'dns');
}

if (empty($foundNs)) {
    echo json_encode([
        'success'               => true,
        'domain'                => $domainClean,
        'server'                => $server,
        'server_estado'         => $expectedEstado,
        'is_correct'            => false,
        'is_partial'            => false,
        'expected'              => $expectedNs,
        'found'                 => [],
        'source'                => $source,
        'matched_server'        => null,
        'matched_server_estado' => null,
        'matched_ns'            => [],
        'message'               => 'No se encontraron registros NS para este dominio (puede no estar delegado, tener un error de escritura, o no haberse podido consultar Nic.cl/DNS en este momento).',
    ]);
    exit;
}

// Coincidencia contra el servidor solicitado
$requestedMatchCount = count(array_intersect($foundNs, $expectedNs));
$isCorrect = $requestedMatchCount > 0 && $requestedMatchCount === count($expectedNs);
$isPartial = $requestedMatchCount > 0 && !$isCorrect;

// Búsqueda inversa: ¿a qué servidor conocido apuntan realmente los NS encontrados?
// (esto es lo que determina la etiqueta visual: puede ser distinto del
// servidor solicitado si el dominio quedó apuntando a uno obsoleto)
$matchedServer = null;
$matchedNs     = [];
$bestCount     = 0;

foreach ($OFFICIAL_DNS as $key => $info) {
    $normalized = normalizeNsList($info['ns']);
    $count = count(array_intersect($foundNs, $normalized));
    if ($count > 0 && $count > $bestCount) {
        $bestCount     = $count;
        $matchedServer = $key;
        $matchedNs     = $normalized;
    }
}

$matchedServerEstado = $matchedServer !== null ? ($OFFICIAL_DNS[$matchedServer]['estado'] ?? 'vigente') : null;

if ($isCorrect) {
    $message = "El servidor se encuentra correctamente apuntando a $server.";
} elseif ($matchedServer !== null && $matchedServer !== $server) {
    $obsoletoNote = ($matchedServerEstado === 'obsoleto') ? ' (servidor OBSOLETO, dado de baja)' : '';
    $message = "El dominio se encuentra apuntando a $matchedServer$obsoletoNote, cámbialo a los DNS de $server.";
} elseif ($isPartial) {
    $message = "Coincidencia parcial: solo $requestedMatchCount de " . count($expectedNs) . " NS esperados de $server están presentes.";
} else {
    $message = "El dominio no apunta a ninguno de nuestros servidores conocidos, cámbialo a los DNS de $server.";
}

if ($source === 'dns_fallback') {
    $message .= ' (Nic.cl no respondió a tiempo; este resultado usó una consulta DNS como respaldo, puede no coincidir 100% con Nic.cl.)';
}

echo json_encode([
    'success'               => true,
    'domain'                => $domainClean,
    'server'                => $server,
    'server_estado'         => $expectedEstado,
    'is_correct'            => $isCorrect,
    'is_partial'            => $isPartial,
    'expected'              => $expectedNs,
    'found'                 => $foundNs,
    'source'                => $source,
    'matched_server'        => $matchedServer,
    'matched_server_estado' => $matchedServerEstado,
    'matched_ns'            => $matchedNs,
    'message'               => $message,
]);
