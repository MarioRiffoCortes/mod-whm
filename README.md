# mod-whm

Panel de gestión de cuentas WHM (listado por servidor, cambio de contraseña de cPanel, suspender/activar/eliminar cuentas, filtros, caché en JSON y validación de DNS). Proyecto independiente, con su propio login.
## Configuración

1. Copia `ADM/config.example.php` como `ADM/config.php` y completa `$WH_SERVERS` (host, usuario y token de API de cada servidor WHM) y, si vas a usar el botón "Validar DNS", `$OFFICIAL_DNS`.
2. Copia `ADM/config-ad.example.php` como `ADM/config-ad.php` y define los usuarios que pueden entrar al panel (`usuario => contraseña`, en texto plano).

## Seguridad

- La carpeta `ADM/` tiene un `.htaccess` que la bloquea por completo a nivel de servidor web (`Require all denied` / `Deny from all`), igual que `scripts/cache/`. Solo el propio PHP puede leer esos archivos vía `require`; no son accesibles por URL bajo ninguna circunstancia.
- Todo el panel (`index.php` y los endpoints en `scripts/`) exige sesión iniciada, verificada por `ADM/auth.php`. Un endpoint llamado sin sesión responde 401 en JSON (para llamadas AJAX) o redirige a `index.php?expired=1` (navegación directa).
- El login vive en la raíz: `index.php` muestra el formulario cuando no hay sesión, `login.php` valida usuario/clave contra `ADM/config-ad.php` y abre la sesión, `logout.php` la cierra.

## Estructura

```
mod-whm/
├── index.php              → login (si no hay sesión) o panel (si la hay)
├── login.php               → valida credenciales y abre sesión
├── logout.php              → cierra sesión
├── js/
│   ├── main.js              → lógica del panel
│   ├── login.js              → envía el formulario de login
│   ├── session-guard.js      → redirige al login si una petición AJAX devuelve 401/403
│   └── dark-mode.js          → toggle de modo oscuro
├── styles/
│   ├── index.css             → estilos del panel
│   ├── login.css             → estilos de la pantalla de login
│   └── dark-mode.css         → variables de modo oscuro
├── scripts/
│   ├── getServers.php        → lista de servidores configurados
│   ├── listAccounts.php      → cuentas WHM por servidor (caché diaria en scripts/cache/)
│   ├── accountAction.php     → suspender / activar / eliminar cuenta
│   ├── changePassword.php    → cambio de contraseña de cPanel
│   ├── checkDns.php          → validación de NS vs. Nic.cl/DNS
│   └── cache/                → JSON cacheados por servidor (bloqueado por .htaccess)
└── ADM/                      → bloqueado por .htaccess, solo accesible vía PHP
    ├── auth.php               → middleware de sesión
    ├── config.php              → $WH_SERVERS, $OFFICIAL_DNS (credenciales reales)
    ├── config-ad.php           → $USERS (credenciales reales)
    ├── config.example.php      → plantilla de config.php
    └── config-ad.example.php   → plantilla de config-ad.php
```
