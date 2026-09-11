<?php
session_start();
$isLoggedIn = isset($_SESSION['logged_in']) && $_SESSION['logged_in'] === true;
$sessionExpiredMsg = isset($_GET['expired']) ? 'Tu sesión expiró o no iniciaste sesión. Por favor, ingresa nuevamente.' : '';
?>
<!DOCTYPE html>
<html lang="es">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Panel de cuentas WHM</title>
    <meta name="description" content="Listado de cuentas WHM por servidor, con cambio de contraseña integrado.">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" integrity="sha512-Avb2QiuDEEvB4bZJYdft2mNjVShBftLdPG8FJ0V7irTLQ8Uo0qcPxh4Plq7G5tGm0rU+1SPhVotteLpBERwTkw==" crossorigin="anonymous" referrerpolicy="no-referrer">
    <link rel="stylesheet" href="styles/dark-mode.css">
    <link rel="stylesheet" href="styles/login.css">
    <?php if ($isLoggedIn): ?>
        <script src="js/session-guard.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11" crossorigin="anonymous"></script>
        <link rel="stylesheet" href="styles/index.css">
    <?php endif; ?>
</head>

<body>

    <?php if (!$isLoggedIn): ?>

        <div id="preloader">
            <div class="preloader-header">
                <span class="preloader-icon-wrap"><i class="fas fa-server"></i></span>
                <span class="preloader-title">Panel de cuentas WHM</span>
            </div>

            <div id="loginContainer">
                <form id="loginForm" class="login-form">
                    <div class="input-container">
                        <i class="fas fa-user"></i>
                        <input type="text" id="username" placeholder="Nombre de Usuario" required autocomplete="username">
                    </div>
                    <div class="input-container">
                        <i class="fas fa-lock"></i>
                        <input type="password" id="password" placeholder="Contraseña de Acceso" required autocomplete="current-password">
                    </div>
                    <button type="submit" class="primary-btn"><i class="fas fa-sign-in-alt"></i> Iniciar Sesión</button>
                    <p id="loginError" class="login-error"><?= htmlspecialchars($sessionExpiredMsg) ?></p>
                </form>
            </div>
        </div>

        <script src="js/login.js" defer></script>

    <?php else: ?>

        <!-- Header -->
        <header class="page-header">
            <div class="page-header-inner">
                <span class="header-icon"><i class="fas fa-sliders"></i></span>
                <div>
                    <h1>Panel de gestión cuentas WHM</h1>
                    <p class="page-subtitle">Cuentas WHM por servidor, con cambio de contraseña integrado.</p>
                </div>
            </div>
            <button id="logoutBtn" class="logout-btn" title="Cerrar sesión"><i class="fas fa-sign-out-alt"></i> Cerrar Sesión</button>
        </header>

        <!-- Estructura tipo consola: sidebar de navegación/filtros + columna principal -->
        <div class="app-shell">

            <!-- Sidebar: servidores + filtros + búsqueda -->
            <aside class="sidebar">
                <div class="sidebar-section">
                    <h3 class="sidebar-title"><i class="fas fa-server"></i> Servidores</h3>
                    <div class="filter-bar" id="filterBar">
                        <button class="filter-btn active" data-server="all" id="btn-all">
                            <i class="fas fa-layer-group"></i> Todos
                        </button>
                    </div>
                </div>

                <div class="sidebar-section">
                    <h3 class="sidebar-title"><i class="fas fa-filter"></i> Filtros</h3>

                    <div class="filters-search-wrap" id="filtersWrap">
                        <button class="filter-toggle-btn" id="filterToggle" aria-expanded="false">
                            <i class="fas fa-sliders-h"></i>
                            <span>Filtros</span>
                            <i class="fas fa-chevron-down filter-toggle-icon"></i>
                        </button>

                        <div class="filters-dropdowns" id="filtersDropdowns">
                            <div class="filter-group">
                                <h4 class="filter-group-title">Estado WHM</h4>
                                <div class="checkbox-filter-list" id="filterWhm">
                                    <label class="checkbox-filter-item">
                                        <input type="checkbox" value="suspended">
                                        <span class="checkbox-filter-box"><i class="fas fa-check"></i></span>
                                        <span>Suspendidas</span>
                                    </label>
                                    <label class="checkbox-filter-item">
                                        <input type="checkbox" value="active">
                                        <span class="checkbox-filter-box"><i class="fas fa-check"></i></span>
                                        <span>Activas</span>
                                    </label>
                                    <label class="checkbox-filter-item">
                                        <input type="checkbox" value="anchobanda">
                                        <span class="checkbox-filter-box"><i class="fas fa-check"></i></span>
                                        <span>AnchoBanda</span>
                                    </label>
                                </div>
                            </div>

                            <div class="filter-separator"></div>

                            <div class="filter-group">
                                <h4 class="filter-group-title">Plan</h4>
                                <div class="select-wrapper">
                                    <select id="filterPlan" class="filter-select">
                                        <option value="">Plan: Todos</option>
                                    </select>
                                    <i class="fas fa-chevron-down"></i>
                                </div>
                            </div>

                            <div class="filter-separator"></div>

                            <div class="filter-group">
                                <h4 class="filter-group-title">Uso de Disco</h4>
                                <div class="checkbox-filter-list" id="filterDisk">
                                    <label class="checkbox-filter-item">
                                        <input type="checkbox" value="30">
                                        <span class="checkbox-filter-box"><i class="fas fa-check"></i></span>
                                        <span>≥ 30% usado</span>
                                    </label>
                                    <label class="checkbox-filter-item">
                                        <input type="checkbox" value="50">
                                        <span class="checkbox-filter-box"><i class="fas fa-check"></i></span>
                                        <span>≥ 50% usado</span>
                                    </label>
                                    <label class="checkbox-filter-item">
                                        <input type="checkbox" value="80">
                                        <span class="checkbox-filter-box"><i class="fas fa-check"></i></span>
                                        <span>≥ 80% usado</span>
                                    </label>
                                    <label class="checkbox-filter-item">
                                        <input type="checkbox" value="100">
                                        <span class="checkbox-filter-box"><i class="fas fa-check"></i></span>
                                        <span>100% / Lleno</span>
                                    </label>
                                </div>
                            </div>

                            <div class="filter-separator"></div>

                            <label class="duplicate-toggle" for="filterDuplicates" title="Muestra solo los dominios que aparecen repetidos en más de un servidor">
                                <input type="checkbox" id="filterDuplicates">
                                <span class="duplicate-toggle-box"><i class="fas fa-check"></i></span>
                                <span>Mostrar Duplicados</span>
                            </label>
                        </div>
                    </div>
                </div>
            </aside>

            <!-- Columna principal -->
            <div class="main-col">

                <!-- Stats bar -->
                <div class="stats-bar" id="statsBar">
                    <div class="stat-pill" id="stat-total"><i class="fas fa-globe"></i><span>-</span>Cuentas</div>
                    <div class="stat-pill active-pill" id="stat-active"><i class="fas fa-check-circle"></i><span>-</span>Activas</div>
                    <div class="stat-pill suspended-pill" id="stat-suspended"><i class="fas fa-ban"></i><span>-</span>Suspendidas</div>
                    <div class="stat-pill anchobanda-pill" id="stat-anchobanda" style="display:none"><i class="fas fa-wifi"></i><span>-</span>AnchoBanda</div>
                </div>

                <!-- Barra de búsqueda global (ancho completo, sobre el listado de servidores) -->
                <div class="global-search-bar">
                    <div class="search-wrap">
                        <i class="fas fa-search search-icon"></i>
                        <input type="text" id="searchInput" placeholder="Buscar dominio o estado…" autocomplete="off">
                        <button id="clearSearch" class="clear-btn" title="Limpiar búsqueda"><i class="fas fa-times"></i></button>
                    </div>
                </div>

                <!-- Main content -->
                <main class="main-content">
                    <!-- Loading state -->
                    <div id="loading" class="loading-wrap">
                        <div class="spinner"></div>
                        <p>Consultando servidores WHM…<br><small>Esto puede tomar unos segundos</small></p>
                    </div>

                    <!-- Error state -->
                    <div id="errorBox" class="error-box" style="display:none">
                        <i class="fas fa-triangle-exclamation"></i>
                        <p id="errorMsg">Error desconocido</p>
                    </div>

                    <!-- Results per server -->
                    <div id="results"></div>
                </main>
            </div>
        </div>

        <!-- Modal flotante de Cambio de Contraseña -->
        <div id="passwordModal" class="modal-overlay" style="display:none;">
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="fas fa-key"></i> Cambiar Contraseña cPanel</h2>
                    <button class="modal-close" onclick="closePasswordModal()"><i class="fas fa-times"></i></button>
                </div>
                <form onsubmit="execChangePassword(event)">
                    <!-- Campos ocultos para pasar información al backend -->
                    <input type="hidden" id="pwdServer">
                    <input type="hidden" id="pwdUser">

                    <div class="form-group">
                        <label>Dominio:</label>
                        <input type="text" id="pwdDomain" readonly class="input-readonly">
                    </div>

                    <div class="form-group">
                        <label for="newPassword">Nueva Contraseña:</label>
                        <div class="input-group">
                            <input type="password" id="newPassword" required oninput="handlePasswordInput()">
                            <button type="button" onclick="togglePasswordVisibility('newPassword')" class="btn-small-icon" title="Ver contraseña"><i class="fas fa-eye"></i></button>
                            <button type="button" onclick="generateRandomPassword()" class="btn-small-icon" title="Generar contraseña"><i class="fas fa-dice"></i></button>
                            <button type="button" onclick="copyPasswordToClipboard()" class="btn-small-icon" title="Copiar"><i class="fas fa-copy"></i></button>
                        </div>
                        <p id="copyStatusText" class="match-text"></p>
                    </div>

                    <!-- Contenedor con los requisitos visuales de la contraseña -->
                    <div id="passwordHelpContainer" class="password-help-container">
                        <p id="passwordHelp">La contraseña debe cumplir con:</p>
                        <ul>
                            <li id="lengthReq"><strong>Longitud:</strong> 12 - 16 caracteres</li>
                            <li id="uppercaseReq"><strong>Mayúsculas:</strong> al menos una letra (A-Z)</li>
                            <li id="numberReq"><strong>Números:</strong> al menos un número (0-9)</li>
                            <li id="symbolReq"><strong>Símbolos:</strong> al menos un símbolo como <code>? . # $ ! % & *</code></li>
                        </ul>
                    </div>

                    <!-- Barra de fortaleza gráfica -->
                    <div id="strengthBar" class="strength-bar-wrap">
                        <div id="strengthFill" class="strength-bar-fill"></div>
                    </div>
                    <p id="strengthText" class="strength-text"></p>

                    <!-- Pie del modal -->
                    <div class="modal-footer">
                        <button type="button" class="btn-cancel" onclick="closePasswordModal()">Cancelar</button>
                        <button type="submit" id="pwdSubmitBtn" class="btn-submit" disabled>Cambiar Contraseña</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Modal flotante de Validación DNS -->
        <div id="dnsModal" class="modal-overlay" style="display:none;">
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="fas fa-network-wired"></i> Validación DNS <small id="dnsModalDomain" class="modal-header-sub"></small> <span id="dnsServerBadge" class="server-tag-badge" style="display:none;"></span></h2>
                    <button class="modal-close" onclick="closeDnsModal()"><i class="fas fa-times"></i></button>
                </div>

                <!-- Estado: cargando -->
                <div id="dnsModalLoading" class="espo-modal-state" style="display:none;">
                    <div class="spinner"></div>
                    <p>Consultando registros DNS…</p>
                </div>

                <!-- Estado: error -->
                <div id="dnsModalError" class="espo-modal-state" style="display:none;">
                    <i class="fas fa-triangle-exclamation"></i>
                    <p id="dnsModalErrorMsg">No se pudo validar el DNS.</p>
                </div>

                <!-- Contenido -->
                <div id="dnsModalBody" style="display:none;">
                    <div class="dns-info-grid">
                        <div class="dns-info-item">
                            <label id="dnsServerLabel">Servidor</label>
                            <ul id="dnsExpectedList"></ul>
                        </div>
                        <div class="dns-info-item">
                            <label id="dnsFoundLabel">DNS registrados</label>
                            <ul id="dnsFoundList"></ul>
                        </div>
                    </div>

                    <div class="dns-result" id="dnsResultBanner">
                        <i class="fas" id="dnsResultIcon"></i>
                        <p id="dnsResultText"></p>
                    </div>
                </div>

                <div class="modal-footer">
                    <button type="button" class="btn-cancel" onclick="closeDnsModal()">Cerrar</button>
                </div>
            </div>
        </div>

        <footer class="footer">
            <p>© Desarrollado por Mario Riffo C. – Panel de gestor de cuentas</p>
        </footer>

        <script src="js/main.js"></script>
        <script src="js/dark-mode.js" defer></script>

    <?php endif; ?>

</body>

</html>
