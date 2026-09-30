/* ═══════════════════════════════════════════════════════════════════════════
   Fidelización completa (integrada a Mi Gestor)
   Suma al módulo "Fidelización" lo que tenía la app de Fidelización suelta:
   Clientes con puntos, Calculadora de premios, Promociones por mail,
   Importar clientes (CSV), avisos por mail al sumar/canjear y Ayuda.
   Los clientes son SIEMPRE los de Mi Gestor (tabla `clientes` / DB.clis):
   un cliente se da de alta una sola vez y ya lo lee Fidelización.
   Se apoya en las funciones del módulo base (fid*) y las extiende sin romperlas.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  // fmtE() de Mi Gestor redondea hacia arriba a $50 (es para precios); acá se necesitan importes exactos
  const fmtE = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const esAdmin = () => !!(typeof _sesion !== 'undefined' && _sesion && _sesion.rol === 'Administrador');
  const usuarioUuid = () => (typeof _sesion !== 'undefined' && _sesion && _sesion._uuid) ? _sesion._uuid : null;

  const TABS = [
    { id: 'clientes', txt: '👥 Clientes', panel: 'panel-fidclientes' },
    { id: 'premios', txt: '🎁 Premios', panel: 'panel-fidpremios' },
    { id: 'promo', txt: '📣 Promoción', panel: 'panel-fidpromo', soloAdmin: true },
    { id: 'config', txt: '⚙️ Configuración', panel: 'panel-fidcfg' },
    { id: 'ayuda', txt: '❓ Ayuda', panel: 'panel-fidayuda' }
  ];

  // ───────────────────────── Mail (aviso al cliente) ─────────────────────────
  function avisosActivos() { return !(typeof _fidConfig !== 'undefined' && _fidConfig && _fidConfig.avisar_mail === false); }

  async function notificarMail(tipo, cli, puntos, premioNombre) {
    try {
      if (!cli || !cli._uuid || !cli.email || !avisosActivos()) return;
      await fetch(SB_URL + '/functions/v1/fidelizacion-mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ negocio_id: NEGOCIO_ID, cliente_id: cli._uuid, origen: 'pos', tipo, puntos, premio_nombre: premioNombre || null })
      });
    } catch (e) { console.warn('No se pudo avisar por mail (no interrumpe el flujo):', e); }
  }

  // ───────────────────────── Movimiento de puntos genérico ─────────────────────────
  async function aplicarMovimiento(cli, tipo, pts, extra) {
    extra = extra || {};
    const antes = cli.puntos || 0;
    cli.puntos = Math.max(0, antes + pts);
    try {
      if (cli._uuid) {
        await sbPatch('clientes', cli._uuid, { puntos: cli.puntos });
        await sbPost('fidelizacion_movimientos', {
          negocio_id: NEGOCIO_ID, cliente_id: cli._uuid, tipo, puntos: pts,
          premio_id: extra.premio_id || null, usuario_id: usuarioUuid(), nota: extra.nota || null
        });
      }
      saveDB();
      if (typeof renderClis === 'function') renderClis();
      renderClientes();
    } catch (e) {
      cli.puntos = antes;
      throw e;
    }
  }

  // ───────────────────────── Pestañas ─────────────────────────
  function fidSubTabNuevo(tab) {
    const visibles = TABS.filter((t) => !t.soloAdmin || esAdmin());
    if (!visibles.some((t) => t.id === tab)) tab = 'clientes';
    _fidSubTab = tab;
    TABS.forEach((t) => {
      const p = $(t.panel); if (p) p.style.display = (t.id === tab) ? '' : 'none';
      const b = $('subtab-fid2-' + t.id); if (b) { b.className = 'btn ' + (t.id === tab ? 'bv' : 'bg') + ' bsm'; b.style.display = (!t.soloAdmin || esAdmin()) ? '' : 'none'; }
    });
    if (tab === 'clientes') renderClientes();
    if (tab === 'premios') { fidCargarPremios(); calcActualizar(); }
    if (tab === 'promo') { fidAsegurarPremiosCargados().then(actualizarDestinatarios); }
  }

  // ───────────────────────── Clientes ─────────────────────────
  function renderClientes() {
    const tb = $('tfidclientes'); if (!tb) return;
    const q = (($('fidcli-filtro') || {}).value || '').trim().toLowerCase();
    const todos = DB.clis || [];
    const lista = todos.filter((c) => !q || (c.nom || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.tel || '').includes(q) || (c.dni || '').toLowerCase().includes(q))
      .sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'es'));
    $('fidst-clientes').textContent = todos.length;
    $('fidst-puntos').textContent = todos.reduce((s, c) => s + (Number(c.puntos) || 0), 0).toLocaleString('es-AR');
    $('fidst-mail').textContent = todos.filter((c) => c.email).length;
    $('fidcli-vacio').style.display = todos.length ? 'none' : '';
    const MAX = 300;
    tb.innerHTML = lista.slice(0, MAX).map((c) => {
      return '<tr><td><strong>' + esc(c.nom) + '</strong>' + (c.dni ? '<div style="font-size:11px;color:#9ca3af">' + esc(c.dni) + '</div>' : '') + '</td>' +
        '<td style="font-size:12px;color:#666">' + esc(c.email || c.tel || '—') + '</td>' +
        '<td><span class="bdg bt2">🎁 ' + (c.puntos || 0) + '</span></td>' +
        '<td style="white-space:nowrap"><button class="btn bv bsm" onclick="fidcSumar(' + c.id + ')">➕ Puntos</button> ' +
        '<button class="btn bt bsm" onclick="fidcCanje(' + c.id + ')">🎁 Canjear</button> ' +
        '<button class="btn bg bsm" onclick="abrirAjustePuntos(' + c.id + ')" title="Ajuste manual">✏️ Ajustar</button> ' +
        '<button class="btn bg bsm" onclick="fidcHistorial(' + c.id + ')">📜</button> ' +
        '<button class="btn bg bsm" onclick="editCli(' + c.id + ')" title="Editar datos del cliente">👤</button></td></tr>';
    }).join('');
    const mas = $('fidcli-mas');
    mas.style.display = lista.length > MAX ? '' : 'none';
    mas.textContent = 'Mostrando ' + MAX + ' de ' + lista.length + ' clientes. Usá el buscador para encontrar a los demás.';
  }

  function cliPorId(id) { return (DB.clis || []).find((c) => c.id == id); }

  // ── Sumar puntos por compra (manual) ──
  let _sumCli = null;
  async function fidcSumar(id) {
    _sumCli = cliPorId(id); if (!_sumCli) return;
    await fidAsegurarConfigCargada();
    $('fidsum-info').textContent = _sumCli.nom + ' — tiene ' + (_sumCli.puntos || 0) + ' pts';
    $('fidsum-monto').value = ''; $('fidsum-prev').textContent = '';
    abrir('m-fid2-sumar');
    setTimeout(() => $('fidsum-monto').focus(), 80);
  }
  function fidcSumarPrev() {
    const m = num($('fidsum-monto').value);
    $('fidsum-prev').textContent = m > 0 ? ('Suma ' + fidCalcularPuntos(m) + ' punto(s)') : '';
  }
  async function fidcSumarOk() {
    const monto = num($('fidsum-monto').value);
    if (monto <= 0) { toast('Ingresá el monto de la compra', 'a'); return; }
    const pts = fidCalcularPuntos(monto);
    if (pts <= 0) { toast('La regla de puntos no está activa o el monto es muy bajo', 'a'); return; }
    try {
      await aplicarMovimiento(_sumCli, 'suma', pts, { nota: 'Compra por ' + fmtE(monto) + ' (carga manual)' });
      cerrar('m-fid2-sumar');
      toast('🎁 ' + _sumCli.nom + ' sumó ' + pts + ' punto' + (pts !== 1 ? 's' : ''), 'v');
      notificarMail('suma', _sumCli, pts);
    } catch (e) { console.error(e); toast('No se pudo guardar (revisá conexión)', 'r'); }
  }

  // ── Canjear desde el cliente ──
  let _canCli = null;
  async function fidcCanje(id) {
    _canCli = cliPorId(id); if (!_canCli) return;
    await fidAsegurarPremiosCargados();
    if (!_fidPremios.length) { toast('Todavía no cargaste premios (pestaña Premios)', 'a'); return; }
    $('fidcan-info').textContent = _canCli.nom + ' — tiene ' + (_canCli.puntos || 0) + ' pts';
    $('fidcan-premio').innerHTML = _fidPremios.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.nombre) + ' (' + p.costo_puntos + ' pts)</option>').join('');
    fidcCanjePrev();
    abrir('m-fid2-canje');
  }
  function fidcCanjePrev() {
    const p = _fidPremios.find((x) => x.id === $('fidcan-premio').value);
    const el = $('fidcan-prev');
    if (!p) { el.textContent = ''; return; }
    const saldo = (_canCli.puntos || 0) - p.costo_puntos;
    el.style.color = saldo < 0 ? 'var(--rojo)' : 'var(--verde)';
    el.textContent = saldo < 0 ? ('❌ Puntos insuficientes (le faltan ' + (-saldo) + ')') : ('✓ Le quedarían ' + saldo + ' puntos después del canje');
  }
  async function fidcCanjeOk() {
    const p = _fidPremios.find((x) => x.id === $('fidcan-premio').value);
    const cli = _canCli;
    if (!p || !cli) { toast('Elegí un premio', 'a'); return; }
    if ((cli.puntos || 0) < p.costo_puntos) { toast('El cliente no tiene puntos suficientes', 'r'); return; }
    if (!await confirmar('¿Canjear "' + p.nombre + '" por ' + p.costo_puntos + ' puntos de ' + cli.nom + '?')) return;
    const artNum = p.articulo_id ? _artUUIDtoNum[p.articulo_id] : null;
    let art = null;
    if (artNum) {
      art = DB.arts.find((a) => a.id === artNum);
      if (art && art.usastk !== 'no' && art.stk <= 0) { toast('Sin stock de ' + art.nom, 'r'); return; }
    }
    try {
      await aplicarMovimiento(cli, 'canje', -p.costo_puntos, { premio_id: p.id, nota: 'Canje: ' + p.nombre });
      if (art) {
        art.stk = Math.max(0, (art.stk || 0) - 1);
        if (art._uuid) await sbPatch('articulos', art._uuid, { stock_actual: art.stk });
        saveDB(); if (typeof renderArts === 'function') renderArts();
      }
      cerrar('m-fid2-canje');
      toast('🎁 Canje registrado: ' + p.nombre + ' para ' + cli.nom, 'v');
      notificarMail('canje', cli, p.costo_puntos, p.nombre);
    } catch (e) { console.error(e); toast('No se pudo procesar el canje (revisá conexión)', 'r'); }
  }

  // ── Historial ──
  async function fidcHistorial(id) {
    const cli = cliPorId(id); if (!cli) return;
    const cont = $('fidhist-lista');
    $('fidhist-tit').textContent = '📜 Historial — ' + cli.nom;
    cont.innerHTML = 'Cargando...';
    abrir('m-fid2-hist');
    if (!cli._uuid) { cont.innerHTML = '<div class="vacio"><p>Este cliente todavía no se sincronizó.</p></div>'; return; }
    try {
      const movs = await sbGet('fidelizacion_movimientos', 'cliente_id=eq.' + cli._uuid + '&order=created_at.desc&limit=60');
      if (!movs.length) { cont.innerHTML = '<div class="vacio"><p>Sin movimientos todavía.</p></div>'; return; }
      const et = { suma: '➕ Suma', ajuste: '✏️ Ajuste', canje: '🎁 Canje' };
      cont.innerHTML = movs.map((m) =>
        '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px"><div>' +
        (et[m.tipo] || esc(m.tipo)) + (m.nota ? ' — ' + esc(m.nota) : '') +
        '<div style="color:#888;font-size:11px">' + new Date(m.created_at).toLocaleString('es-AR') + '</div></div>' +
        '<div style="font-weight:700;color:' + (m.puntos < 0 ? 'var(--rojo)' : 'var(--verde)') + '">' + (m.puntos > 0 ? '+' : '') + m.puntos + '</div></div>').join('');
    } catch (e) { console.error(e); cont.innerHTML = '<div class="vacio"><p>No se pudo cargar el historial.</p></div>'; }
  }

  // ───────────────────────── Importar clientes (CSV) ─────────────────────────
  let _impFilas = [];

  function parseCSV(texto) {
    texto = String(texto).replace(/^﻿/, '');
    const primera = texto.split('\n')[0] || '';
    const sep = (primera.split(';').length > primera.split(',').length) ? ';' : (primera.split('\t').length > primera.split(',').length ? '\t' : ',');
    const filas = []; let fila = [], campo = '', q = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (q) {
        if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += c;
      } else if (c === '"') q = true;
      else if (c === sep) { fila.push(campo); campo = ''; }
      else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
      else if (c === '\r') { /* ignorar */ }
      else campo += c;
    }
    if (campo.length || fila.length) { fila.push(campo); filas.push(fila); }
    return filas.filter((f) => f.length > 1 || (f[0] && f[0].trim()));
  }
  const normH = (h) => (h || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
  function mapearColumnas(headers) {
    const idx = {};
    headers.forEach((h, i) => {
      const n = normH(h);
      if (idx.nombre == null && (n === 'nombre' || n === 'nombre_completo' || n === 'cliente' || n === 'nombre_y_apellido')) idx.nombre = i;
      else if (idx.nombres == null && n === 'nombres') idx.nombres = i;
      else if (idx.apellidos == null && (n === 'apellidos' || n === 'apellido')) idx.apellidos = i;
      else if (idx.email == null && (n === 'email' || n === 'correo' || n === 'mail' || n === 'e-mail' || n === 'correo_electronico')) idx.email = i;
      else if (idx.tel == null && (n === 'telefono' || n === 'celular' || n === 'whatsapp' || n === 'tel')) idx.tel = i;
      else if (idx.dni == null && (n.includes('documento') || n === 'dni' || n === 'cuit' || n === 'dni/cuit')) idx.dni = i;
      else if (idx.puntos == null && n === 'puntos') idx.puntos = i;
      else if (idx.cumple == null && (n.includes('cumple') || n.includes('nacimiento'))) idx.cumple = i;
    });
    return idx;
  }
  function fechaISO(s) {
    s = (s || '').trim(); if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    return null;
  }

  function fidcImportar() {
    _impFilas = [];
    $('fidimp-archivo').value = '';
    $('fidimp-prev').textContent = ''; $('fidimp-prev').style.color = '';
    $('fidimp-btn').disabled = true;
    abrir('m-fid2-import');
  }

  async function onArchivoImport(e) {
    const prev = $('fidimp-prev'), btn = $('fidimp-btn');
    _impFilas = []; btn.disabled = true; prev.style.color = '';
    const file = e.target.files[0]; if (!file) return;
    let texto;
    try { texto = await file.text(); } catch (err) { prev.style.color = 'var(--rojo)'; prev.textContent = 'No se pudo leer el archivo.'; return; }
    const filas = parseCSV(texto);
    if (filas.length < 2) { prev.style.color = 'var(--rojo)'; prev.textContent = 'El archivo está vacío o no tiene filas de datos.'; return; }
    const idx = mapearColumnas(filas[0]);
    if (idx.nombre == null && idx.nombres == null) { prev.style.color = 'var(--rojo)'; prev.textContent = '⚠️ No encontré una columna de nombre (“Nombre”, o “Nombres” y “Apellidos”).'; return; }
    const cel = (f, k) => (idx[k] != null ? (f[idx[k]] || '').trim() : '');
    const todas = filas.slice(1).map((f) => ({
      nom: idx.nombre != null ? cel(f, 'nombre') : (cel(f, 'nombres') + ' ' + cel(f, 'apellidos')).trim(),
      email: cel(f, 'email'), tel: cel(f, 'tel'), dni: cel(f, 'dni'),
      puntos: Math.max(0, Math.round(num(cel(f, 'puntos').replace(',', '.')))), cumple: fechaISO(cel(f, 'cumple'))
    })).filter((r) => r.nom);
    // No duplica clientes que ya existen (mismo email, mismo DNI o mismo nombre)
    const existentes = DB.clis || [];
    const sEmail = new Set(existentes.map((c) => (c.email || '').toLowerCase()).filter(Boolean));
    const sDni = new Set(existentes.map((c) => (c.dni || '').replace(/\D/g, '')).filter(Boolean));
    const sNom = new Set(existentes.map((c) => (c.nom || '').trim().toLowerCase()));
    let dup = 0;
    _impFilas = todas.filter((r) => {
      const d = r.dni.replace(/\D/g, '');
      const yaEsta = (r.email && sEmail.has(r.email.toLowerCase())) || (d && sDni.has(d)) || sNom.has(r.nom.toLowerCase());
      if (yaEsta) { dup++; return false; }
      if (r.email) sEmail.add(r.email.toLowerCase()); if (d) sDni.add(d); sNom.add(r.nom.toLowerCase());
      return true;
    });
    if (!_impFilas.length) { prev.style.color = 'var(--rojo)'; prev.textContent = todas.length ? ('Los ' + todas.length + ' clientes del archivo ya están cargados.') : 'No encontré filas con nombre.'; return; }
    prev.style.color = 'var(--verde)';
    prev.textContent = 'Listos para importar: ' + _impFilas.length + ' cliente(s)' + (dup ? (' · ' + dup + ' ya existían y se omiten') : '') + '.';
    btn.disabled = false;
  }

  async function fidcImportarOk() {
    if (!_impFilas.length) return;
    if (!await confirmar('¿Importar ' + _impFilas.length + ' cliente(s) a Mi Gestor? Se agregan a tu lista de Clientes; no se borra ni cambia nada existente.')) return;
    const btn = $('fidimp-btn'), txt = btn.textContent;
    btn.disabled = true; btn.textContent = 'Importando...';
    let ok = 0;
    try {
      const LOTE = 100;
      for (let i = 0; i < _impFilas.length; i += LOTE) {
        const bloque = _impFilas.slice(i, i + LOTE);
        const res = await sbPost('clientes', bloque.map((r) => ({
          negocio_id: NEGOCIO_ID, sucursal_id: SUCURSAL_ID || null, nombre: r.nom, dni: r.dni || null, telefono: r.tel || null,
          email: r.email || null, lista_precio: 'lista1', puntos: r.puntos || 0, fecha_cumpleanos: r.cumple || null
        })));
        const movs = [];
        (res || []).forEach((row, k) => {
          const r = bloque[k];
          const n = DB.ids.cli++;
          _cliUUIDtoNum[row.id] = n; _cliNumtoUUID[n] = row.id;
          DB.clis.push({ id: n, _uuid: row.id, nom: row.nombre, dni: row.dni || '', tel: row.telefono || '', email: row.email || '', dir: '', lista: 'lista1', puntos: Number(row.puntos) || 0 });
          if (r.puntos > 0) movs.push({ negocio_id: NEGOCIO_ID, cliente_id: row.id, tipo: 'ajuste', puntos: r.puntos, usuario_id: usuarioUuid(), nota: 'Puntos importados' });
          ok++;
        });
        if (movs.length) await sbPost('fidelizacion_movimientos', movs);
      }
      saveDB();
      cerrar('m-fid2-import');
      if (typeof renderClis === 'function') renderClis();
      renderClientes();
      toast('✓ Se importaron ' + ok + ' cliente(s)', 'v');
    } catch (e) {
      console.error(e);
      saveDB(); renderClientes();
      toast('Hubo un error importando' + (ok ? (' (se alcanzaron a importar ' + ok + ')') : '') + '. Revisá el archivo.', 'r');
    } finally { btn.disabled = false; btn.textContent = txt; }
  }

  // ───────────────────────── Promoción por mail ─────────────────────────
  function premiosOrdenados() { return _fidPremios.slice().sort((a, b) => (a.costo_puntos || 0) - (b.costo_puntos || 0)); }
  function calcularPremiosCliente(c) {
    let alcanzado = null, siguiente = null;
    for (const p of premiosOrdenados()) {
      if ((p.costo_puntos || 0) <= (c.puntos || 0)) alcanzado = p; else { siguiente = p; break; }
    }
    return { alcanzado, siguiente, faltan: siguiente ? Math.max(0, siguiente.costo_puntos - (c.puntos || 0)) : 0 };
  }
  function destinatarios() {
    const f = $('fidpromo-filtro').value;
    return (DB.clis || []).filter((c) => {
      if (!c.email || !String(c.email).includes('@')) return false;
      if (f === 'todos') return true;
      const k = calcularPremiosCliente(c);
      if (f === 'alcanza') return !!k.alcanzado;
      if (f === 'falta') return !k.alcanzado && !!k.siguiente;
      return true;
    });
  }
  function actualizarDestinatarios() {
    const f = $('fidpromo-filtro').value, el = $('fidpromo-dest');
    if (f !== 'todos' && !_fidPremios.length) { el.textContent = 'No podés usar este filtro todavía: cargá al menos un premio en la pestaña “Premios”.'; return; }
    const n = destinatarios().length;
    el.textContent = n ? ('Le va a llegar a ' + n + ' cliente(s) con email cargado.') : 'Ningún cliente cumple este filtro (o no tienen email cargado).';
  }
  function plantilla(tipo) {
    if (tipo === 'falta') {
      $('fidpromo-filtro').value = 'falta';
      $('fidpromo-asunto').value = '¡Ya casi llegás a tu premio!';
      $('fidpromo-msg').value = 'Hola {{nombre}}! Tenés {{puntos}} puntos acumulados y te faltan solo {{faltan}} puntos para canjear "{{premio}}". Seguí comprando para alcanzarlo, ¡te esperamos!';
    } else {
      $('fidpromo-filtro').value = 'alcanza';
      $('fidpromo-asunto').value = '¡Ya podés canjear tu premio!';
      $('fidpromo-msg').value = 'Hola {{nombre}}! Tenés {{puntos}} puntos y ya podés canjear "{{premio}}". Vení a buscarlo cuando quieras. ¡Gracias por elegirnos!';
    }
    actualizarDestinatarios();
  }
  async function enviarPromo() {
    const asunto = $('fidpromo-asunto').value.trim(), mensaje = $('fidpromo-msg').value.trim(), filtro = $('fidpromo-filtro').value;
    if (!asunto || !mensaje) { toast('Completá el asunto y el mensaje', 'a'); return; }
    if (filtro !== 'todos' && !_fidPremios.length) { toast('Cargá al menos un premio para usar este filtro', 'a'); return; }
    const n = destinatarios().length;
    if (!n) { toast('No hay clientes que reciban este mail', 'a'); return; }
    if (!await confirmar('¿Mandar este mail a ' + n + ' cliente(s)? No se puede deshacer.')) return;
    const est = $('fidpromo-estado'); est.textContent = 'Enviando...';
    try {
      const resp = await fetch(SB_URL + '/functions/v1/fidelizacion-campana', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ negocio_id: NEGOCIO_ID, origen: 'pos', asunto, mensaje, filtro })
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) { est.textContent = ''; toast('No se pudo mandar la promoción (revisá conexión o la configuración del mail)', 'r'); return; }
      est.textContent = 'Enviado a ' + data.enviados + ' cliente(s) ✓';
      toast('✓ Promoción enviada a ' + data.enviados + ' cliente(s)', 'v');
    } catch (e) { console.error(e); est.textContent = ''; toast('No se pudo mandar la promoción', 'r'); }
  }

  // ───────────────────────── Calculadora de premios ─────────────────────────
  // Costo de cada punto para el negocio = (monto por punto / puntos otorgados) × % que se devuelve
  function calcCostoPunto() {
    const monto = (_fidConfig && _fidConfig.monto_por_punto) ? Number(_fidConfig.monto_por_punto) : 0;
    const otorg = (_fidConfig && _fidConfig.puntos_otorgados) ? Number(_fidConfig.puntos_otorgados) : 0;
    const dev = num($('fidcalc-dev') && $('fidcalc-dev').value);
    if (monto <= 0 || otorg <= 0 || dev <= 0) return 0;
    return (monto / otorg) * (dev / 100);
  }
  function calcActualizar() {
    const el = $('fidcalc-res'); if (!el) return;
    const margen = num($('fidcalc-margen').value), dev = num($('fidcalc-dev').value);
    try { localStorage.setItem('fid_calc_margen', String(margen)); localStorage.setItem('fid_calc_dev', String(dev)); } catch (e) { /* sin storage */ }
    const cp = calcCostoPunto();
    if (!cp) { el.textContent = 'Configurá primero tu regla de puntos en la pestaña ⚙️ Configuración.'; return; }
    const monto = Number(_fidConfig.monto_por_punto), otorg = Number(_fidConfig.puntos_otorgados);
    let h = 'Con tu regla actual (cada ' + fmtE(monto) + ' = ' + otorg + ' punto' + (otorg === 1 ? '' : 's') + ') y devolviendo el <strong>' + dev + '%</strong>, cada punto te cuesta <strong>' + fmtE(Math.round(cp * 100) / 100) + '</strong>.';
    h += '<br>Ejemplos: un premio que te cuesta ' + fmtE(500) + ' → <strong>' + Math.ceil(500 / cp) + ' pts</strong> · uno de ' + fmtE(1500) + ' → <strong>' + Math.ceil(1500 / cp) + ' pts</strong> · uno de ' + fmtE(2500) + ' → <strong>' + Math.ceil(2500 / cp) + ' pts</strong>.';
    if (margen > 0) {
      if (dev > margen / 3) h += '<br><span style="color:var(--rojo);font-weight:600">⚠️ Cuidado: devolvés más de un tercio de tu margen (' + Math.round(margen / 3 * 10) / 10 + '%). Bajá el % de devolución o subí el costo en puntos de los premios.</span>';
      else h += '<br><span style="color:var(--verde);font-weight:600">✓ Está dentro de lo saludable (menos de un tercio de tu margen).</span>';
    }
    el.innerHTML = h;
  }
  function calcCargarGuardado() {
    try {
      const m = localStorage.getItem('fid_calc_margen'), d = localStorage.getItem('fid_calc_dev');
      if (m) $('fidcalc-margen').value = m; if (d) $('fidcalc-dev').value = d;
    } catch (e) { /* sin storage */ }
    calcActualizar();
  }
  // Sugerencia de puntos al cargar un premio: usa la calculadora; si no hay regla, cae al valor de referencia del punto
  function sugerirCostoPuntos(forzar) {
    const costoRef = num($('premio-costoref').value);
    const sug = $('premio-sugerencia');
    if (!(costoRef > 0)) { sug.textContent = ''; return; }
    const cp = calcCostoPunto() || ((_fidConfig && Number(_fidConfig.valor_punto)) || num($('fid-valorpunto').value));
    if (!(cp > 0)) { sug.textContent = ''; return; }
    const pts = Math.ceil(costoRef / cp);
    sug.textContent = 'Sugerido: ' + pts + ' puntos (según tu calculadora de premios). Podés editarlo arriba.';
    if (forzar || !$('premio-costopts').value) $('premio-costopts').value = pts;
  }

  // ───────────────────────── Construcción de la interfaz ─────────────────────────
  const CSS = '.fidc-tip{font-size:12px;color:#888;background:var(--crema);border-radius:8px;padding:10px 14px;margin-bottom:14px}' +
    '#mod-fidelizacion .fidc-box{border:1.5px solid var(--verde-suave,#e2e8f0);border-radius:8px;padding:14px 16px;margin-bottom:18px}';

  function construir() {
    const mod = $('mod-fidelizacion'); if (!mod || $('panel-fidclientes')) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

    // Barra de pestañas
    const brow = mod.querySelector('.panel .brow');
    brow.innerHTML = TABS.map((t) => '<button class="btn ' + (t.id === 'clientes' ? 'bv' : 'bg') + ' bsm" id="subtab-fid2-' + t.id + '" onclick="fidSubTab(\'' + t.id + '\')">' + t.txt + '</button>').join('');

    // Panel Clientes
    const pc = document.createElement('div'); pc.id = 'panel-fidclientes'; pc.className = 'panel';
    pc.innerHTML =
      '<div class="sgrid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">' +
      '<div class="scard"><div class="snum" id="fidst-clientes">—</div><div class="slbl">Clientes</div></div>' +
      '<div class="scard ti"><div class="snum" id="fidst-puntos">—</div><div class="slbl">Puntos vigentes</div></div>' +
      '<div class="scard"><div class="snum" id="fidst-mail">—</div><div class="slbl">Con email (para promociones)</div></div></div>' +
      '<div class="fidc-tip">💡 Son los mismos clientes de <strong>Clientes</strong> de Mi Gestor: un cliente se carga una sola vez. Los puntos se suman solos al cobrar una venta (tildando “Sumar puntos” en Ventas); desde acá también podés sumar, canjear o ajustar a mano.</div>' +
      '<div class="brow" style="justify-content:space-between">' +
      '<input type="text" id="fidcli-filtro" placeholder="🔎 Buscar por nombre, DNI, email o teléfono..." style="flex:1;min-width:220px;max-width:360px;border:1.5px solid #e5e7eb;border-radius:8px;padding:8px 12px;font-size:14px">' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><span id="fidcli-import-wrap"><button class="btn bg" onclick="fidcImportar()">📂 Importar CSV</button></span><button class="btn bv" onclick="abrirCli()">➕ Nuevo cliente</button></div></div>' +
      '<div class="twrap"><table><thead><tr><th>Cliente</th><th>Contacto</th><th>Puntos</th><th>Acciones</th></tr></thead><tbody id="tfidclientes"></tbody></table></div>' +
      '<div id="fidcli-mas" style="display:none;font-size:12px;color:#888;margin-top:8px"></div>' +
      '<div id="fidcli-vacio" class="vacio" style="display:none"><div class="vi">👥</div><p>Todavía no hay clientes. Cargalos con “Nuevo cliente” o importalos desde un CSV.</p></div>';
    mod.insertBefore(pc, $('panel-fidcfg'));

    // Panel Promoción
    const pp = document.createElement('div'); pp.id = 'panel-fidpromo'; pp.className = 'panel'; pp.style.display = 'none';
    pp.innerHTML =
      '<div class="ptit" style="font-size:16px">📣 Mandar una promoción por mail</div>' +
      '<div class="fidc-tip">Le llega un mail a los clientes con email cargado. Podés usar <code>{{nombre}}</code>, <code>{{puntos}}</code>, <code>{{premio}}</code> y <code>{{faltan}}</code>: los dos últimos se calculan solos según tus premios y los puntos de cada cliente.</div>' +
      '<div class="brow" style="margin-bottom:12px;justify-content:flex-start"><button class="btn bg bsm" id="fidpromo-p1">✍️ Plantilla: les faltan puntos</button><button class="btn bg bsm" id="fidpromo-p2">✍️ Plantilla: ya pueden canjear</button></div>' +
      '<div class="fg" style="margin-bottom:10px"><label>Asunto</label><input type="text" id="fidpromo-asunto" placeholder="Ej: ¡Hoy sumás el doble de puntos!"></div>' +
      '<div class="fg" style="margin-bottom:10px"><label>Mensaje</label><textarea id="fidpromo-msg" rows="5" style="border:1.5px solid #e5e7eb;border-radius:8px;padding:9px 11px;font-size:14px;resize:vertical;font-family:inherit" placeholder="Ej: Hola {{nombre}}, te faltan {{faltan}} puntos para canjear {{premio}}. ¡Seguí comprando!"></textarea></div>' +
      '<div class="fg" style="margin-bottom:10px"><label>¿A quién se lo mandamos?</label><select id="fidpromo-filtro"><option value="todos">A todos los clientes con email</option><option value="falta">Solo a los que todavía no llegan a ningún premio (para que sigan comprando)</option><option value="alcanza">Solo a los que ya juntaron puntos para canjear algún premio</option></select></div>' +
      '<div id="fidpromo-dest" style="font-size:12px;color:#888;margin-bottom:12px"></div>' +
      '<button class="btn bt" id="fidpromo-enviar">📣 Enviar promoción</button><span id="fidpromo-estado" style="font-size:12px;color:var(--verde);margin-left:10px"></span>';
    mod.insertBefore(pp, $('panel-fidcfg'));

    // Panel Ayuda
    const pa = document.createElement('div'); pa.id = 'panel-fidayuda'; pa.className = 'panel'; pa.style.display = 'none';
    const paso = (t, d) => '<p style="margin-bottom:12px"><strong>' + t + '</strong><br>' + d + '</p>';
    pa.innerHTML = '<div class="ptit" style="font-size:16px">❓ Cómo usar Fidelización</div><div style="font-size:14px;line-height:1.6;color:#333">' +
      paso('1. Tus clientes ya están en Mi Gestor.', 'Los clientes se cargan una sola vez, en <em>Clientes</em> (o con “Nuevo cliente” desde acá). También podés importar una lista en CSV. Con nombre alcanza; si cargás el email, reciben avisos y promociones.') +
      paso('2. Definí tu regla de puntos.', 'En “⚙️ Configuración” elegí cada cuántos pesos de compra se suma un punto (ej: cada $1.000, 1 punto).') +
      paso('3. Cargá tus premios.', 'En “🎁 Premios” agregá lo que tus clientes pueden canjear. La <strong>calculadora</strong> te dice cuántos puntos poner para no perder plata; podés vincular un premio a un artículo para que descuente stock al canjear.') +
      paso('4. Los puntos se suman solos en cada venta.', 'En Ventas, elegí el cliente y dejá tildado “Sumar puntos”. Al cobrar se suman según tu regla. Desde “👥 Clientes” también podés cargar una compra a mano.') +
      paso('5. Canjeá premios.', 'En una venta (agregando el premio al ticket) o desde “👥 Clientes” con “Canjear”. Los puntos se descuentan solos.') +
      paso('6. Ajustá a mano si hace falta.', '“Ajustar” suma o resta puntos (correcciones, regalos). “📜” muestra el historial completo del cliente.') +
      paso('7. Mandá promociones.', 'En “📣 Promoción” escribís un mail y se lo mandás a todos, a los que les faltan puntos o a los que ya pueden canjear.') +
      '<p style="margin:0"><strong>💡 Tip:</strong> tus clientes reciben un mail automático cada vez que suman puntos o canjean (si tienen email). Podés apagarlo en “⚙️ Configuración”.</p></div>';
    mod.appendChild(pa);

    // Calculadora arriba de la tabla de premios
    const pprem = $('panel-fidpremios');
    const calc = document.createElement('div'); calc.className = 'fidc-box';
    calc.innerHTML =
      '<div class="ptit" style="font-size:15px;margin-bottom:6px">🧮 Calculadora de premios</div>' +
      '<div style="font-size:12px;color:#888;margin-bottom:12px">Te ayuda a poner el precio de tus premios en puntos sin perder plata: elegí qué porcentaje de lo que compran querés devolverles y te calculamos cuánto te cuesta cada punto.</div>' +
      '<div class="fgrid" style="grid-template-columns:1fr 1fr"><div class="fg"><label>Tu margen de ganancia aproximado (%)</label><input type="number" id="fidcalc-margen" min="1" max="100" step="1" value="35"></div>' +
      '<div class="fg"><label>% de lo que compran que querés devolver</label><input type="number" id="fidcalc-dev" min="0.5" max="50" step="0.5" value="3"></div></div>' +
      '<div id="fidcalc-res" style="font-size:13px;line-height:1.6"></div>';
    pprem.insertBefore(calc, pprem.firstChild);

    // Aviso por mail en Configuración
    const ej = $('fid-ejemplo');
    const av = document.createElement('div'); av.className = 'fg'; av.style.cssText = 'max-width:420px;margin:0 0 14px';
    av.innerHTML = '<label>Avisar por mail al cliente cuando suma o canjea</label><select id="fid-avisar"><option value="si">Sí, mandar aviso (si tiene email)</option><option value="no">No mandar avisos</option></select><div class="sdesc">Las promociones que mandás vos desde “Promoción” no dependen de esto.</div>';
    ej.parentNode.insertBefore(av, ej);

    // Modales
    const modal = (id, tit, cuerpo, pie) => '<div class="moverlay" id="' + id + '"><div class="modal" style="max-width:420px"><h2>' + tit + '</h2>' + cuerpo + '<div class="mfoot">' + pie + '</div></div></div>';
    const wrap = document.createElement('div');
    wrap.innerHTML =
      modal('m-fid2-sumar', '➕ Sumar puntos por compra',
        '<div id="fidsum-info" style="font-size:13px;font-weight:600;color:var(--verde);margin-bottom:10px"></div><div class="fg"><label>Monto de la compra ($)</label><input type="number" id="fidsum-monto" min="0" step="0.01"></div><div id="fidsum-prev" style="font-size:13px;color:var(--verde);font-weight:600;margin-top:8px"></div>',
        '<button class="btn bg" onclick="cerrar(\'m-fid2-sumar\')">Cancelar</button><button class="btn bv" id="fidsum-ok">💾 Confirmar</button>') +
      modal('m-fid2-canje', '🎁 Canjear premio',
        '<div id="fidcan-info" style="font-size:13px;font-weight:600;color:var(--verde);margin-bottom:10px"></div><div class="fg"><label>Premio</label><select id="fidcan-premio"></select></div><div id="fidcan-prev" style="font-size:13px;font-weight:600;margin-top:8px"></div>',
        '<button class="btn bg" onclick="cerrar(\'m-fid2-canje\')">Cancelar</button><button class="btn bv" id="fidcan-ok">✅ Canjear</button>') +
      modal('m-fid2-hist', '<span id="fidhist-tit">📜 Historial</span>',
        '<div id="fidhist-lista" style="max-height:320px;overflow:auto"></div>',
        '<button class="btn bg" onclick="cerrar(\'m-fid2-hist\')">Cerrar</button>') +
      modal('m-fid2-import', '📂 Importar clientes desde CSV',
        '<div class="fidc-tip">Subí un archivo <strong>.csv</strong> (también sirve el de Excel guardado como CSV). Reconoce columnas como <strong>Nombre</strong> (o Nombres/Apellidos), <strong>Email</strong>, <strong>Teléfono</strong>, <strong>DNI</strong>, <strong>Puntos</strong> y <strong>Cumpleaños</strong>, en cualquier orden. Los clientes que ya existen (mismo email, DNI o nombre) se omiten.</div><div class="fg"><label>Archivo CSV</label><input type="file" id="fidimp-archivo" accept=".csv,text/csv,text/plain"></div><div id="fidimp-prev" style="font-size:13px;font-weight:600;margin-top:8px"></div>',
        '<button class="btn bg" onclick="cerrar(\'m-fid2-import\')">Cancelar</button><button class="btn bv" id="fidimp-btn" disabled>📂 Importar</button>');
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);

    // Eventos
    $('fidcli-filtro').addEventListener('input', renderClientes);
    $('fidsum-monto').addEventListener('input', fidcSumarPrev);
    $('fidsum-ok').addEventListener('click', fidcSumarOk);
    $('fidcan-premio').addEventListener('change', fidcCanjePrev);
    $('fidcan-ok').addEventListener('click', fidcCanjeOk);
    $('fidimp-archivo').addEventListener('change', onArchivoImport);
    $('fidimp-btn').addEventListener('click', fidcImportarOk);
    $('fidpromo-p1').addEventListener('click', () => plantilla('falta'));
    $('fidpromo-p2').addEventListener('click', () => plantilla('alcanza'));
    $('fidpromo-filtro').addEventListener('change', actualizarDestinatarios);
    $('fidpromo-enviar').addEventListener('click', enviarPromo);
    $('fidcalc-margen').addEventListener('input', calcActualizar);
    $('fidcalc-dev').addEventListener('input', calcActualizar);
    $('premio-costoref').addEventListener('input', () => sugerirCostoPuntos(true));
    if (!esAdmin()) { const w = $('fidcli-import-wrap'); if (w) w.style.display = 'none'; }
    calcCargarGuardado();
  }

  // ───────────────────────── Enganches con el módulo base ─────────────────────────
  function enganchar() {
    // Pestañas: reemplaza a la versión de 2 botones
    window.fidSubTab = fidSubTabNuevo;
    window.fidSugerirCostoPuntos = sugerirCostoPuntos;
    _fidSubTab = 'clientes';

    // Config: carga/guarda el aviso por mail y refresca calculadora
    const cargarCfgOrig = window.fidCargarConfig;
    window.fidCargarConfig = async function () {
      await cargarCfgOrig.apply(this, arguments);
      const s = $('fid-avisar'); if (s) s.value = avisosActivos() ? 'si' : 'no';
      calcActualizar();
    };
    const guardarCfgOrig = window.fidGuardarConfig;
    window.fidGuardarConfig = async function () {
      await guardarCfgOrig.apply(this, arguments);
      try {
        const s = $('fid-avisar');
        if (s && _fidConfig && _fidConfig.id) {
          const quiere = s.value === 'si';
          if ((_fidConfig.avisar_mail !== false) !== quiere) {
            const r = await sbPatch('fidelizacion_config', _fidConfig.id, { avisar_mail: quiere });
            if (r && r[0]) _fidConfig = r[0]; else _fidConfig.avisar_mail = quiere;
          }
        }
      } catch (e) { console.error(e); toast('No se pudo guardar el aviso por mail', 'r'); }
      calcActualizar();
    };

    // Ventas: avisar por mail cuando la venta suma puntos o canjea premios
    const sumarVentaOrig = window.fidSumarPuntosPorVenta;
    window.fidSumarPuntosPorVenta = async function (cliId, venta) {
      const cli = (DB.clis || []).find((c) => c.id == cliId);
      const antes = cli ? (cli.puntos || 0) : 0;
      const r = await sumarVentaOrig.apply(this, arguments);
      if (cli && (cli.puntos || 0) > antes) notificarMail('suma', cli, (cli.puntos || 0) - antes);
      renderClientes();
      return r;
    };
    const canjesVentaOrig = window.fidProcesarCanjesDeVenta;
    window.fidProcesarCanjesDeVenta = async function (venta) {
      const cli = venta && venta.cliid ? (DB.clis || []).find((c) => c.id == venta.cliid) : null;
      const antes = cli ? (cli.puntos || 0) : 0;
      const nombres = ((venta && venta.items) || []).filter((it) => it.premioId).map((it) => String(it.nom || '').replace(/^🎁\s*/, '').replace(/\s*\(canje\)$/, ''));
      const r = await canjesVentaOrig.apply(this, arguments);
      if (cli && (cli.puntos || 0) < antes) notificarMail('canje', cli, antes - (cli.puntos || 0), nombres.join(', '));
      renderClientes();
      return r;
    };
    const canjeLibreOrig = window.confirmarCanjeLibre;
    window.confirmarCanjeLibre = async function () {
      const p = _fidPremios.find((x) => x.id === $('canjelibre-premio-id').value);
      const cli = (DB.clis || []).find((x) => x.id === _canjeLibreCliId);
      const antes = cli ? (cli.puntos || 0) : 0;
      const r = await canjeLibreOrig.apply(this, arguments);
      if (cli && p && (cli.puntos || 0) < antes) notificarMail('canje', cli, p.costo_puntos, p.nombre);
      renderClientes();
      return r;
    };
    const ajusteOrig = window.guardarAjustePuntos;
    window.guardarAjustePuntos = async function () { const r = await ajusteOrig.apply(this, arguments); renderClientes(); return r; };

    Object.assign(window, { fidcSumar, fidcCanje, fidcHistorial, fidcImportar });
  }

  function init() {
    if (typeof renderFidelizacion !== 'function' || !$('mod-fidelizacion')) return false;
    construir();
    enganchar();
    window.FidelizacionCompleta = { calcCostoPunto, parseCSV, mapearColumnas, fechaISO, calcularPremiosCliente, destinatarios, renderClientes, notificarMail };
    return true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
