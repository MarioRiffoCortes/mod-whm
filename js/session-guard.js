/**
 * session-guard.js
 * ─────────────────────────────────────────────────────────────────
 * Vigilante de sesión compartido por todos los proyectos de Soporte.
 *
 * Problema que resuelve: cuando la sesión de PHP expira (o nunca se
 * inició), los endpoints protegidos por config/auth.php respondían a
 * veces con una página HTML de error 403 en vez de JSON. El código
 * de cada panel hacía `res.json()` sobre esa respuesta y explotaba
 * con "Unexpected token '<' ... is not valid JSON", mostrando un
 * mensaje de error sin nunca mandar al usuario a iniciar sesión de
 * nuevo.
 *
 * Este script se incluye una sola vez (antes que el resto de los
 * scripts del panel) y:
 *   1) Envuelve window.fetch para inspeccionar TODAS las respuestas.
 *   2) Si detecta un 401/403 (sesión expirada o no iniciada) —venga
 *      como JSON {success:false,...} o como HTML plano—, corta el
 *      flujo normal y redirige de inmediato al login del portal.
 *   3) Calcula la URL raíz del portal a partir de su propio <script
 *      src>, así que funciona sin importar la profundidad de
 *      carpetas desde la que se incluya.
 *
 * Debe incluirse en el <head> de cada index.php, ANTES que los demás
 * <script> del panel (main.js, whm-admin.js, etc.), para que ningún
 * fetch quede sin vigilar.
 */
(function () {
    'use strict';

    if (window.__sessionGuardInstalled) return;
    window.__sessionGuardInstalled = true;

    // ── 1) Resolver la URL raíz del portal a partir de este <script> ──
    function resolveRootUrl() {
        var thisScript = document.currentScript;
        if (!thisScript) {
            var scripts = document.getElementsByTagName('script');
            for (var i = 0; i < scripts.length; i++) {
                if (/session-guard\.js(\?.*)?$/.test(scripts[i].src)) {
                    thisScript = scripts[i];
                    break;
                }
            }
        }
        var src = thisScript ? thisScript.src : '';
        var idx = src.indexOf('js/session-guard.js');
        return idx !== -1 ? src.substring(0, idx) : '/';
    }

    var ROOT_URL = resolveRootUrl();
    var LOGIN_URL = ROOT_URL + 'index.php?expired=1';
    var redirecting = false;

    function forceLogin() {
        if (redirecting) return;
        redirecting = true;
        try { sessionStorage.setItem('sessionExpired', '1'); } catch (e) { /* ignorar */ }
        window.location.replace(LOGIN_URL);
    }

    // ── 2) Envolver fetch para vigilar cada respuesta ──
    var originalFetch = window.fetch ? window.fetch.bind(window) : null;
    if (!originalFetch) return;

    window.fetch = function (input, init) {
        return originalFetch(input, init).then(function (response) {
            if (response.status === 401 || response.status === 403) {
                var contentType = response.headers.get('content-type') || '';

                if (contentType.indexOf('application/json') !== -1) {
                    // Confirmar que realmente es un rechazo de sesión antes
                    // de redirigir (no todos los 401/403 JSON son de sesión,
                    // pero en este portal sí lo son siempre).
                    response.clone().json().then(function () {
                        forceLogin();
                    }).catch(function () {
                        // JSON inválido en un 401/403: también es señal de
                        // sesión perdida (p.ej. HTML de error del servidor).
                        forceLogin();
                    });
                } else {
                    // HTML u otro formato inesperado en un 401/403: la sesión
                    // se perdió y el endpoint no devolvió JSON.
                    forceLogin();
                }
            }
            return response;
        });
    };

    // ── 3) Si alguien navega directo a una página protegida sin sesión,
    //       .htaccess/PHP igual muestran el login; esto solo cubre AJAX.
})();
