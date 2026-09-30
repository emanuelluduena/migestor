/* ═══════════════════════════════════════════════════════════════════════════
 * Mi Gestor — Menú nuevo (botón de tres líneas, módulos agrupados, accesos rápidos,
 * buscador "Ir a…" y barra inferior en el celular).
 *
 * Es una CAPA por encima de las pestañas de siempre:
 *   - Lee las mismas pestañas (.tab[data-tab]) y navega con la misma función irA().
 *   - Respeta los permisos por rol (tienePermiso) y los avisos rojos (stock bajo, tareas…).
 *   - No modifica ningún módulo. La barra de pestañas vieja queda en la página (oculta),
 *     así todo lo que ya la usa sigue funcionando igual.
 *   - Si algo falla al armarse, el menú de siempre queda visible.
 *   - "Usar menú clásico" (abajo del menú) vuelve al de antes; se recuerda en el navegador.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CLAVE_MODO = 'mg_menu_modo';       // 'clasico' o vacío (nuevo)
  var CLAVE_VISTOS = 'mg_menu_vistos';   // módulos nuevos que ya abrió

  var GRUPOS = [
    { t: 'Vender',    m: ['ventas', 'caja', 'clientes', 'fidelizacion'] },
    { t: 'Productos', m: ['articulos', 'precios', 'listasprov', 'etiquetas', 'proveedores', 'compras'] },
    { t: 'Plata',     m: ['gastos', 'contabilidad', 'estadisticas'] },
    { t: 'Equipo',    m: ['usuarios', 'horarios', 'tareas', 'mensajes'] },
    { t: 'Sistema',   m: ['importar', 'bitacora', 'config'] }
  ];
  var RAPIDOS = ['ventas', 'caja', 'articulos', 'clientes', 'precios', 'inicio'];
  var NUEVOS = { listasprov: true };
  var NOMBRES = { importar: 'Importar / Exportar', listasprov: 'Listas de proveedor', inicio: 'Inicio' };

  var IC = {
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
    mas: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>',
    inicio: '<path d="M4 11l8-6.5 8 6.5v8.5a1 1 0 01-1 1h-4.5v-6h-5v6H5a1 1 0 01-1-1z"/>',
    ventas: '<path d="M4 6h2l2.2 9.5h9.3L19.5 9H7"/><circle cx="9.5" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/>',
    caja: '<rect x="3.5" y="7" width="17" height="11" rx="2"/><path d="M3.5 11h17M8 15h3"/>',
    clientes: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3.3 2.9-5 5.5-5s4.9 1.7 5.5 5"/><path d="M16 6.5a3 3 0 010 5.8M18 14.3c1.6.6 2.6 2 3 4.2"/>',
    fidelizacion: '<rect x="4" y="10" width="16" height="10" rx="1.5"/><path d="M12 10v10M4 10h16V7.5H4zM12 7.5c-1.8 0-4-.5-4-2.2 0-1.3 1.3-1.8 2.3-1.3 1 .6 1.7 2 1.7 3.5zM12 7.5c1.8 0 4-.5 4-2.2 0-1.3-1.3-1.8-2.3-1.3-1 .6-1.7 2-1.7 3.5z"/>',
    articulos: '<path d="M12 3.5l8 4v9l-8 4-8-4v-9z"/><path d="M4 7.5l8 4 8-4M12 11.5v9"/>',
    precios: '<path d="M12 4v16M15.5 8c-.6-1.1-1.9-1.8-3.5-1.8-2 0-3.5 1-3.5 2.6 0 3.6 7.2 1.8 7.2 5.4 0 1.6-1.6 2.7-3.7 2.7-1.7 0-3.1-.8-3.7-2"/>',
    etiquetas: '<path d="M3.5 12.5V4.5h8l9 9-8 8z"/><circle cx="8" cy="9" r="1.2"/>',
    listasprov: '<path d="M6 3.5h9l3.5 3.5v13.5H6z"/><path d="M14.5 3.5V7.5h4M9 12h6M9 15.5h6"/>',
    proveedores: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="17.5" r="1.5"/><circle cx="17" cy="17.5" r="1.5"/>',
    compras: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6.5a3 3 0 016 0V8"/>',
    gastos: '<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z"/><path d="M9 8.5h6M9 12h6"/>',
    contabilidad: '<path d="M5 4.5h11a3 3 0 013 3v12H8a3 3 0 01-3-3z"/><path d="M8 4.5v15M11.5 9h4"/>',
    estadisticas: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
    usuarios: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.7-4 3.6-6 7-6s6.3 2 7 6"/>',
    horarios: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
    tareas: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8 12.5l3 3 5-6"/>',
    mensajes: '<path d="M4 5.5h16v11H10l-4.5 3.5v-3.5H4z"/>',
    importar: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4.5 19.5h15"/>',
    bitacora: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5"/>',
    config: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5V6M12 18v2.5M3.5 12H6M18 12h2.5M6 6l1.8 1.8M16.2 16.2L18 18M18 6l-1.8 1.8M7.8 16.2L6 18"/>',
    otro: '<circle cx="12" cy="12" r="3.5"/>'
  };

  var S = { abierto: false, pal: false, foco: null, sel: 0, filtrados: [], obs: null, listo: false };

  function $(id) { return document.getElementById(id); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento: no pasa nada */ } }
  function sinAcentos(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function svg(nombre, tam) {
    return '<svg width="' + tam + '" height="' + tam + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[nombre] || IC.otro) + '</svg>';
  }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;   // solo se usa con texto propio / íconos fijos
    return e;
  }
  function clasico() { return lsGet(CLAVE_MODO) === 'clasico'; }

  // ── Datos: qué módulos hay y cuáles puede ver esta persona ──────────────────
  function modulosExistentes() {
    var out = [];
    var tabs = document.querySelectorAll('#nav .tab[data-tab]');
    for (var i = 0; i < tabs.length; i++) out.push(tabs[i].getAttribute('data-tab'));
    return out;
  }
  function permitido(mod) {
    try {
      if (typeof tienePermiso === 'function') return !!tienePermiso(mod);
    } catch (e) { /* sigue */ }
    return false;
  }
  function hayCesion() {
    try { return typeof _sesion !== 'undefined' && !!_sesion; } catch (e) { return false; }
  }
  function nombreDe(mod) {
    if (NOMBRES[mod]) return NOMBRES[mod];
    try { if (typeof MODS_NOMBRES !== 'undefined' && MODS_NOMBRES[mod]) return MODS_NOMBRES[mod]; } catch (e) { /* sigue */ }
    var t = document.querySelector('#nav .tab[data-tab="' + mod + '"]');
    return t ? t.textContent.replace(/\d+$/, '').trim() : mod;
  }
  function moduloActivo() {
    var t = document.querySelector('#nav .tab.activo');
    return t ? t.getAttribute('data-tab') : 'inicio';
  }
  function avisoDe(mod) { // números rojos que ya calcula el sistema (stock bajo, tareas, mensajes…)
    var t = document.querySelector('#nav .tab[data-tab="' + mod + '"]');
    if (!t) return '';
    var b = t.querySelectorAll('.tab-badge, .tab-badge2'), total = 0, hay = false;
    for (var i = 0; i < b.length; i++) {
      if (b[i].style.display === 'none') continue;
      var n = parseInt(b[i].textContent, 10);
      if (!isNaN(n) && n > 0) { total += n; hay = true; }
    }
    return hay ? String(total) : '';
  }
  function visibles() { // [{mod, nombre}] permitidos y existentes, en el orden del menú
    var existen = modulosExistentes(), usados = {}, res = [];
    function agregar(m) { if (existen.indexOf(m) >= 0 && !usados[m] && permitido(m)) { usados[m] = true; res.push(m); } }
    agregar('inicio');
    GRUPOS.forEach(function (g) { g.m.forEach(agregar); });
    existen.forEach(agregar);
    return res.map(function (m) { return { mod: m, nombre: nombreDe(m) }; });
  }

  // ── Estilos ─────────────────────────────────────────────────────────────────
  function inyectarEstilos() {
    if ($('mn-css')) return;
    var css =
      'body.mn-on nav#nav{display:none!important}' +
      '.mn-btn{display:inline-flex}' +
      '.mn-burger,.mn-try{display:none}' +
      'body.mn-on .mn-burger{display:inline-flex}' +
      'body.mn-clasico .mn-try{display:inline-flex}' +
      '.mn-btn{align-items:center;justify-content:center;gap:8px;min-width:44px;height:44px;border-radius:10px;border:1.5px solid rgba(255,255,255,.35);background:rgba(255,255,255,.14);color:#fff;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;padding:0 12px;position:relative}' +
      '.mn-btn:hover{background:rgba(255,255,255,.26)}' +
      '.mn-btn:focus-visible,.mn-item:focus-visible,.mn-bb button:focus-visible,.mn-x:focus-visible{outline:3px solid var(--tierra-claro,#f59e0b);outline-offset:2px}' +
      '.mn-btn.mn-act{background:#fff;color:var(--verde,#334155)}' +
      '.mn-dot{position:absolute;top:5px;right:5px;width:10px;height:10px;border-radius:50%;background:var(--rojo,#c0392b);border:2px solid #475569}' +
      '#mn-mid{display:none;flex:1;align-items:center;gap:8px;padding:0 16px;min-width:0;overflow:hidden}' +
      'body.mn-on #mn-mid{display:flex}' +
      '#mn-mid .mn-btn{flex-shrink:0;white-space:nowrap;height:40px;padding:0 12px}' +
      '#mn-mid .mn-search{margin-left:auto;font-weight:500}' +
      '@media(max-width:1440px){body.mn-on .hinfo .monotrib-txt{display:none}}' +
      '@media(min-width:769px) and (max-width:1320px){body.mn-on .hinfo>span:not(#usr-badge){display:none}}' +
      '@media(min-width:769px) and (max-width:1120px){#mn-mid .mn-btn:not(.mn-search) span,#mn-mid .mn-search span{display:none}#mn-mid{padding:0 8px}}' +
      '.mn-scrim{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:300;display:none}' +
      '.mn-scrim.open{display:block}' +
      '#mn-drawer{position:fixed;top:0;bottom:0;left:0;width:330px;max-width:88vw;background:#fff;z-index:310;box-shadow:6px 0 28px rgba(15,23,42,.25);transform:translateX(-105%);transition:transform .2s ease;display:flex;flex-direction:column;visibility:hidden}' +
      '#mn-drawer.open{transform:none;visibility:visible}' +
      '.mn-dh{display:flex;align-items:center;gap:10px;padding:12px 12px 8px;border-bottom:1px solid var(--verde-suave,#e2e8f0)}' +
      '.mn-dh .t{font-family:"Fraunces",serif;font-size:18px;font-weight:700;color:var(--verde,#334155);flex:1}' +
      '.mn-x{width:44px;height:44px;border-radius:10px;border:none;background:none;color:var(--verde,#334155);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}' +
      '.mn-x:hover{background:var(--verde-suave,#e2e8f0)}' +
      '.mn-bus{margin:10px 12px 4px;height:44px;border-radius:10px;border:1.5px solid var(--verde-suave,#e2e8f0);background:var(--gris-claro,#f3f4f6);color:var(--gris,#374151);display:flex;align-items:center;gap:10px;padding:0 12px;font-family:inherit;font-size:14px;cursor:pointer;text-align:left}' +
      '.mn-lista{flex:1;overflow-y:auto;padding:8px 10px 12px}' +
      '.mn-gt{font-size:11px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:#64748b;padding:12px 12px 6px}' +
      '.mn-item{width:100%;min-height:44px;border:none;background:none;color:var(--verde,#334155);border-radius:10px;display:flex;align-items:center;gap:12px;padding:0 12px;font-family:inherit;font-size:15px;font-weight:500;cursor:pointer;text-align:left}' +
      '.mn-item:hover{background:var(--gris-claro,#f3f4f6)}' +
      '.mn-item.act{background:var(--verde-suave,#e2e8f0);font-weight:700}' +
      '.mn-tag{margin-left:auto;font-size:10px;font-weight:700;background:var(--tierra,#d97706);color:#fff;border-radius:6px;padding:2px 6px}' +
      '.mn-num{margin-left:auto;min-width:20px;text-align:center;font-size:11px;font-weight:700;background:var(--rojo,#c0392b);color:#fff;border-radius:10px;padding:2px 6px}' +
      '.mn-pie{border-top:1px solid var(--verde-suave,#e2e8f0);padding:8px 12px}' +
      '.mn-pie button{width:100%;min-height:40px;border:none;background:none;color:#64748b;font-family:inherit;font-size:13px;cursor:pointer;text-align:left;border-radius:8px;padding:0 8px}' +
      '.mn-pie button:hover{background:var(--gris-claro,#f3f4f6)}' +
      '#mn-pal{position:fixed;inset:0;z-index:320;display:none;align-items:flex-start;justify-content:center;padding-top:12vh;background:rgba(15,23,42,.45)}' +
      '#mn-pal.open{display:flex}' +
      '.mn-pb{background:#fff;width:min(520px,92vw);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden}' +
      '.mn-pb input{width:100%;height:52px;border:none;border-bottom:1px solid var(--verde-suave,#e2e8f0);padding:0 18px;font-family:inherit;font-size:16px;outline:none;box-sizing:border-box}' +
      '.mn-pl{max-height:50vh;overflow-y:auto;padding:6px}' +
      '.mn-pl .mn-item.sel{background:var(--verde-suave,#e2e8f0)}' +
      '.mn-vacio{padding:18px;color:#64748b;font-size:14px}' +
      '.mn-bb{display:none}' +
      '@media(max-width:768px){' +
      '  #mn-mid{display:none!important}' +
      '  body.mn-on .mn-bb{display:flex;position:fixed;left:0;right:0;bottom:0;height:64px;background:#fff;border-top:2px solid var(--verde-suave,#e2e8f0);z-index:250}' +
      '  body.mn-on main{padding-bottom:84px}' +
      '  .mn-bb button{flex:1;border:none;background:none;color:#64748b;font-family:inherit;font-size:11px;font-weight:500;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;border-top:3px solid transparent;position:relative}' +
      '  .mn-bb button.act{color:var(--verde,#334155);font-weight:700;border-top-color:var(--verde,#334155)}' +
      '  .mn-bb .mn-num{position:absolute;top:4px;left:calc(50% + 6px);margin:0}' +
      '}' +
      '@media print{.mn-bb,.mn-scrim,#mn-drawer,#mn-pal{display:none!important}}' +
      '@media (prefers-reduced-motion:reduce){#mn-drawer{transition:none}}';
    var st = document.createElement('style');
    st.id = 'mn-css';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ── Piezas fijas: botón, accesos rápidos, menú lateral, buscador, barra inferior ──
  function armar() {
    var header = document.querySelector('header');
    var nav = $('nav');
    var logo = header && header.querySelector('.hlogo');
    if (!header || !nav || !logo || $('mn-drawer')) return false;

    var burger = el('button', 'mn-btn mn-burger', svg('menu', 22));
    burger.id = 'mn-burger';
    burger.type = 'button';
    burger.setAttribute('aria-label', 'Abrir menú');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-controls', 'mn-drawer');
    burger.addEventListener('click', function () { S.abierto ? cerrar() : abrir(); });
    logo.insertBefore(burger, logo.firstChild);

    var mid = el('div', '');
    mid.id = 'mn-mid';
    header.insertBefore(mid, logo.nextSibling);

    var probar = el('button', 'mn-btn mn-try', svg('menu', 18) + '<span>Menú nuevo</span>');
    probar.type = 'button';
    probar.style.marginRight = '8px';
    probar.addEventListener('click', function () { setModo(false); });
    var hinfo = header.querySelector('.hinfo');
    if (hinfo) hinfo.insertBefore(probar, hinfo.firstChild); else header.appendChild(probar);

    var scrim = el('div', 'mn-scrim');
    scrim.id = 'mn-scrim';
    scrim.addEventListener('click', cerrar);
    document.body.appendChild(scrim);

    var d = el('aside', '');
    d.id = 'mn-drawer';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    d.setAttribute('aria-label', 'Menú de módulos');
    d.innerHTML =
      '<div class="mn-dh"><div class="t">Menú</div><button type="button" class="mn-x" id="mn-cerrar" aria-label="Cerrar menú">' + svg('cerrar', 22) + '</button></div>' +
      '<button type="button" class="mn-bus" id="mn-bus">' + svg('search', 18) + '<span>Ir a…</span></button>' +
      '<div class="mn-lista" id="mn-lista"></div>' +
      '<div class="mn-pie"><button type="button" id="mn-clasico">Usar el menú clásico</button></div>';
    document.body.appendChild(d);
    $('mn-cerrar').addEventListener('click', cerrar);
    $('mn-bus').addEventListener('click', function () { cerrar(true); abrirBuscador(); });
    $('mn-clasico').addEventListener('click', function () { cerrar(true); setModo(true); });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); cerrar(); return; }
      if (e.key === 'Tab') { // el foco se queda dentro del menú
        var f = d.querySelectorAll('button:not([disabled])');
        if (!f.length) return;
        var p = f[0], u = f[f.length - 1];
        if (e.shiftKey && document.activeElement === p) { e.preventDefault(); u.focus(); }
        else if (!e.shiftKey && document.activeElement === u) { e.preventDefault(); p.focus(); }
      }
    });

    var pal = el('div', '');
    pal.id = 'mn-pal';
    pal.innerHTML = '<div class="mn-pb" role="dialog" aria-modal="true" aria-label="Ir a un módulo"><input id="mn-pin" type="text" autocomplete="off" placeholder="Escribí el módulo al que querés ir…" aria-label="Buscar módulo"><div class="mn-pl" id="mn-pl"></div></div>';
    pal.addEventListener('mousedown', function (e) { if (e.target === pal) cerrarBuscador(); });
    document.body.appendChild(pal);
    $('mn-pin').addEventListener('input', function () { S.sel = 0; pintarBuscador(); });
    $('mn-pin').addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); cerrarBuscador(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); S.sel = Math.min(S.sel + 1, S.filtrados.length - 1); pintarBuscador(true); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); S.sel = Math.max(S.sel - 1, 0); pintarBuscador(true); }
      else if (e.key === 'Enter') { e.preventDefault(); var f = S.filtrados[S.sel]; if (f) { cerrarBuscador(true); ir(f.mod); } }
    });

    var bb = el('nav', 'mn-bb');
    bb.id = 'mn-bb';
    bb.setAttribute('aria-label', 'Accesos rápidos');
    document.body.appendChild(bb);

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K') && !clasico() && hayCesion()) {
        e.preventDefault();
        S.pal ? cerrarBuscador() : abrirBuscador();
      } else if (e.key === 'Escape' && S.abierto) cerrar();
    });

    // Avisos y módulo activo: se refrescan cuando el sistema cambia las pestañas de siempre
    try {
      var pend = false;
      S.obs = new MutationObserver(function () {
        if (pend) return; pend = true;
        (window.requestAnimationFrame || setTimeout)(function () { pend = false; refrescar(); });
      });
      S.obs.observe(nav, { attributes: true, subtree: true, childList: true, characterData: true });
    } catch (e) { /* sin observador: se refresca al abrir el menú */ }
    setInterval(refrescar, 5000);
    return true;
  }

  // ── Contenido que cambia (permisos, avisos, módulo activo) ──────────────────
  function refrescar() {
    if (!S.listo) return;
    var v = visibles(), act = moduloActivo(), i;
    // accesos rápidos (escritorio) y barra inferior (celular)
    var rap = [];
    RAPIDOS.forEach(function (m) { for (i = 0; i < v.length; i++) if (v[i].mod === m && rap.length < 3) rap.push(v[i]); });
    var mid = $('mn-mid'), bb = $('mn-bb');
    if (mid) {
      mid.innerHTML = '';
      rap.forEach(function (r) {
        var b = el('button', 'mn-btn' + (r.mod === act ? ' mn-act' : ''), svg(r.mod, 18) + '<span></span>');
        b.type = 'button'; b.querySelector('span').textContent = r.nombre; b.title = r.nombre; b.setAttribute('aria-label', r.nombre);
        b.addEventListener('click', function () { ir(r.mod); });
        mid.appendChild(b);
      });
      var s = el('button', 'mn-btn mn-search', svg('search', 18) + '<span>Ir a…</span>');
      s.type = 'button'; s.title = 'Ir a un módulo (Ctrl + K)'; s.setAttribute('aria-label', 'Ir a un módulo'); s.addEventListener('click', abrirBuscador);
      mid.appendChild(s);
    }
    if (bb) {
      bb.innerHTML = '';
      rap.forEach(function (r) {
        var b = el('button', r.mod === act ? 'act' : '', svg(r.mod, 22) + '<span></span>');
        b.type = 'button'; b.querySelector('span').textContent = r.nombre;
        var n = avisoDe(r.mod); if (n) b.appendChild(el('span', 'mn-num', n));
        b.addEventListener('click', function () { ir(r.mod); });
        bb.appendChild(b);
      });
      var mas = el('button', S.abierto ? 'act' : '', svg('mas', 22) + '<span>Más</span>');
      mas.type = 'button'; mas.addEventListener('click', function () { S.abierto ? cerrar() : abrir(); });
      bb.appendChild(mas);
    }
    // punto rojo en el botón si hay avisos pendientes en algún módulo
    var hayAviso = false;
    for (i = 0; i < v.length; i++) if (avisoDe(v[i].mod)) { hayAviso = true; break; }
    var bu = $('mn-burger');
    if (bu) { var p = bu.querySelector('.mn-dot'); if (hayAviso && !p) bu.appendChild(el('span', 'mn-dot')); else if (!hayAviso && p) p.remove(); }
    if (S.abierto) pintarLista(v, act);
  }

  function pintarLista(v, act) {
    var cont = $('mn-lista'); if (!cont) return;
    var visto = {}; try { visto = JSON.parse(lsGet(CLAVE_VISTOS) || '{}') || {}; } catch (e) { visto = {}; }
    var por = {}; v.forEach(function (x) { por[x.mod] = x; });
    var usados = {};
    cont.innerHTML = '';
    function item(x) {
      usados[x.mod] = true;
      var b = el('button', 'mn-item' + (x.mod === act ? ' act' : ''), svg(x.mod, 20) + '<span></span>');
      b.type = 'button'; b.setAttribute('data-mod', x.mod);
      if (x.mod === act) b.setAttribute('aria-current', 'page');
      b.querySelector('span').textContent = x.nombre;
      var n = avisoDe(x.mod);
      if (n) b.appendChild(el('span', 'mn-num', n));
      else if (NUEVOS[x.mod] && !visto[x.mod]) b.appendChild(el('span', 'mn-tag', 'NUEVO'));
      b.addEventListener('click', function () { ir(x.mod); });
      return b;
    }
    if (por.inicio) cont.appendChild(item(por.inicio));
    GRUPOS.forEach(function (g) {
      var xs = g.m.filter(function (m) { return por[m]; });
      if (!xs.length) return;
      cont.appendChild(el('div', 'mn-gt', g.t));
      xs.forEach(function (m) { cont.appendChild(item(por[m])); });
    });
    var otros = v.filter(function (x) { return !usados[x.mod]; });
    if (otros.length) {
      cont.appendChild(el('div', 'mn-gt', 'Otros'));
      otros.forEach(function (x) { cont.appendChild(item(x)); });
    }
  }

  // ── Acciones ────────────────────────────────────────────────────────────────
  function ir(mod) {
    if (S.abierto) cerrar(true);
    if (NUEVOS[mod]) { var v = {}; try { v = JSON.parse(lsGet(CLAVE_VISTOS) || '{}') || {}; } catch (e) { v = {}; } v[mod] = 1; lsSet(CLAVE_VISTOS, JSON.stringify(v)); }
    try { if (typeof irA === 'function') irA(mod); } catch (e) { console.error('[Menú] irA:', e); }
    try { window.scrollTo(0, 0); } catch (e) { /* sigue */ }
    refrescar();
  }
  function abrir() {
    if (!hayCesion()) return;
    S.abierto = true; S.foco = document.activeElement;
    refrescar();
    $('mn-drawer').classList.add('open');
    $('mn-scrim').classList.add('open');
    var b = $('mn-burger'); if (b) { b.setAttribute('aria-expanded', 'true'); b.setAttribute('aria-label', 'Cerrar menú'); }
    var act = document.querySelector('#mn-lista .mn-item.act') || document.querySelector('#mn-lista .mn-item');
    if (act) act.focus();
    refrescar();
  }
  function cerrar(sinFoco) {
    S.abierto = false;
    var d = $('mn-drawer'); if (d) d.classList.remove('open');
    var s = $('mn-scrim'); if (s) s.classList.remove('open');
    var b = $('mn-burger'); if (b) { b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-label', 'Abrir menú'); }
    if (sinFoco !== true && S.foco && S.foco.focus) { try { S.foco.focus(); } catch (e) { /* sigue */ } }
    refrescar();
  }
  function abrirBuscador() {
    if (!hayCesion() || clasico()) return;
    S.pal = true; S.sel = 0;
    $('mn-pal').classList.add('open');
    var i = $('mn-pin'); i.value = ''; pintarBuscador(); i.focus();
  }
  function cerrarBuscador() { S.pal = false; var p = $('mn-pal'); if (p) p.classList.remove('open'); }
  function pintarBuscador(soloMover) {
    var q = sinAcentos($('mn-pin').value).trim(), act = moduloActivo();
    S.filtrados = visibles().filter(function (x) { return !q || sinAcentos(x.nombre).indexOf(q) >= 0 || sinAcentos(x.mod).indexOf(q) >= 0; });
    if (S.sel >= S.filtrados.length) S.sel = Math.max(0, S.filtrados.length - 1);
    var l = $('mn-pl'); l.innerHTML = '';
    if (!S.filtrados.length) { l.appendChild(el('div', 'mn-vacio', 'No hay módulos con ese nombre.')); return; }
    S.filtrados.forEach(function (x, i) {
      var b = el('button', 'mn-item' + (i === S.sel ? ' sel' : ''), svg(x.mod, 20) + '<span></span>');
      b.type = 'button'; b.tabIndex = -1; b.querySelector('span').textContent = x.nombre + (x.mod === act ? '  ·  estás acá' : '');
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () { cerrarBuscador(); ir(x.mod); });
      l.appendChild(b);
    });
    var s = l.querySelector('.sel'); if (s && s.scrollIntoView && soloMover) s.scrollIntoView({ block: 'nearest' });
  }
  function setModo(paraClasico) {
    lsSet(CLAVE_MODO, paraClasico ? 'clasico' : '');
    aplicarModo();
    refrescar();
  }
  function aplicarModo() {
    var cl = clasico();
    document.body.classList.toggle('mn-on', !cl);
    document.body.classList.toggle('mn-clasico', cl);
  }

  function iniciar() {
    try {
      inyectarEstilos();
      if (!armar()) return;
      S.listo = true;
      aplicarModo();
      refrescar();
    } catch (e) {
      console.error('[Menú] no se pudo armar, queda el menú de siempre:', e);
      try { document.body.classList.remove('mn-on'); } catch (e2) { /* sigue */ }
    }
  }

  window.MenuNuevo = { abrir: abrir, cerrar: cerrar, refrescar: refrescar, modoClasico: setModo };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
