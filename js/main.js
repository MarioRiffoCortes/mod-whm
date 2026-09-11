/* ============================================================
   MOD MENU – js/main.js
   ============================================================ */

let allData = [];   // full API response
let activeServers = new Set(); // servidores seleccionados; vacío = "Todos"
let searchTerm = '';
let filterWhmVal = new Set();   // checkboxes: 'suspended' | 'active' | 'anchobanda'
let filterDiskVal = new Set();  // checkboxes: '30' | '50' | '80' | '100'
let filterPlanVal = '';         // sigue siendo lista (select) de selección única
let filterDuplicatesVal = false;
const collapsedSections = new Set();

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadData();

    // Cerrar sesión
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                const resp = await fetch('logout.php');
                const data = await resp.json();
                if (data.success) {
                    window.location.reload();
                }
            } catch (err) {
                console.error('Error al cerrar sesión', err);
            }
        });
    }

    // "Todos" button
    document.getElementById('btn-all').addEventListener('click', () => setServer('all'));

    // Search
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearch');

    searchInput.addEventListener('input', () => {
        searchTerm = searchInput.value.trim().toLowerCase();
        clearBtn.classList.toggle('visible', searchTerm.length > 0);
        renderResults();
    });

    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchTerm = '';
        clearBtn.classList.remove('visible');
        renderResults();
    });

    // Filters (checkboxes: WHM, Disco → selección múltiple)
    bindCheckboxFilterGroup('filterWhm', (vals) => { filterWhmVal = vals; });
    bindCheckboxFilterGroup('filterDisk', (vals) => { filterDiskVal = vals; });

    document.getElementById('filterPlan').addEventListener('change', (e) => {
        filterPlanVal = e.target.value;
        renderResults();
    });

    document.getElementById('filterDuplicates').addEventListener('change', (e) => {
        filterDuplicatesVal = e.target.checked;
        renderResults();
    });

    // Mobile filter toggle
    const filterToggle = document.getElementById('filterToggle');
    const filtersWrap = document.getElementById('filtersWrap');
    if (filterToggle && filtersWrap) {
        filterToggle.addEventListener('click', () => {
            const isOpen = filtersWrap.classList.toggle('filters-open');
            filterToggle.setAttribute('aria-expanded', isOpen);
        });
    }

    // Handle pasting on password field
    const passwordField = document.getElementById("newPassword");
    if (passwordField) {
        passwordField.addEventListener("paste", () => {
            setTimeout(() => {
                handlePasswordInput();
            }, 10);
        });
    }
});

// ── Filtros tipo checkbox (selección múltiple) ─────────────────
// Escucha los checkboxes dentro de #containerId y, en cada cambio,
// entrega a onChange() un Set con los "value" actualmente marcados.
function bindCheckboxFilterGroup(containerId, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const readChecked = () => {
        const vals = new Set();
        container.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => vals.add(cb.value));
        return vals;
    };

    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            onChange(readChecked());
            renderResults();
        });
    });
}

// ── Fetch data ────────────────────────────────────────────────
async function loadData() {
    try {
        const res = await fetch('scripts/getServers.php');
        const data = await res.json();

        document.getElementById('loading').style.display = 'none';

        if (!data.success) {
            showError('El servidor respondió con error al cargar la configuración.');
            return;
        }

        // Initialize allData with skeletons
        allData = data.servers.map(s => ({
            server: s.server,
            host: s.host,
            accounts: [],
            isLoading: true
        }));

        buildFilterTabs();
        renderResults(); // This will render the skeletons

        // Load each server asynchronously
        for (const srv of allData) {
            reloadServer(srv.server, true); // true indicates initial load
        }
    } catch (err) {
        document.getElementById('loading').style.display = 'none';
        showError('Error de conexión: ' + err.message);
    }
}


async function reloadServer(serverName, isInitialLoad = false, force = false) {
    // El estado de "cargando" vive en el modelo (allData), no en el DOM.
    // Así, cada sección se pinta según su propio srv.isLoading en cada
    // renderResults(), sin importar qué otro reload en curso haya disparado
    // ese render (evita que un reload termine y "resetee" visualmente a
    // los demás servidores que siguen cargando en paralelo).
    const startIdx = allData.findIndex(s => s.server === serverName);
    if (startIdx !== -1) {
        allData[startIdx] = { ...allData[startIdx], isLoading: true };
        renderResults();
    }

    try {
        let url = 'scripts/listAccounts.php?server=' + encodeURIComponent(serverName);
        if (force) url += '&force=1';
        const res = await fetch(url);
        const data = await res.json();

        if (data.success && data.servers && data.servers.length > 0) {
            const updatedServer = data.servers[0];
            const idx = allData.findIndex(s => s.server === serverName);
            if (idx !== -1) {
                allData[idx] = updatedServer; // ya viene sin isLoading, o en false
            }
        } else {
            const idx = allData.findIndex(s => s.server === serverName);
            if (idx !== -1) allData[idx].isLoading = false;
        }
    } catch (err) {
        console.error("Error al recargar el servidor " + serverName, err);
        Swal.fire('Advertencia', 'No se pudieron actualizar los datos en tiempo real para el servidor ' + serverName, 'warning');
        const idx = allData.findIndex(s => s.server === serverName);
        if (idx !== -1) allData[idx].isLoading = false;
    } finally {
        buildFilterTabs(); // Reconstruir tabs siempre para actualizar contadores
        renderResults();
    }
}

// ── Build server tabs ─────────────────────────────────────────
function buildFilterTabs() {
    const bar = document.getElementById('filterBar');
    // Clear dynamic tabs (except "Todos" which is the first child)
    while (bar.children.length > 1) {
        bar.removeChild(bar.lastChild);
    }

    buildPlanFilter();

    allData.forEach(srv => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.dataset.server = srv.server;
        btn.id = 'btn-' + srv.server;

        const count = srv.accounts?.length ?? 0;
        const activeCount = (srv.accounts || []).filter(a => !a.suspended).length;
        btn.innerHTML = `<i class="fas fa-server"></i> ${srv.server} <span style="opacity:.7;font-size:.8em">(${activeCount}/${count})</span>`;
        btn.addEventListener('click', () => setServer(srv.server));
        bar.appendChild(btn);
    });

    updateServerButtonsUI();
}

function buildPlanFilter() {
    const select = document.getElementById('filterPlan');
    if (!select) return;

    const plans = new Set();
    allData.forEach(srv => {
        if (srv.accounts) {
            srv.accounts.forEach(acc => {
                if (acc.plan) {
                    plans.add(acc.plan);
                }
            });
        }
    });

    const sortedPlans = Array.from(plans).sort();

    select.innerHTML = '<option value="">Plan: Todos</option>';
    sortedPlans.forEach(plan => {
        const option = document.createElement('option');
        option.value = plan;
        option.textContent = plan;
        if (plan === filterPlanVal) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

// ── Selección de servidores (multi-selección con toggle) ────────
// activeServers vacío = "Todos" los servidores.
// Click en "Todos" limpia la selección. Click en un servidor lo
// agrega/quita de la selección; si terminan quedando TODOS
// seleccionados, se vuelve automáticamente al estado "Todos".
function setServer(server) {
    if (server === 'all') {
        activeServers.clear();
    } else {
        if (activeServers.has(server)) {
            activeServers.delete(server);
        } else {
            activeServers.add(server);
        }

        // Si quedaron seleccionados todos los servidores disponibles,
        // volvemos al estado "Todos" (equivalente y más claro).
        const allServerNames = allData.map(s => s.server);
        const allSelected = allServerNames.length > 0 &&
            allServerNames.every(name => activeServers.has(name));
        if (allSelected) {
            activeServers.clear();
        }
    }

    updateServerButtonsUI();
    renderResults();
}

function updateServerButtonsUI() {
    const showingAll = activeServers.size === 0;
    document.querySelectorAll('.filter-btn').forEach(b => {
        const isServerBtn = b.dataset.server !== 'all';
        const isActive = isServerBtn
            ? activeServers.has(b.dataset.server)
            : showingAll;
        b.classList.toggle('active', isActive);
    });
}

// ── Render ────────────────────────────────────────────────────
function renderResults() {
    const container = document.getElementById('results');
    container.innerHTML = '';

    let totTotal = 0, totActive = 0, totSusp = 0, totBW = 0;

    // Con "Mostrar Duplicados" activo, se listan todos los servidores
    // (ignorando la selección de tabs) para poder comparar entre ellos.
    const serversToShow = (filterDuplicatesVal || activeServers.size === 0)
        ? allData
        : allData.filter(s => activeServers.has(s.server));

    // Mapa dominio -> Set de servidores donde aparece (para detectar duplicados)
    const duplicateDomains = filterDuplicatesVal ? getDuplicateDomains() : null;

    // Si hay algún filtro/búsqueda activo, los servidores sin resultados
    // se ocultan por completo (en vez de mostrar la barra vacía con "Sin resultados").
    const hasActiveFilters = !!(searchTerm || filterWhmVal.size || filterDiskVal.size || filterPlanVal || filterDuplicatesVal);

    serversToShow.forEach(srv => {
        // Filter accounts by search and dropdowns
        const accounts = (srv.accounts || []).filter(acc => {
            // Duplicates Filter
            if (filterDuplicatesVal) {
                const domainKey = (acc.domain || '').toLowerCase();
                if (!duplicateDomains.has(domainKey)) return false;
            }

            // WHM Filter (checkboxes: coincide si el estado de la cuenta
            // está entre los marcados; sin marcas = sin filtro)
            if (filterWhmVal.size > 0) {
                const whmCat = !acc.suspended
                    ? 'active'
                    : (isBandwidthSuspension(acc.suspendReason) ? 'anchobanda' : 'suspended');
                if (!filterWhmVal.has(whmCat)) return false;
            }

            // Disk Filter (checkboxes: coincide si el % usado alcanza
            // cualquiera de los umbrales marcados)
            if (filterDiskVal.size > 0) {
                const diskLimit = acc.diskLimit && acc.diskLimit !== 'unlimited' && acc.diskLimit !== '0'
                    ? parseInt(acc.diskLimit) : 0;
                const diskUsed = parseInt(acc.diskUsed) || 0;

                if (diskLimit > 0) {
                    const pct = Math.min(100, Math.round(diskUsed / diskLimit * 100));
                    const matchesDisk = Array.from(filterDiskVal).some(t => pct >= parseInt(t, 10));
                    if (!matchesDisk) return false;
                } else {
                    return false; // Si no hay límite conocido y hay un filtro activo, la ocultamos por defecto
                }
            }

            // Plan Filter
            if (filterPlanVal && acc.plan !== filterPlanVal) {
                return false;
            }

            // Search Filter
            if (!searchTerm) return true;
            const domain = acc.domain.toLowerCase();
            return domain.includes(searchTerm);
        });

        // Stats accumulation (según lo que realmente se está mostrando, con filtros aplicados)
        totTotal += accounts.length;
        totActive += accounts.filter(a => !a.suspended).length;
        const suspAll = accounts.filter(a => a.suspended);
        const bwAccs  = suspAll.filter(a => isBandwidthSuspension(a.suspendReason));
        totSusp += suspAll.length - bwAccs.length; // Suspendidas normales (sin AnchoBanda)
        totBW   += bwAccs.length;

        // Ocultar la barra del servidor si el filtro/búsqueda no arrojó
        // resultados en él (pero mantenerla visible mientras carga o si hubo error).
        if (hasActiveFilters && accounts.length === 0 && !srv.isLoading && !srv.error) {
            return;
        }

        const section = buildServerSection(srv, accounts);
        container.appendChild(section);
    });

    // Si el filtro ocultó todas las barras de servidor, mostrar un aviso general.
    if (hasActiveFilters && container.children.length === 0) {
        container.innerHTML = `<div class="no-results-global"><i class="fas fa-circle-info"></i> Sin resultados para los filtros aplicados</div>`;
    }

    // Update stats
    setStatCount('stat-total', totTotal);
    setStatCount('stat-active', totActive);
    setStatCount('stat-suspended', totSusp);
    setStatCount('stat-anchobanda', totBW);

    // Mostrar/ocultar pill AnchoBanda si hay al menos 1
    const bwPill = document.getElementById('stat-anchobanda');
    if (bwPill) bwPill.style.display = totBW > 0 ? '' : 'none';
}

function setStatCount(id, val) {
    const el = document.getElementById(id);
    if (el) el.querySelector('span').textContent = val;
}

// ── Build one server section ──────────────────────────────────
function buildServerSection(srv, accounts) {
    const section = document.createElement('div');
    section.className = 'server-section';
    section.id = 'section-' + srv.server;

    const fullTotal = srv.accounts?.length ?? 0;
    const shownTotal = accounts.length;
    const active = accounts.filter(a => !a.suspended).length;
    const suspAll = accounts.filter(a => a.suspended);
    const bw = suspAll.filter(a => isBandwidthSuspension(a.suspendReason)).length;
    const susp = suspAll.length - bw; // Suspendidas normales (sin AnchoBanda)

    // Si hay algún filtro/búsqueda activo y reduce el listado, mostramos
    // "visibles/total" en el contador para dejar claro que está filtrado.
    const hasActiveFilters = !!(searchTerm || filterWhmVal.size || filterDiskVal.size || filterPlanVal || filterDuplicatesVal);
    const totalLabel = (hasActiveFilters && shownTotal !== fullTotal)
        ? `${shownTotal}/${fullTotal}`
        : `${fullTotal}`;

    // Header
    const header = document.createElement('div');
    header.className = 'server-section-header';
    header.innerHTML = `
        <div class="server-tag">
            <i class="fas fa-server"></i>
            <span>${escHtml(srv.server)}</span>
            <small class="server-host">${escHtml(srv.host)}</small>
        </div>
        <div class="server-meta">
            <span class="badge badge-total"><i class="fas fa-list"></i> ${totalLabel}</span>
            <span class="badge badge-active"><i class="fas fa-check"></i> ${active}</span>
            ${susp > 0 ? `<span class="badge badge-susp"><i class="fas fa-ban"></i> ${susp}</span>` : ''}
            ${bw > 0 ? `<span class="badge badge-anchobanda" title="AnchoBanda"><i class="fas fa-wifi"></i> ${bw}</span>` : ''}
            <button class="btn-reload" onclick="event.stopPropagation(); reloadServer('${srv.server}', false, true)" title="Recargar este servidor" ${srv.isLoading ? 'disabled' : ''}>
                <i class="fas fa-sync-alt${srv.isLoading ? ' fa-spin' : ''}"></i>
            </button>
            <i class="fas fa-chevron-down collapse-icon"></i>
        </div>
    `;

    if (srv.isLoading) {
        section.style.opacity = '0.6';
        section.style.pointerEvents = 'none';
    }

    // Body
    const body = document.createElement('div');
    body.className = 'server-section-body';

    if (srv.isLoading) {
        body.innerHTML = `
            <div class="skeleton-loading">
                <div class="skeleton-row"></div>
                <div class="skeleton-row"></div>
                <div class="skeleton-row"></div>
                <div class="skeleton-row"></div>
            </div>`;
    } else if (srv.error) {
        body.innerHTML = `<div class="server-error"><i class="fas fa-triangle-exclamation"></i> ${escHtml(srv.error)}</div>`;
    } else {
        body.appendChild(buildTable(accounts, srv.server));
    }

    // Restore collapsed state (persists across re-renders)
    if (collapsedSections.has(srv.server)) {
        section.classList.add('collapsed');
        body.style.maxHeight = '0px';
    }

    header.addEventListener('click', () => {
        if (section.classList.contains('collapsed')) {
            section.classList.remove('collapsed');
            collapsedSections.delete(srv.server);
            body.style.maxHeight = body.scrollHeight + 'px';
            body.addEventListener('transitionend', () => {
                if (!section.classList.contains('collapsed')) body.style.maxHeight = '';
            }, { once: true });
        } else {
            body.style.maxHeight = body.scrollHeight + 'px';
            void body.offsetHeight; // force reflow
            body.style.maxHeight = '0px';
            section.classList.add('collapsed');
            collapsedSections.add(srv.server);
        }
    });

    section.appendChild(header);
    section.appendChild(body);
    return section;
}

// ── Build table ───────────────────────────────────────────────
function buildTable(accounts, serverName) {
    const wrap = document.createElement('div');
    wrap.className = 'accounts-table-wrap';

    const table = document.createElement('table');
    table.className = 'accounts-table';

    table.innerHTML = `
        <thead>
            <tr>
                <th>N°</th>
                <th>Dominio</th>
                <th class="center">WHM</th>
                <th>Plan WHM</th>
                <th>Disco</th>
                <th class="center">Acciones</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');

    if (accounts.length === 0) {
        tbody.innerHTML = `<tr class="no-results-row"><td colspan="6">Sin resultados</td></tr>`;
        wrap.appendChild(table);
        return wrap;
    }

    accounts.forEach((acc, idx) => {
        const tr = document.createElement('tr');
        if (acc.suspended) tr.classList.add('suspended-row');
        if (acc.removed) tr.classList.add('removed-row');

        // WHM Badge
        let whmBadge = `<span class="status-badge badge-whm-active"><i class="fas fa-check-circle"></i> Activa</span>`;
        if (acc.removed) {
            whmBadge = `<span class="status-badge badge-whm-removed"><i class="fas fa-trash-alt"></i> Eliminada</span>`;
        } else if (acc.suspended) {
            const isBW = isBandwidthSuspension(acc.suspendReason);
            if (isBW) {
                // Badge especial AnchoBanda
                whmBadge = `<span class="status-badge badge-whm-anchobanda"><i class="fas fa-ban"></i> AnchoBanda</span>`;
                let suspendDate = '';
                if (acc.suspendTime) {
                    if (!isNaN(acc.suspendTime)) {
                        const date = new Date(parseInt(acc.suspendTime) * 1000);
                        suspendDate = date.toLocaleDateString('es-ES');
                    } else {
                        suspendDate = escHtml(acc.suspendTime);
                    }
                }
                const dateText = suspendDate ? ` desde: ${suspendDate}` : '';
                whmBadge += `<br><small style="font-size: 0.75rem; opacity: 0.9; display: block; margin-top: 5px; line-height: 1.2;">Límite de Ancho de Banda${dateText}</small>`;
            } else {
                whmBadge = `<span class="status-badge badge-whm-suspended"><i class="fas fa-ban"></i> Suspendida</span>`;
                if (acc.suspendTime || acc.suspendReason) {
                    let suspendDate = '';
                    if (acc.suspendTime) {
                        if (!isNaN(acc.suspendTime)) {
                            const date = new Date(parseInt(acc.suspendTime) * 1000);
                            suspendDate = date.toLocaleDateString('es-ES');
                        } else {
                            suspendDate = escHtml(acc.suspendTime);
                        }
                    }
                    const reasonText = acc.suspendReason ? escHtml(acc.suspendReason) : 'Sin razón';
                    const dateText = suspendDate ? ` desde: ${suspendDate}` : '';
                    whmBadge += `<br><small style="font-size: 0.75rem; opacity: 0.9; display: block; margin-top: 5px; line-height: 1.2;">Suspendida${dateText}<br><span style="color:#ef4444; font-style: italic;">${reasonText}</span></small>`;
                }
            }
        }

        // Disk bar
        let diskHtml = escHtml(acc.diskUsed || '0') + ' MB';
        const diskLimit = acc.diskLimit && acc.diskLimit !== 'unlimited' && acc.diskLimit !== '0'
            ? parseInt(acc.diskLimit) : 0;
        const diskUsed = parseInt(acc.diskUsed) || 0;
        if (diskLimit > 0) {
            const pct = Math.min(100, Math.round(diskUsed / diskLimit * 100));
            const cls = pct > 80 ? 'crit' : pct > 65 ? 'warn' : '';
            diskHtml = `
                <div class="disk-cell">
                    ${diskUsed}M / ${diskLimit}M
                    <div class="disk-bar-wrap">
                        <div class="disk-bar-fill ${cls}" style="width:${pct}%"></div>
                    </div>
                </div>`;
        }

        // Acciones
        let actionsHtml = `<div class="actions-cell">`;
        if (acc.removed) {
            actionsHtml += `<span style="font-size:0.75rem;opacity:0.6;"><i class="fas fa-ban"></i> Cuenta eliminada</span>`;
        } else if (acc.user) {
            if (acc.suspended) {
                actionsHtml += `<button class="btn-action btn-activate" onclick="handleAccountAction('unsuspend', '${serverName}', '${acc.user}', '${acc.domain}')" title="Activar cuenta"><i class="fas fa-play"></i><span class="btn-label">Activar</span></button>`;
            } else {
                actionsHtml += `<button class="btn-action btn-suspend" onclick="handleAccountAction('suspend', '${serverName}', '${acc.user}', '${acc.domain}')" title="Suspender cuenta"><i class="fas fa-pause"></i><span class="btn-label">Suspender</span></button>`;
            }
            actionsHtml += `<button class="btn-action btn-delete" onclick="handleAccountAction('remove', '${serverName}', '${acc.user}', '${acc.domain}')" title="Eliminar cuenta"><i class="fas fa-trash-alt"></i><span class="btn-label">Eliminar</span></button>`;

            // Botón integrado para Cambiar Contraseña
            actionsHtml += `<button class="btn-action btn-key" onclick="openChangePasswordModal('${serverName}', '${acc.user}', '${acc.domain}')" title="Cambiar contraseña"><i class="fas fa-key"></i><span class="btn-label">Cambiar clave</span></button>`;

            // Botón "Validar DNS" (compara los NS reales del dominio contra los oficiales del servidor)
            actionsHtml += `<button class="btn-action btn-dns" onclick="handleValidateDns('${serverName}', '${acc.domain}')" title="Validar DNS en Nic.cl"><i class="fas fa-network-wired"></i><span class="btn-label">Validar DNS</span></button>`;
        } else {
            actionsHtml += `<span style="font-size:0.75rem;opacity:0.5;">Sin user</span>`;
        }
        actionsHtml += `</div>`;

        tr.innerHTML = `
            <td data-label="N°" style="opacity:.4;font-size:.8rem">${idx + 1}</td>
            <td data-label="Dominio">
                <div class="domain-cell">
                    <span class="domain-link">${escHtml(acc.domain)}</span>
                    <button type="button" class="ext-link copy-domain-btn" onclick="copyDomainToClipboard('${acc.domain}')" title="Copiar dominio">
                        <i class="fas fa-copy"></i>
                    </button>
                    <a href="https://${escHtml(acc.domain)}" target="_blank" rel="noopener" class="ext-link" title="Abrir sitio">
                        <i class="fas fa-external-link-alt"></i>
                    </a>
                </div>
            </td>
            <td data-label="WHM" class="center">${whmBadge}</td>
            <td data-label="Plan" style="font-size:.82rem;opacity:.8">${escHtml(acc.plan || '—')}</td>
            <td data-label="Disco">${diskHtml}</td>
            <td data-label="Acciones" class="center">${actionsHtml}</td>
        `;
        tbody.appendChild(tr);
    });

    wrap.appendChild(table);
    return wrap;
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Devuelve un Set con los dominios (en minúscula) que aparecen en
 * más de un servidor distinto, para el filtro "Mostrar Duplicados".
 */
function getDuplicateDomains() {
    const domainServers = new Map(); // domain -> Set de servidores

    allData.forEach(srv => {
        (srv.accounts || []).forEach(acc => {
            if (!acc.domain) return;
            const key = acc.domain.toLowerCase();
            if (!domainServers.has(key)) domainServers.set(key, new Set());
            domainServers.get(key).add(srv.server);
        });
    });

    const duplicates = new Set();
    domainServers.forEach((servers, domain) => {
        if (servers.size > 1) duplicates.add(domain);
    });
    return duplicates;
}

/**
 * Detecta si el motivo de suspensión es por límite de ancho de banda.
 */
function isBandwidthSuspension(reason) {
    if (!reason) return false;
    return reason.toLowerCase().includes('bandwidth');
}

function showError(msg) {
    document.getElementById('errorBox').style.display = 'block';
    document.getElementById('errorMsg').textContent = msg;
}

function escHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Account Actions ───────────────────────────────────────────
async function handleAccountAction(action, server, user, domain) {
    let confirmMsg = '';
    let confirmBtnText = '';
    let confirmColor = '';
    let inputOptions = null;

    if (action === 'suspend') {
        confirmMsg = `¿Deseas suspender la cuenta <b>${domain}</b>?`;
        confirmBtnText = 'Sí, suspender';
        confirmColor = '#f59e0b';
        inputOptions = {
            input: 'text',
            inputPlaceholder: 'Razón de la suspensión (opcional)'
        };
    } else if (action === 'unsuspend') {
        confirmMsg = `¿Deseas reactivar la cuenta <b>${domain}</b>?`;
        confirmBtnText = 'Sí, activar';
        confirmColor = '#22c55e';
    } else if (action === 'remove') {
        confirmMsg = `Estás a punto de <b>ELIMINAR DEFINITIVAMENTE</b> la cuenta <b>${domain}</b>.<br><br>Esta acción no se puede deshacer y borrará todos los archivos, correos y bases de datos.<br><br>Para continuar, escribe <b>ELIMINAR</b> en la caja de abajo.`;
        confirmBtnText = 'Eliminar Cuenta';
        confirmColor = '#ef4444';
        inputOptions = {
            input: 'text',
            inputValidator: (value) => {
                if (value !== 'ELIMINAR') {
                    return 'Debes escribir ELIMINAR para confirmar';
                }
            }
        };
    }

    const swalConfig = {
        title: 'Confirmar Acción',
        html: confirmMsg,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: confirmColor,
        cancelButtonColor: '#64748b',
        confirmButtonText: confirmBtnText,
        cancelButtonText: 'Cancelar'
    };

    if (inputOptions) {
        Object.assign(swalConfig, inputOptions);
    }

    const result = await Swal.fire(swalConfig);

    if (result.isConfirmed) {
        let reason = '';
        if (action === 'suspend' && result.value) {
            reason = result.value;
        }

        Swal.fire({
            title: 'Ejecutando acción...',
            text: 'Por favor espera',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        try {
            const response = await fetch('scripts/accountAction.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, server, user, domain, reason })
            });

            const data = await response.json();

            if (data.success) {
                Swal.fire('¡Éxito!', data.message, 'success').then(() => {
                    applyLocalAccountUpdate(server, user, domain, action, reason);
                });
            } else {
                Swal.fire('Error', data.message || 'Error desconocido', 'error');
            }
        } catch (error) {
            Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
        }
    }
}

/**
 * Actualiza la ficha de UNA cuenta en memoria (allData) tras una acción
 * exitosa (suspender/activar/eliminar), sin recargar todo el listado del
 * servidor contra WHM. Esto es solo para reflejar el cambio en el JSON
 * que alimenta la vista; el botón "Recargar este servidor" sigue siendo
 * quien vuelve a consultar WHM de verdad.
 *
 * - suspend/unsuspend: cambia el badge y los botones de esa fila al
 *   instante (pasa de Suspendida a Activa o viceversa).
 * - remove: la fila queda deshabilitada (WHM = "Eliminada", sin acciones)
 *   hasta que se recargue el servidor o el registro desaparezca del
 *   listado real.
 */
function applyLocalAccountUpdate(server, user, domain, action, reason) {
    const srv = allData.find(s => s.server === server);
    if (!srv || !srv.accounts) return;

    const acc = srv.accounts.find(a => a.user === user && a.domain === domain);
    if (!acc) return;

    if (action === 'suspend') {
        acc.suspended = true;
        acc.suspendReason = reason || '';
        acc.suspendTime = Math.floor(Date.now() / 1000);
    } else if (action === 'unsuspend') {
        acc.suspended = false;
        acc.suspendReason = '';
        acc.suspendTime = null;
    } else if (action === 'remove') {
        acc.removed = true;
    }

    buildFilterTabs(); // refresca contadores de las pestañas de servidor
    renderResults();
}

// ============================================================
// MODAL VALIDACIÓN DNS (NS reales vs. oficiales del servidor)
// ============================================================

function handleValidateDns(server, domain) {
    openDnsModal(server, domain);
}

function openDnsModal(server, domain) {
    document.getElementById('dnsModal').style.display = 'flex';

    const loadingEl = document.getElementById('dnsModalLoading');
    const errorEl = document.getElementById('dnsModalError');
    const bodyEl = document.getElementById('dnsModalBody');
    const titleDomain = document.getElementById('dnsModalDomain');
    const badgeEl = document.getElementById('dnsServerBadge');

    if (titleDomain) titleDomain.textContent = domain;
    if (badgeEl) badgeEl.style.display = 'none';

    loadingEl.style.display = 'flex';
    errorEl.style.display = 'none';
    bodyEl.style.display = 'none';

    const params = new URLSearchParams({ server, domain });

    fetch(`scripts/checkDns.php?${params.toString()}`)
        .then(res => res.json())
        .then(data => {
            loadingEl.style.display = 'none';

            if (!data.success) {
                document.getElementById('dnsModalErrorMsg').textContent = data.message || 'No se pudo validar el DNS.';
                errorEl.style.display = 'flex';
                return;
            }

            fillDnsModal(data);
            bodyEl.style.display = 'block';
        })
        .catch(err => {
            loadingEl.style.display = 'none';
            document.getElementById('dnsModalErrorMsg').textContent = 'Error de conexión: ' + err.message;
            errorEl.style.display = 'flex';
        });
}

function closeDnsModal() {
    document.getElementById('dnsModal').style.display = 'none';
}

function fillDnsModal(data) {
    // Columna izquierda: nombre del servidor + sus DNS oficiales
    document.getElementById('dnsServerLabel').textContent = `Servidor: ${data.server}`;
    const expectedListEl = document.getElementById('dnsExpectedList');
    expectedListEl.innerHTML = data.expected.map(ns => `<li>${escHtml(ns)}</li>`).join('');

    // Columna derecha: DNS registrados actualmente en el dominio
    const foundListEl = document.getElementById('dnsFoundList');
    foundListEl.innerHTML = data.found.length
        ? data.found.map(ns => `<li>${escHtml(ns)}</li>`).join('')
        : '<li><em>Sin registros NS</em></li>';

    // Indicar de dónde salió el dato: Nic.cl (lo ideal, coincide con la
    // web de Nic.cl) o DNS como respaldo (cuando Nic.cl no respondió a
    // tiempo — puede no coincidir exactamente con Nic.cl).
    const foundLabelEl = document.getElementById('dnsFoundLabel');
    if (foundLabelEl) {
        if (data.source === 'nic.cl') {
            foundLabelEl.textContent = 'DNS registrados desde Nic.cl';
        } else if (data.source === 'dns_fallback') {
            foundLabelEl.textContent = 'DNS registrados (respaldo DNS, Nic.cl no respondió)';
        } else {
            foundLabelEl.textContent = 'DNS registrados';
        }
    }

    // Etiqueta junto al título: muestra el servidor al que REALMENTE
    // apunta el DNS ahora mismo (matched_server) o, si no hay match,
    // el servidor esperado. Verde = servidor vigente, rojo = obsoleto.
    const badge = document.getElementById('dnsServerBadge');
    if (data.matched_server) {
        // Se sabe con certeza a qué servidor apunta el DNS ahora mismo:
        // verde si ese servidor está vigente, rojo si está obsoleto.
        badge.textContent = `${data.matched_server}`;
        badge.classList.remove('vigente', 'obsoleto');
        badge.classList.add(data.matched_server_estado === 'obsoleto' ? 'obsoleto' : 'vigente');
        badge.style.display = 'inline-flex';
    } else {
        // No coincide con ningún servidor conocido: no hay certeza de a
        // qué apunta, así que no mostramos una etiqueta que podría confundir.
        badge.style.display = 'none';
    }

    // Banner de resultado
    const banner = document.getElementById('dnsResultBanner');
    const icon = document.getElementById('dnsResultIcon');
    const text = document.getElementById('dnsResultText');

    banner.classList.remove('correct', 'partial', 'incorrect');

    let resultText;
    if (data.is_correct) {
        banner.classList.add('correct');
        icon.className = 'fas fa-circle-check';
        resultText = `El servidor se encuentra correctamente apuntando a <b>${escHtml(data.server)}</b>.`;
    } else if (data.matched_server && data.matched_server !== data.server) {
        banner.classList.add('incorrect');
        icon.className = 'fas fa-triangle-exclamation';
        const obsoletoNote = data.matched_server_estado === 'obsoleto'
            ? ' <span style="color:var(--suspended);font-weight:700;">(servidor OBSOLETO, dado de baja)</span>'
            : '';
        resultText = `El servidor se encuentra apuntando a <b>${escHtml(data.matched_server)}</b>${obsoletoNote} (${data.matched_ns.map(escHtml).join(', ')}).<br>Cámbialos a los DNS correctos de <b>${escHtml(data.server)}</b>: ${data.expected.map(escHtml).join(', ')}.`;
    } else if (data.is_partial) {
        banner.classList.add('partial');
        icon.className = 'fas fa-triangle-exclamation';
        resultText = `Coincidencia parcial con <b>${escHtml(data.server)}</b>: solo parte de los NS esperados están presentes.<br>Cámbialos a los DNS correctos: ${data.expected.map(escHtml).join(', ')}.`;
    } else {
        banner.classList.add('incorrect');
        icon.className = 'fas fa-triangle-exclamation';
        resultText = `El dominio no apunta a ninguno de nuestros servidores conocidos.<br>Cámbialos a los DNS correctos de <b>${escHtml(data.server)}</b>: ${data.expected.map(escHtml).join(', ')}.`;
    }

    text.innerHTML = resultText;
}

// ============================================================
// INTEGRACIÓN DEL MODAL CAMBIO DE CONTRASEÑA (mod-menu)
// ============================================================

function openChangePasswordModal(server, user, domain) {
    // Rellenar los campos del formulario modal
    document.getElementById('pwdServer').value = server;
    document.getElementById('pwdUser').value = user;
    document.getElementById('pwdDomain').value = domain;

    // Limpiar inputs de contraseña anteriores
    document.getElementById('newPassword').value = '';

    // Resetear vistas de validación y fortaleza
    handlePasswordInput();

    // Mostrar el modal
    document.getElementById('passwordModal').style.display = 'flex';
}

function closePasswordModal() {
    document.getElementById('passwordModal').style.display = 'none';
}

function togglePasswordVisibility(fieldId) {
    const field = document.getElementById(fieldId);
    if (field) {
        field.type = field.type === 'password' ? 'text' : 'password';
    }
}

function generateRandomPassword() {
    const minLength = 16;
    const maxLength = 16;
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;

    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const symbols = "?!.#$%&*";

    let password = "";
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];

    const allChars = uppercase + lowercase + numbers + symbols;
    for (let i = 4; i < length; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    password = password
        .split("")
        .sort(() => 0.5 - Math.random())
        .join("");

    const passwordInput = document.getElementById("newPassword");

    passwordInput.value = password;

    handlePasswordInput(true);
}

// ── Copiar dominio al portapapeles (botón en la celda Dominio) ──
function copyDomainToClipboard(domain) {
    const notify = (ok) => {
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: ok ? 'success' : 'error',
            title: ok ? 'Dominio copiado al portapapeles' : 'No se pudo copiar el dominio',
            showConfirmButton: false,
            timer: 1600,
            timerProgressBar: true
        });
    };

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(domain)
            .then(() => notify(true))
            .catch(err => {
                console.error("Error al copiar dominio: ", err);
                notify(false);
            });
    } else {
        // Fallback para entornos locales HTTP
        const textArea = document.createElement("textarea");
        textArea.value = domain;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            notify(document.execCommand('copy'));
        } catch (err) {
            console.error("Error al copiar dominio (fallback): ", err);
            notify(false);
        }
        document.body.removeChild(textArea);
    }
}

function copyPasswordToClipboard() {
    const password = document.getElementById("newPassword").value;
    const statusText = document.getElementById("copyStatusText");
    const domain = document.getElementById('pwdDomain').value;
    const user = document.getElementById('pwdUser').value;

    if (!password) {
        if (statusText) {
            statusText.textContent = "✖ Ingresa una contraseña antes de copiar";
            statusText.style.color = "red";
        }
        return;
    }

    const copyText = `Acceso a cPanel: https://cpanel.${domain}\nUsuario: ${user}\nContraseña: ${password}`;

    const showSuccess = () => {
        if (statusText) {
            statusText.textContent = "✔ Copiado con éxito";
            statusText.style.color = "green";
        }
    };
    const showError = (err) => {
        console.error("Error al copiar: ", err);
        if (statusText) {
            statusText.textContent = "✖ Error al copiar la contraseña";
            statusText.style.color = "red";
        }
    };

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(copyText).then(showSuccess).catch(showError);
    } else {
        // Fallback para entornos locales HTTP
        const textArea = document.createElement("textarea");
        textArea.value = copyText;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            const successful = document.execCommand('copy');
            successful ? showSuccess() : showError();
        } catch (err) {
            showError(err);
        }
        document.body.removeChild(textArea);
    }
}

function handlePasswordInput(skipReset = false) {
    const password = document.getElementById("newPassword").value;
    const submitBtn = document.getElementById("pwdSubmitBtn");
    const strengthFill = document.getElementById("strengthFill");

    if (!skipReset) {
        const statusText = document.getElementById("copyStatusText");
        if (statusText) statusText.textContent = "";
    }

    if (password.trim() === "") {
        submitBtn.disabled = true;

        const helpContainer = document.getElementById("passwordHelpContainer");
        helpContainer.style.backgroundColor = "";
        helpContainer.style.borderColor = "";
        helpContainer.style.color = "";

        const resetItems = ["lengthReq", "uppercaseReq", "numberReq", "symbolReq"];
        resetItems.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.style.color = "";
        });

        strengthFill.style.width = "0%";
        strengthFill.style.background = "";

        const strengthText = document.getElementById("strengthText");
        strengthText.textContent = "";
        return;
    }

    checkStrength();
    validateForm();
}

function checkStrength() {
    const password = document.getElementById("newPassword").value;
    const strengthFill = document.getElementById("strengthFill");
    const strengthText = document.getElementById("strengthText");
    const submitBtn = document.getElementById("pwdSubmitBtn");

    let strength = 0;
    if (password.length >= 12 && password.length <= 16) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    let width = (strength / 4) * 100;
    strengthFill.style.width = width + "%";

    if (password.length === 0) {
        strengthFill.style.width = "0%";
        strengthText.textContent = "";
        submitBtn.disabled = true;
    } else {
        if (strength <= 1) {
            strengthFill.style.background = "red";
            strengthText.textContent = "Contraseña débil";
            strengthText.style.color = "red";
        } else if (strength == 2) {
            strengthFill.style.background = "orange";
            strengthText.textContent = "Contraseña media";
            strengthText.style.color = "#b36b00";
        } else if (strength == 3) {
            strengthFill.style.background = "blue";
            strengthText.textContent = "Contraseña buena";
            strengthText.style.color = "#0047b3";
        } else {
            strengthFill.style.background = "green";
            strengthText.textContent = "Contraseña fuerte";
            strengthText.style.color = "#007300";
        }
    }

    updatePasswordHelp(strength);
    updatePasswordHelpItems(password);

    submitBtn.disabled = strength < 2;
}

function updatePasswordHelp(strength) {
    const helpContainer = document.getElementById("passwordHelpContainer");

    if (strength <= 1) {
        helpContainer.style.backgroundColor = "#ffe6e6";
        helpContainer.style.borderColor = "#ff4d4d";
        helpContainer.style.color = "#b30000";
    } else if (strength == 2) {
        helpContainer.style.backgroundColor = "#fff4e6";
        helpContainer.style.borderColor = "#ff9933";
        helpContainer.style.color = "#b36b00";
    } else if (strength == 3) {
        helpContainer.style.backgroundColor = "#e6f0ff";
        helpContainer.style.borderColor = "#3399ff";
        helpContainer.style.color = "#0047b3";
    } else {
        helpContainer.style.backgroundColor = "#e6ffe6";
        helpContainer.style.borderColor = "#33cc33";
        helpContainer.style.color = "#007300";
    }
}

function updatePasswordHelpItems(password) {
    const lengthReq = document.getElementById("lengthReq");
    const uppercaseReq = document.getElementById("uppercaseReq");
    const numberReq = document.getElementById("numberReq");
    const symbolReq = document.getElementById("symbolReq");

    if (password.length >= 12 && password.length <= 16) {
        lengthReq.style.color = "green";
    } else {
        lengthReq.style.color = "red";
    }

    if (/[A-Z]/.test(password)) {
        uppercaseReq.style.color = "green";
    } else {
        uppercaseReq.style.color = "red";
    }

    if (/[0-9]/.test(password)) {
        numberReq.style.color = "green";
    } else {
        numberReq.style.color = "red";
    }

    if (/[^A-Za-z0-9]/.test(password)) {
        symbolReq.style.color = "green";
    } else {
        symbolReq.style.color = "red";
    }
}

function validateForm() {
    const password = document.getElementById("newPassword").value;
    const strengthFill = document.getElementById("strengthFill");
    const submitBtn = document.getElementById("pwdSubmitBtn");

    const strongEnough = parseInt(strengthFill.style.width.replace("%", ""), 10) >= 50;

    submitBtn.disabled = !(password !== "" && strongEnough);
}

async function execChangePassword(event) {
    event.preventDefault();

    const server = document.getElementById('pwdServer').value;
    const user = document.getElementById('pwdUser').value;
    const domain = document.getElementById('pwdDomain').value;
    const password = document.getElementById('newPassword').value;

    Swal.fire({
        title: 'Cambiando contraseña...',
        text: 'Por favor, espera unos segundos',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        const response = await fetch('scripts/changePassword.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain, password, sv: server })
        });

        const data = await response.json();

        if (data.success) {
            const copyText = `Acceso a cPanel: https://cpanel.${domain}\nUsuario: ${user}\nContraseña: ${password}`;
            
            Swal.fire({
                title: '¡Contraseña cambiada!',
                html: `<p>${data.message}</p>
                       <div style="text-align: left; background: rgba(0,0,0,0.05); padding: 10px; border-radius: 5px; font-family: monospace; font-size: 14px; margin-top: 15px; border: 1px solid rgba(0,0,0,0.1);">
                           Acceso a cPanel: https://cpanel.${domain}<br>
                           Usuario: ${user}<br>
                           Contraseña: ${password}
                       </div>`,
                icon: 'success',
                showCancelButton: true,
                confirmButtonColor: '#22c55e',
                cancelButtonColor: '#64748b',
                confirmButtonText: '<i class="fas fa-copy"></i> Copiar y Cerrar',
                cancelButtonText: 'Cerrar'
            }).then((result) => {
                if (result.isConfirmed) {
                    // Lógica de copiado (con fallback)
                    if (navigator.clipboard && window.isSecureContext) {
                        navigator.clipboard.writeText(copyText).catch(err => console.error("Error copy:", err));
                    } else {
                        const textArea = document.createElement("textarea");
                        textArea.value = copyText;
                        textArea.style.position = "fixed";
                        textArea.style.left = "-999999px";
                        textArea.style.top = "-999999px";
                        document.body.appendChild(textArea);
                        textArea.focus();
                        textArea.select();
                        try { document.execCommand('copy'); } catch(e) {}
                        document.body.removeChild(textArea);
                    }
                    
                    Swal.fire({
                        title: '¡Copiado!',
                        text: 'Los datos han sido copiados al portapapeles.',
                        icon: 'success',
                        timer: 2000,
                        showConfirmButton: false
                    });
                }
                closePasswordModal();
            });
        } else {
            Swal.fire('Error', data.message || 'Error al cambiar contraseña', 'error');
        }
    } catch (error) {
        console.error("Error al cambiar contraseña:", error);
        Swal.fire('Error', 'No se pudo conectar con el servidor para cambiar la contraseña. Detalle: ' + error.message, 'error');
    }
}