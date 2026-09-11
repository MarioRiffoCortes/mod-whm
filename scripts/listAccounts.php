<?php
header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', 0);

require_once __DIR__ . '/../ADM/auth.php';
require_once __DIR__ . '/../ADM/config.php';

// Obtener servidor solicitado (o todos)
$requestedServer = $_GET['server'] ?? null;
$force = isset($_GET['force']) && $_GET['force'] == '1';

$cacheDir = __DIR__ . '/cache';
if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0755, true);
    @file_put_contents($cacheDir . '/.htaccess', "Deny from all\n");
}

$servers = $WH_SERVERS;
if ($requestedServer && isset($servers[$requestedServer])) {
    $servers = [$requestedServer => $servers[$requestedServer]];
}

$output = [];

// Servidores de solo lectura: nunca se regeneran (no se consulta WHM),
// solo se lee y se muestra el data_*.json que ya existe en caché.
$staticServers = ['NSB'];

foreach ($servers as $name => $creds) {
    $cacheFile = $cacheDir . '/data_' . preg_replace('/[^a-zA-Z0-9_-]/', '_', $name) . '.json';

    if (in_array($name, $staticServers, true)) {
        if (file_exists($cacheFile)) {
            $cachedData = json_decode(file_get_contents($cacheFile), true);
            if (is_array($cachedData)) {
                $output[] = $cachedData;
                continue;
            }
        }
        $output[] = [
            'server'   => $name,
            'host'     => $creds['host'] ?? '',
            'accounts' => [],
            'error'    => 'Sin datos en caché (servidor de solo lectura)',
        ];
        continue;
    }

    // Verificar caché
    if (!$force && file_exists($cacheFile)) {
        $fileDate = date('Y-m-d', filemtime($cacheFile));
        if ($fileDate === date('Y-m-d')) {
            $cachedData = json_decode(file_get_contents($cacheFile), true);
            if (is_array($cachedData) && !isset($cachedData['error'])) {
                $output[] = $cachedData;
                continue;
            }
        }
    }

    $accounts = getWhmAccounts($creds['host'], $creds['user'], $creds['token']);

    $serverData = [
        'server'   => $name,
        'host'     => $creds['host'],
        'accounts' => [],
        'error'    => null,
    ];

    if (isset($accounts['error'])) {
        $serverData['error'] = $accounts['error'];
        $output[] = $serverData;
        continue;
    }

    function punycodeDecode(string $encoded): string
    {
        if (strpos($encoded, 'xn--') === false) {
            return $encoded;
        }

        // Usar idn_to_utf8 si está disponible
        if (function_exists('idn_to_utf8')) {
            return idn_to_utf8($encoded, 0, INTL_IDNA_VARIANT_UTS46) ?: $encoded;
        }

        // Fallback: decodificar etiqueta por etiqueta
        $parts = explode('.', $encoded);
        $decoded = [];

        foreach ($parts as $part) {
            if (strpos($part, 'xn--') !== 0) {
                $decoded[] = $part;
                continue;
            }

            $part = substr($part, 4); // quitar "xn--"
            $delimPos = strrpos($part, '-');

            if ($delimPos !== false) {
                $basic  = substr($part, 0, $delimPos);
                $extended = substr($part, $delimPos + 1);
            } else {
                $basic  = '';
                $extended = $part;
            }

            $output = str_split($basic);

            // Constantes Punycode
            $n = 128;
            $bias = 72;
            $i = 0;
            $base = 36;
            $tMin = 1;
            $tMax = 26;
            $skew = 38;
            $damp = 700;

            $adaptBias = function (int $delta, int $numPoints, bool $firstTime) use ($base, $tMin, $tMax, $skew, $damp): int {
                $delta = $firstTime ? intdiv($delta, $damp) : $delta >> 1;
                $delta += intdiv($delta, $numPoints);
                $k = 0;
                while ($delta > intdiv(($base - $tMin) * $tMax, 2)) {
                    $delta = intdiv($delta, $base - $tMin);
                    $k += $base;
                }
                return $k + intdiv(($base - $tMin + 1) * $delta, $delta + $skew);
            };

            $decodeDigit = function (int $cp) use ($base): int {
                if ($cp - 48 < 10) return $cp - 22;
                if ($cp - 65 < 26) return $cp - 65;
                if ($cp - 97 < 26) return $cp - 97;
                return $base;
            };

            $len = strlen($extended);
            $pos = 0;
            $firstTime = true;

            while ($pos < $len) {
                $oldi = $i;
                $w = 1;
                for ($k = $base;; $k += $base) {
                    if ($pos >= $len) break;
                    $digit = $decodeDigit(ord($extended[$pos++]));
                    $i += $digit * $w;
                    $t = $k <= $bias ? $tMin : ($k >= $bias + $tMax ? $tMax : $k - $bias);
                    if ($digit < $t) break;
                    $w *= $base - $t;
                }
                $bias = $adaptBias($i - $oldi, count($output) + 1, $firstTime);
                $firstTime = false;
                $n += intdiv($i, count($output) + 1);
                $i %= count($output) + 1;
                array_splice($output, $i, 0, [mb_chr($n, 'UTF-8')]);
                $i++;
            }

            $decoded[] = implode('', $output);
        }

        return implode('.', $decoded);
    }

    foreach ($accounts as $acc) {

        $domain     = $acc['domain'] ?? '';

        // Convertir formato Punycode (xn--) a UTF-8 para mostrarlo legible
        if (strpos($domain, 'xn--') !== false) {
            $domain = punycodeDecode($domain);
        }

        $suspended  = isset($acc['suspended']) ? (bool)$acc['suspended'] : false;
        $diskUsed   = $acc['diskused'] ?? '0';
        $diskLimit  = $acc['disklimit'] ?? '0';
        $user       = $acc['user'] ?? '';
        $plan       = $acc['plan'] ?? '';
        $suspendReason = $acc['suspendreason'] ?? '';
        $suspendTime   = $acc['suspendtime'] ?? null;

        $serverData['accounts'][] = [
            'domain'         => $domain,
            'user'           => $user,
            'plan'           => $plan,
            'suspended'      => $suspended,
            'suspendReason'  => $suspendReason,
            'suspendTime'    => $suspendTime,
            'diskUsed'       => $diskUsed,
            'diskLimit'      => $diskLimit,
        ];
    }

    // Ordenar: activos primero, luego suspendidos
    usort($serverData['accounts'], fn($a, $b) => $a['suspended'] <=> $b['suspended']);

    // Guardar en caché si no hay error
    if (!isset($serverData['error'])) {
        file_put_contents($cacheFile, json_encode($serverData));
    }

    $output[] = $serverData;
}

echo json_encode(['success' => true, 'servers' => $output]);

// ──────────────────────────────────────────────
// Obtener listado de cuentas WHM (listaccts)
// ──────────────────────────────────────────────
function getWhmAccounts(string $host, string $user, string $token): array
{
    $url = "https://$host:2087/json-api/listaccts?api.version=1";
    $ch  = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ["Authorization: whm $user:$token"],
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_SSL_VERIFYPEER => 0,
        CURLOPT_TIMEOUT        => 20,
    ]);
    $res = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);

    if ($err) return ['error' => "cURL Error: $err"];

    $data = json_decode($res, true);
    if (!$data) return ['error' => 'Respuesta WHM inválida'];

    $accts = $data['data']['acct'] ?? null;
    if ($accts === null) {
        $msg = $data['metadata']['reason'] ?? 'Sin datos de cuentas';
        return ['error' => $msg];
    }

    return $accts;
}