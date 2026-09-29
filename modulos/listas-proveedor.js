/*!
 * Listas de proveedor — módulo de Mi Gestor (adaptador + pantalla).
 *
 * Depende de:
 *   - listas-proveedor-core.js        (lógica pura: parseo, matcheo, precios)
 *   - lib/read-excel-file.min.js      (solo para leer .xlsx; los CSV se leen sin librería)
 *
 * Se inyecta solo al cargar: crea la pestaña "Listas prov.", el módulo y la ventana de búsqueda.
 * Para llevarlo a otro sistema (ej. Tiendanube) solo hay que reemplazar el objeto `Adaptador`:
 * es la ÚNICA parte que toca datos de Mi Gestor o Supabase.
 */
(function () {
  'use strict';

  const Core = window.ListasProvCore;
  if (!Core) { console.error('[ListasProv] Falta cargar listas-proveedor-core.js antes que este archivo.'); return; }

  // ════════════════════════════════════════════════════════════════════════
  //  ADAPTADOR — única capa que toca Mi Gestor (DB local, sesión) y Supabase
  // ════════════════════════════════════════════════════════════════════════
  const Adaptador = {
    hayNegocio() { return typeof NEGOCIO_ID !== 'undefined' && !!NEGOCIO_ID; },
    negocioId() { return NEGOCIO_ID; },
    sucursalActivaId() { return (typeof SUCURSAL_ID !== 'undefined' && SUCURSAL_ID) || null; },
    esAdministrador() { return !!(typeof _sesion !== 'undefined' && _sesion && _sesion.rol === 'Administrador'); },
    sincronizacionPendiente() { return typeof _colaSyncPendiente !== 'undefined' && _colaSyncPendiente.length > 0; },
    online() { return navigator.onLine !== false; },

    /** Proveedores de la sucursal activa que ya existen en Supabase. */
    proveedores() {
      return DB.provs.filter(function (p) { return p._uuid; })
        .map(function (p) { return { id: p._uuid, nombre: p.nom || '(sin nombre)' }; })
        .sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
    },

    /** Artículos de la sucursal activa, en el formato que entiende el core. */
    articulos() {
      const provUuid = {};
      DB.provs.forEach(function (p) { if (p._uuid) provUuid[p.id] = p._uuid; });
      return DB.arts
        .filter(function (a) { return a._uuid && a.cod !== undefined && a.cod !== null && String(a.cod) !== ''; })
        .map(function (a) {
          return {
            codigo: String(a.cod), nombre: a.nom || '', costo: Number(a.cos) || 0,
            utils: { l1: a.u1, l2: a.u2, l3: a.u3, mayor: a.um },
            precios: { l1: Number(a.p1) || 0, l2: Number(a.p2) || 0, l3: Number(a.p3) || 0, mayor: Number(a.pm) || 0 },
            proveedorId: (a.provid !== undefined && a.provid !== null && a.provid !== '') ? (provUuid[a.provid] || null) : null
          };
        });
    },

    async sucursales() {
      const rows = await sbGet('sucursales', 'negocio_id=eq.' + NEGOCIO_ID + '&activa=eq.true&order=nombre.asc');
      return rows.map(function (s) { return { id: s.id, nombre: s.nombre }; });
    },

    async leerConfig(provId) {
      const r = await sbGet('listas_prov_config', 'negocio_id=eq.' + NEGOCIO_ID + '&proveedor_id=eq.' + provId + '&limit=1');
      return r[0] || null;
    },

    async guardarConfig(provId, mapeo, filaEncabezado) {
      const ex = await this.leerConfig(provId);
      const cuerpo = { mapeo: mapeo, fila_encabezado: filaEncabezado, updated_at: new Date().toISOString() };
      if (ex) await sbPatch('listas_prov_config', ex.id, cuerpo);
      else await sbPost('listas_prov_config', Object.assign({ negocio_id: NEGOCIO_ID, proveedor_id: provId }, cuerpo));
    },

    /** Map( código del proveedor normalizado → código del artículo ) */
    async relaciones(provId) {
      const mapa = new Map();
      let off = 0;
      while (true) {
        const rows = await sbGet('listas_prov_relaciones',
          'negocio_id=eq.' + NEGOCIO_ID + '&proveedor_id=eq.' + provId +
          '&select=codigo_proveedor,articulo_codigo&order=id.asc&limit=1000&offset=' + off);
        rows.forEach(function (r) { mapa.set(Core.normCodigo(r.codigo_proveedor), r.articulo_codigo); });
        if (rows.length < 1000) break;
        off += 1000;
      }
      return mapa;
    },

    aplicar(p) {
      return sbRpc('listas_prov_aplicar', {
        p_proveedor_id: p.proveedorId, p_archivo: p.archivo, p_sucursal_ids: p.sucursalIds,
        p_incluir_sin_sucursal: p.incluirSinSucursal, p_sucursal_activa: this.sucursalActivaId(),
        p_items: p.items, p_relaciones: p.relaciones
      });
    },

    deshacer(cargaId) {
      return sbRpc('listas_prov_deshacer', { p_carga_id: cargaId, p_sucursal_activa: this.sucursalActivaId() });
    },

    async cargas() {
      return sbGet('listas_prov_cargas', 'negocio_id=eq.' + NEGOCIO_ID + '&order=created_at.desc&limit=40');
    },

    /** Después de que la base cambió costos/precios, pone al día la copia local para que la app no los pise con datos viejos. */
    refrescarCacheLocal(filas) {
      let n = 0;
      (filas || []).forEach(function (r) {
        const num = _artUUIDtoNum[r.id];
        if (num === undefined || num === null) return;
        const a = DB.arts.find(function (x) { return x.id === num; });
        if (!a) return;
        a.cos = Number(r.costo);
        a.p1 = Number(r.precio_lista1); a.p2 = Number(r.precio_lista2);
        a.p3 = Number(r.precio_lista3); a.pm = Number(r.precio_mayor);
        n++;
      });
      if (n) saveDB();
      return n;
    },

    registrar(detalle, data) { try { regBita('lista_proveedor', detalle, data); } catch (e) { console.warn('[ListasProv] bitácora:', e); } }
  };

  // ════════════════════════════════════════════════════════════════════════
  //  Utilidades de pantalla
  // ════════════════════════════════════════════════════════════════════════
  const $ = function (id) { return document.getElementById(id); };
  const esc = function (s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  const nf2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = function (n) { return (n === null || n === undefined) ? '—' : '$' + nf2.format(n); };
  const precio = function (n) { return (typeof fmt === 'function') ? fmt(n) : money(n); }; // igual que se ve en el resto de la app
  const pctTxt = function (n) { return n === null || n === undefined ? 'nuevo' : (n > 0 ? '+' : '') + nf2.format(n) + ' %'; };
  const letra = function (i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const aviso = function (msg, tipo) { if (typeof toast === 'function') toast(esc(msg), tipo || 'a', 4500); };
  const LIMITE = 200;

  // ════════════════════════════════════════════════════════════════════════
  //  Estado
  // ════════════════════════════════════════════════════════════════════════
  function estadoInicial() {
    return {
      negocio: null, subtab: 'actualizar', montado: false,
      sucursales: null, provs: [], provId: '', configGuardada: null,
      archivo: null, hojas: null, hoja: 0, matriz: null,
      filaEnc: 0, mapeo: { codigo: null, descripcion: null, costo: null },
      ajuste: { descuentoPct: 0, ivaPct: 0 }, decimal: 'auto', umbral: 25,
      arts: [], idx: null, resultados: [], invalidas: [], vp: null, filtroVP: 'todos', limiteVP: LIMITE, limiteDud: LIMITE,
      filtroNuevos: '', paso: 1, sucModo: 'activa', sucSel: {}, aplicando: false, cargando: false, resultado: null, buscando: null
    };
  }
  let S = estadoInicial();

  // ════════════════════════════════════════════════════════════════════════
  //  Lectura de archivos
  // ════════════════════════════════════════════════════════════════════════
  async function leerArchivo(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'xls') throw new Error('Los archivos .xls (Excel viejo) no se pueden leer. Abrilo en Excel y guardalo como .xlsx o como CSV.');
    if (ext === 'xlsx') {
      if (typeof readXlsxFile !== 'function') throw new Error('Falta la librería de Excel (lib/read-excel-file.min.js). Podés guardar la lista como CSV mientras tanto.');
      const hojas = await readXlsxFile(file);
      return hojas.map(function (h) {
        return { nombre: h.sheet, matriz: h.data.map(function (fila) { return fila.map(celdaExcel); }) };
      }).filter(function (h) { return h.matriz.some(function (f) { return f.some(function (c) { return c !== null && c !== ''; }); }); });
    }
    const buf = await file.arrayBuffer();
    let texto;
    try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { texto = new TextDecoder('windows-1252').decode(buf); } // CSV típico de Excel en Argentina
    return [{ nombre: 'CSV', matriz: Core.parseCSV(texto) }];
  }

  function celdaExcel(c) {
    if (c instanceof Date) return c.toLocaleDateString('es-AR');
    if (c === undefined) return null;
    return c;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Montaje (pestaña, módulo, ventana de búsqueda)
  // ════════════════════════════════════════════════════════════════════════
  function montar() {
    if (S.montado || $('mod-listasprov')) { S.montado = true; return; }
    const nav = $('nav');
    const main = document.querySelector('main');
    if (!nav || !main) return;
    const boton = document.createElement('button');
    boton.className = 'tab';
    boton.setAttribute('data-tab', 'listasprov');
    boton.setAttribute('onclick', "irA('listasprov')");
    boton.innerHTML = '<span class="ti">📑</span>Listas prov.';
    const ref = nav.querySelector('[data-tab="precios"]');
    if (ref && ref.nextSibling) nav.insertBefore(boton, ref.nextSibling); else nav.appendChild(boton);
    // Si la sesión ya estaba iniciada, se aplican los permisos también a esta pestaña nueva.
    try { if (typeof aplicarPermisosMenues === 'function' && typeof _sesion !== 'undefined' && _sesion) aplicarPermisosMenues(); } catch (e) { /* no crítico */ }

    const mod = document.createElement('div');
    mod.id = 'mod-listasprov';
    mod.className = 'modulo';
    mod.innerHTML =
      '<div class="panel">' +
        '<div class="ptit">📑 Listas de proveedor</div>' +
        '<div class="brow">' +
          '<button class="btn bv bsm" id="lp-tab-act" onclick="ListasProvUI.subtab(\'actualizar\')">⬆️ Actualizar precios</button>' +
          '<button class="btn bg bsm" id="lp-tab-his" onclick="ListasProvUI.subtab(\'historial\')">🕘 Historial</button>' +
        '</div>' +
        '<div class="alert av" style="font-size:13px;margin-bottom:0">Subí la lista de precios de un proveedor (Excel o CSV). ' +
        'La primera vez vinculás sus productos con los tuyos; después solo subís el archivo, mirás la vista previa y confirmás.</div>' +
      '</div>' +
      '<div id="lp-actualizar">' +
        '<div class="panel" id="lp-paso1"></div>' +
        '<div class="panel" id="lp-paso2" style="display:none"></div>' +
        '<div class="panel" id="lp-paso3" style="display:none"></div>' +
        '<div class="panel" id="lp-resultado" style="display:none"></div>' +
      '</div>' +
      '<div id="lp-historial" style="display:none"><div class="panel" id="lp-his-panel"></div></div>';
    main.appendChild(mod);

    const modal = document.createElement('div');
    modal.className = 'moverlay';
    modal.id = 'm-lp-buscar';
    modal.innerHTML =
      '<div class="modal" style="max-width:580px">' +
        '<h2>🔍 Buscar artículo</h2>' +
        '<div class="alert av" id="lp-bus-ctx" style="font-size:12px"></div>' +
        '<div class="fg"><input id="lp-bus-q" type="text" placeholder="Escribí parte del nombre o el código..." oninput="ListasProvUI.buscarArt(this.value)"></div>' +
        '<div id="lp-bus-res" style="max-height:320px;overflow:auto;margin-top:10px"></div>' +
        '<div class="mfoot"><button class="btn bg" onclick="ListasProvUI.cerrarBuscar()">Cerrar</button></div>' +
      '</div>';
    document.body.appendChild(modal);
    S.montado = true;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Entrada desde la app (renderMod → renderListasProv)
  // ════════════════════════════════════════════════════════════════════════
  window.renderListasProv = async function () {
    try {
      montar();
      if (!Adaptador.hayNegocio()) {
        $('lp-paso1').innerHTML = '<div class="vacio">Iniciá sesión para usar este módulo.</div>';
        return;
      }
      if (S.negocio !== Adaptador.negocioId()) { S = estadoInicial(); S.montado = true; S.negocio = Adaptador.negocioId(); }
      S.provs = Adaptador.proveedores();
      if (S.sucursales === null) {
        try { S.sucursales = await Adaptador.sucursales(); } catch (e) { console.error('[ListasProv] sucursales:', e); S.sucursales = null; }
      }
      pintarSubtab();
      if (S.subtab === 'historial') await renderHistorial(); else renderTodo();
    } catch (e) {
      console.error('[ListasProv] error al abrir el módulo:', e);
    }
  };

  function pintarSubtab() {
    $('lp-actualizar').style.display = S.subtab === 'actualizar' ? '' : 'none';
    $('lp-historial').style.display = S.subtab === 'historial' ? '' : 'none';
    $('lp-tab-act').className = 'btn ' + (S.subtab === 'actualizar' ? 'bv' : 'bg') + ' bsm';
    $('lp-tab-his').className = 'btn ' + (S.subtab === 'historial' ? 'bv' : 'bg') + ' bsm';
  }

  function renderTodo() {
    renderPaso1();
    renderPaso2();
    renderPaso3();
    renderResultado();
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Paso 1 — proveedor, archivo y columnas
  // ════════════════════════════════════════════════════════════════════════
  function opcionesProv() {
    return '<option value="">— Elegí un proveedor —</option>' +
      S.provs.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === S.provId ? ' selected' : '') + '>' + esc(p.nombre) + '</option>'; }).join('');
  }

  function renderPaso1() {
    const box = $('lp-paso1');
    let h = '<div class="stit">1 · Proveedor y archivo</div>' +
      '<div class="fgrid" style="grid-template-columns:1fr 1fr">' +
        '<div class="fg"><label>Proveedor</label>' +
          '<select id="lp-prov" onfocus="ListasProvUI.refrescarProvs()" onchange="ListasProvUI.elegirProv(this.value)">' + opcionesProv() + '</select>' +
          '<div class="sdesc">¿No está? <a href="#" onclick="ListasProvUI.nuevoProveedor();return false" style="color:var(--verde)">Crear proveedor</a></div></div>' +
        '<div class="fg"><label>Archivo de la lista (Excel .xlsx o CSV)</label>' +
          '<input type="file" id="lp-file" accept=".xlsx,.xls,.csv,.txt" onchange="ListasProvUI.archivo(this)"' + (S.provId ? '' : ' disabled') + '>' +
          '<div class="sdesc">' + (S.provId ? 'Se recuerdan las columnas de este proveedor para la próxima vez.' : 'Elegí primero el proveedor.') + '</div></div>' +
      '</div>';

    if (S.cargando) h += '<div class="alert av">' + esc(typeof S.cargando === 'string' ? S.cargando : 'Leyendo el archivo…') + '</div>';

    if (S.matriz) {
      const ncols = Math.min(60, S.matriz.slice(S.filaEnc, S.filaEnc + 30).reduce(function (m, f) { return Math.max(m, f.length); }, 0));
      const enc = S.matriz[S.filaEnc] || [];
      const cols = [];
      for (let i = 0; i < ncols; i++) cols.push(i);
      const selCol = function (id, valor) {
        return '<select id="' + id + '" onchange="ListasProvUI.mapear(\'' + id.replace('lp-col-', '') + '\',this.value)"><option value="">— ninguna —</option>' +
          cols.map(function (i) {
            const t = enc[i] === null || enc[i] === undefined ? '' : String(enc[i]).slice(0, 36);
            return '<option value="' + i + '"' + (valor === i ? ' selected' : '') + '>' + letra(i) + (t ? ': ' + esc(t) : '') + '</option>';
          }).join('') + '</select>';
      };
      h += '<div class="divider" style="margin:14px 0"></div><div class="stit">2 · Columnas de la lista</div>';
      if (S.hojas && S.hojas.length > 1) {
        h += '<div class="fg" style="max-width:320px;margin-bottom:10px"><label>Hoja</label><select onchange="ListasProvUI.hoja(this.value)">' +
          S.hojas.map(function (x, i) { return '<option value="' + i + '"' + (i === S.hoja ? ' selected' : '') + '>' + esc(x.nombre) + '</option>'; }).join('') + '</select></div>';
      }
      h += '<div class="fgrid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">' +
        '<div class="fg"><label>Fila de encabezados</label><input type="number" min="1" value="' + (S.filaEnc + 1) + '" onchange="ListasProvUI.filaEnc(this.value)"><div class="sdesc">Número de fila donde están los títulos de las columnas.</div></div>' +
        '<div class="fg"><label>Código del proveedor</label>' + selCol('lp-col-codigo', S.mapeo.codigo) + '</div>' +
        '<div class="fg"><label>Descripción</label>' + selCol('lp-col-descripcion', S.mapeo.descripcion) + '</div>' +
        '<div class="fg"><label>Costo</label>' + selCol('lp-col-costo', S.mapeo.costo) + '</div>' +
      '</div>' +
      '<div class="fgrid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">' +
        '<div class="fg"><label>Descuento al costo (%)</label><input type="number" step="0.01" value="' + S.ajuste.descuentoPct + '" onchange="ListasProvUI.ajuste(\'descuentoPct\',this.value)"><div class="sdesc">Si el proveedor te hace un descuento fijo.</div></div>' +
        '<div class="fg"><label>IVA a sumar (%)</label><input type="number" step="0.01" value="' + S.ajuste.ivaPct + '" onchange="ListasProvUI.ajuste(\'ivaPct\',this.value)"><div class="sdesc">Si la lista viene sin IVA y tu costo lo incluye (ej. 21).</div></div>' +
        '<div class="fg"><label>Formato de números</label><select onchange="ListasProvUI.decimal(this.value)">' +
          ['auto:Automático', 'coma:1.234,56 (coma decimal)', 'punto:1,234.56 (punto decimal)'].map(function (o) { const p = o.split(':'); return '<option value="' + p[0] + '"' + (S.decimal === p[0] ? ' selected' : '') + '>' + esc(p.slice(1).join(':')) + '</option>'; }).join('') + '</select></div>' +
        '<div class="fg"><label>Avisar si el costo cambia más de (%)</label><input type="number" min="1" value="' + S.umbral + '" onchange="ListasProvUI.umbral(this.value)"></div>' +
      '</div>';

      h += '<div class="stit" style="margin-top:6px">Así se ve tu archivo</div><div class="twrap"><table><thead><tr><th>#</th>' +
        cols.map(function (i) { return '<th>' + letra(i) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        S.matriz.slice(S.filaEnc, S.filaEnc + 7).map(function (f, k) {
          return '<tr' + (k === 0 ? ' style="font-weight:700;background:var(--verde-suave)"' : '') + '><td>' + (S.filaEnc + k + 1) + '</td>' +
            cols.map(function (i) { return '<td>' + esc(f[i] === null || f[i] === undefined ? '' : String(f[i]).slice(0, 40)) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>' +
        '<div style="margin-top:14px"><button class="btn bv" onclick="ListasProvUI.analizar()"' + (S.cargando ? ' disabled' : '') + '>🔎 Analizar lista</button></div>';
    }
    box.innerHTML = h;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Paso 2 — vínculos entre la lista y tus artículos
  // ════════════════════════════════════════════════════════════════════════
  function nombreArt(codigo) {
    const it = S.idx && S.idx.porCodigo.get(Core.normCodigo(codigo));
    return it ? it.art.nombre : codigo;
  }

  function renderPaso2() {
    const box = $('lp-paso2');
    if (S.paso < 2 || !S.resultados.length) { box.style.display = 'none'; return; }
    box.style.display = '';
    const R = S.resultados;
    const vinc = R.filter(function (r) { return r.aceptado; }).length;
    const dudPend = R.filter(function (r) { return r.eraDudoso && !r.aceptado && r.estado === 'dudoso'; }).length;
    const nuevos = R.filter(function (r) { return r.estado === 'nuevo'; });
    const ignor = R.filter(function (r) { return r.estado === 'ignorado'; }).length;

    let h = '<div class="stit">3 · Revisá los vínculos</div>' +
      '<div class="brow" style="gap:10px">' +
        '<span class="alert av" style="margin:0">✔ Vinculadas: <b>' + vinc + '</b></span>' +
        '<span class="alert aa" style="margin:0">⚠️ Para confirmar: <b>' + dudPend + '</b></span>' +
        '<span class="alert" style="margin:0;background:#f3f4f6">➕ Sin coincidencia: <b>' + nuevos.length + '</b></span>' +
        (ignor ? '<span class="alert" style="margin:0;background:#f3f4f6">Ignoradas: <b>' + ignor + '</b></span>' : '') +
        (S.invalidas.length ? '<span class="alert ar" style="margin:0">Filas ilegibles: <b>' + S.invalidas.length + '</b></span>' : '') +
      '</div>' +
      '<div class="sdesc" style="font-size:12px;margin:-4px 0 12px">Lo vinculado por código, por nombre idéntico o de una carga anterior ya está listo. Acá solo revisás lo dudoso; lo que no tenés en tu sistema simplemente se ignora.</div>';

    const duds = R.map(function (r, i) { return { r: r, i: i }; }).filter(function (x) { return x.r.eraDudoso; });
    if (duds.length) {
      h += '<div class="brow"><div class="stit" style="margin:0">Para confirmar (' + duds.length + ')</div>' +
        '<button class="btn bv bsm" onclick="ListasProvUI.aceptarSugeridos()">✔ Vincular los sugeridos con 75% o más de parecido</button></div>' +
        '<div class="twrap"><table><thead><tr><th>Lista del proveedor</th><th>Costo</th><th>Tu artículo</th><th>Motivo</th><th></th></tr></thead><tbody>' +
        duds.slice(0, S.limiteDud).map(function (x) { return filaDudosa(x.r, x.i); }).join('') + '</tbody></table></div>';
      if (duds.length > S.limiteDud) h += '<div style="margin-top:8px"><button class="btn bg bsm" onclick="ListasProvUI.verMasDud()">Ver más (' + (duds.length - S.limiteDud) + ' restantes)</button></div>';
    }

    if (nuevos.length) {
      h += '<details style="margin-top:16px"' + (duds.length ? '' : ' open') + '><summary style="cursor:pointer;font-weight:600;color:var(--verde)">Sin coincidencia (' + nuevos.length + ') — productos de la lista que no encontré en tu sistema</summary>' +
        '<div class="fg" style="max-width:340px;margin:10px 0"><input type="text" placeholder="Filtrar por código o descripción..." value="' + esc(S.filtroNuevos) + '" oninput="ListasProvUI.filtrarNuevos(this.value)"></div>' +
        '<div id="lp-nuevos">' + htmlNuevos() + '</div></details>';
    }

    if (S.invalidas.length) {
      h += '<details style="margin-top:12px"><summary style="cursor:pointer;color:var(--rojo)">Filas que no pude leer (' + S.invalidas.length + ')</summary>' +
        '<div class="twrap" style="margin-top:8px"><table><thead><tr><th>Fila</th><th>Código</th><th>Descripción</th><th>Motivo</th></tr></thead><tbody>' +
        S.invalidas.slice(0, 100).map(function (x) { return '<tr><td>' + x.fila + '</td><td>' + esc(x.codigo || '') + '</td><td>' + esc(x.descripcion || '') + '</td><td>' + esc(x.motivo) + '</td></tr>'; }).join('') +
        '</tbody></table></div></details>';
    }

    h += '<div style="margin-top:16px"><button class="btn bv" onclick="ListasProvUI.vistaPrevia()">Ver vista previa de precios →</button></div>';
    box.innerHTML = h;
  }

  function filaDudosa(r, i) {
    const cands = r.candidatos || [];
    let opts = '<option value="">— no vincular —</option>' + cands.map(function (c) {
      return '<option value="' + esc(c.codigo) + '"' + (c.codigo === r.articuloCodigo ? ' selected' : '') + '>' + esc(c.codigo + ' — ' + c.nombre) + ' (' + Math.round(c.score * 100) + '%)</option>';
    }).join('');
    if (r.articuloCodigo && !cands.some(function (c) { return c.codigo === r.articuloCodigo; })) {
      opts += '<option value="' + esc(r.articuloCodigo) + '" selected>' + esc(r.articuloCodigo + ' — ' + nombreArt(r.articuloCodigo)) + '</option>';
    }
    let accion;
    if (r.aceptado) accion = '<span style="color:var(--verde);font-weight:600">✔ Vinculado</span> <button class="btn bg bsm" onclick="ListasProvUI.reabrir(' + i + ')">Cambiar</button>';
    else if (r.estado === 'ignorado') accion = '<span style="color:var(--gris)">Ignorado</span> <button class="btn bg bsm" onclick="ListasProvUI.reabrir(' + i + ')">Cambiar</button>';
    else accion = '<button class="btn bv bsm" onclick="ListasProvUI.aceptar(' + i + ')">✔ Vincular</button> <button class="btn bg bsm" onclick="ListasProvUI.ignorar(' + i + ')">Ignorar</button>';
    const bloqueado = r.aceptado || r.estado === 'ignorado';
    return '<tr><td><b>' + esc(r.codigo || '—') + '</b><br><span style="font-size:12px">' + esc(r.descripcion) + '</span></td>' +
      '<td>' + money(r.costo) + '</td>' +
      '<td><select ' + (bloqueado ? 'disabled ' : '') + 'style="max-width:300px" onchange="ListasProvUI.elegirCand(' + i + ',this.value)">' + opts + '</select> ' +
        (bloqueado ? '' : '<button class="btn bg bsm" onclick="ListasProvUI.abrirBuscar(' + i + ')">🔍 Buscar otro</button>') + '</td>' +
      '<td style="font-size:12px;color:var(--gris)">' + esc(r.motivo || (r.score ? 'Parecido: ' + Math.round(r.score * 100) + '%' : '')) + '</td>' +
      '<td style="white-space:nowrap">' + accion + '</td></tr>';
  }

  function htmlNuevos() {
    const q = Core.normalizarTexto(S.filtroNuevos);
    const todos = S.resultados.map(function (r, i) { return { r: r, i: i }; }).filter(function (x) {
      if (x.r.estado !== 'nuevo') return false;
      if (!q) return true;
      return (Core.normalizarTexto(x.r.descripcion) + ' ' + Core.normCodigo(x.r.codigo)).indexOf(q) >= 0;
    });
    let h = '<div class="twrap"><table><thead><tr><th>Código</th><th>Descripción</th><th>Costo</th><th></th></tr></thead><tbody>' +
      todos.slice(0, 100).map(function (x) {
        const c = x.r.candidatos && x.r.candidatos[0];
        const sug = (c && c.score >= 0.4) ? '<button class="btn bg bsm" title="' + esc(c.nombre) + '" onclick="ListasProvUI.vincularSug(' + x.i + ')">¿Es «' + esc(c.nombre.slice(0, 28)) + '»?</button> ' : '';
        return '<tr><td>' + esc(x.r.codigo || '—') + '</td><td>' + esc(x.r.descripcion) + '</td><td>' + money(x.r.costo) + '</td>' +
          '<td style="white-space:nowrap">' + sug + '<button class="btn bg bsm" onclick="ListasProvUI.abrirBuscar(' + x.i + ')">🔍 Vincular</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    if (todos.length > 100) h += '<div class="sdesc" style="margin-top:6px">Se muestran 100 de ' + todos.length + '. Usá el filtro para encontrar uno puntual.</div>';
    if (!todos.length) h = '<div class="sdesc">Nada para mostrar.</div>';
    return h;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Paso 3 — vista previa
  // ════════════════════════════════════════════════════════════════════════
  function sucursalesElegidas() {
    if (S.sucursales === null) return { ids: [], incluirSin: false, error: 'No pude cargar las sucursales del negocio. Salí y volvé a entrar a este módulo.' };
    const todas = S.sucursales;
    if (!todas.length) return { ids: [], incluirSin: true, error: null };            // negocio sin multi-sucursal
    const activa = Adaptador.sucursalActivaId();
    if (!Adaptador.esAdministrador() || todas.length === 1) {
      return activa ? { ids: [activa], incluirSin: false, error: null } : { ids: [], incluirSin: false, error: 'No hay una sucursal activa en esta sesión.' };
    }
    if (S.sucModo === 'todas') return { ids: todas.map(function (s) { return s.id; }), incluirSin: false, error: null };
    if (S.sucModo === 'elegir') {
      const ids = todas.filter(function (s) { return S.sucSel[s.id]; }).map(function (s) { return s.id; });
      return { ids: ids, incluirSin: false, error: ids.length ? null : 'Elegí al menos una sucursal.' };
    }
    return activa ? { ids: [activa], incluirSin: false, error: null } : { ids: [], incluirSin: false, error: 'No hay una sucursal activa en esta sesión.' };
  }

  function nombreSuc(id) {
    if (id === 'sin_sucursal') return 'Sin sucursal';
    const s = (S.sucursales || []).find(function (x) { return x.id === id; });
    return s ? s.nombre : 'Sucursal';
  }

  function renderPaso3() {
    const box = $('lp-paso3');
    if (S.paso < 3 || !S.vp) { box.style.display = 'none'; return; }
    box.style.display = '';
    const vp = S.vp, r = vp.resumen;
    const cambios = vp.items.filter(function (i) { return i.tipo !== 'igual'; });
    const sel = sucursalesElegidas();
    const pendSync = Adaptador.sincronizacionPendiente();
    const puede = cambios.length > 0 && !vp.duplicados.length && !S.aplicando;

    let h = '<div class="stit">4 · Vista previa de los cambios</div>' +
      '<div class="brow" style="gap:10px">' +
        '<span class="alert ar" style="margin:0">⬆ Suben: <b>' + r.suben + '</b></span>' +
        '<span class="alert av" style="margin:0">⬇ Bajan: <b>' + r.bajan + '</b></span>' +
        '<span class="alert" style="margin:0;background:#f3f4f6">= Sin cambios: <b>' + r.iguales + '</b></span>' +
        '<span class="alert aa" style="margin:0">⚠️ Alertas (±' + S.umbral + '%): <b>' + r.alertas + '</b></span>' +
        '<span class="alert" style="margin:0;background:#f3f4f6">No aparecen en la lista: <b>' + r.noAparecen + '</b></span>' +
      '</div>';

    if (r.dudosos) h += '<div class="alert aa">Quedan <b>' + r.dudosos + '</b> renglones sin resolver en el paso anterior. Esos no se van a actualizar.</div>';
    if (vp.duplicados.length) {
      h += '<div class="alert ar">Hay artículos que quedaron vinculados a más de un renglón de la lista: <b>' +
        vp.duplicados.slice(0, 6).map(function (c) { return esc(c + ' — ' + nombreArt(c)); }).join(', ') +
        '</b>. Volvé al paso anterior y dejá uno solo por artículo.</div>';
    }

    const filtros = [['todos', 'Todos'], ['sube', 'Suben'], ['baja', 'Bajan'], ['alerta', 'Alertas'], ['igual', 'Sin cambios']];
    h += '<div class="brow">' + filtros.map(function (f) {
      return '<button class="btn ' + (S.filtroVP === f[0] ? 'bv' : 'bg') + ' bsm" onclick="ListasProvUI.filtrarVP(\'' + f[0] + '\')">' + f[1] + '</button>';
    }).join('') + '</div>';

    const filtrados = vp.items.filter(function (i) {
      if (S.filtroVP === 'sube') return i.tipo === 'sube';
      if (S.filtroVP === 'baja') return i.tipo === 'baja';
      if (S.filtroVP === 'alerta') return i.alerta;
      if (S.filtroVP === 'igual') return i.tipo === 'igual';
      return true;
    });
    h += '<div class="twrap"><table><thead><tr><th>Artículo</th><th>Costo actual</th><th>Costo nuevo</th><th>Cambio</th><th>Precio lista 1</th></tr></thead><tbody>' +
      filtrados.slice(0, S.limiteVP).map(function (i) {
        const color = i.tipo === 'sube' ? 'var(--rojo)' : (i.tipo === 'baja' ? 'var(--verde)' : 'var(--gris)');
        return '<tr' + (i.alerta ? ' style="background:#fff8e1"' : '') + '><td><b>' + esc(i.articuloNombre) + '</b><br><span style="font-size:11px;color:var(--gris)">Cód. ' + esc(i.articuloCodigo) + ' · lista: ' + esc(i.codigoProveedor || i.descripcionProveedor || '') + '</span></td>' +
          '<td>' + money(i.costoAnterior) + '</td><td><b>' + money(i.costoNuevo) + '</b></td>' +
          '<td style="color:' + color + ';font-weight:600">' + (i.alerta ? '⚠️ ' : '') + pctTxt(i.diffPct) + '</td>' +
          '<td>' + precio(i.preciosAnteriores.l1) + ' → <b>' + precio(i.preciosNuevos.l1) + '</b></td></tr>';
      }).join('') + '</tbody></table></div>';
    if (filtrados.length > S.limiteVP) h += '<div style="margin-top:8px"><button class="btn bg bsm" onclick="ListasProvUI.verMasVP()">Ver más (' + (filtrados.length - S.limiteVP) + ' restantes)</button></div>';
    if (!filtrados.length) h += '<div class="vacio">No hay artículos en este filtro.</div>';

    if (vp.noAparecen.length) {
      h += '<details style="margin-top:14px"><summary style="cursor:pointer;color:var(--gris)">Artículos de este proveedor que no vinieron en la lista (' + vp.noAparecen.length + ') — no se tocan</summary>' +
        '<div class="twrap" style="margin-top:8px"><table><thead><tr><th>Cód.</th><th>Artículo</th><th>Costo</th></tr></thead><tbody>' +
        vp.noAparecen.slice(0, 100).map(function (a) { return '<tr><td>' + esc(a.articuloCodigo) + '</td><td>' + esc(a.articuloNombre) + '</td><td>' + money(a.costo) + '</td></tr>'; }).join('') +
        '</tbody></table></div></details>';
    }

    // Sucursales
    if ((S.sucursales || []).length > 1 && Adaptador.esAdministrador()) {
      const act = nombreSuc(Adaptador.sucursalActivaId());
      h += '<div class="divider" style="margin:16px 0"></div><div class="stit">¿A qué sucursales aplicar los precios nuevos?</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;font-size:14px">' +
          '<label><input type="radio" name="lp-suc" ' + (S.sucModo === 'activa' ? 'checked' : '') + ' onchange="ListasProvUI.sucModo(\'activa\')"> Solo esta sucursal (' + esc(act) + ')</label>' +
          '<label><input type="radio" name="lp-suc" ' + (S.sucModo === 'todas' ? 'checked' : '') + ' onchange="ListasProvUI.sucModo(\'todas\')"> Todas las sucursales (' + S.sucursales.length + ')</label>' +
          '<label><input type="radio" name="lp-suc" ' + (S.sucModo === 'elegir' ? 'checked' : '') + ' onchange="ListasProvUI.sucModo(\'elegir\')"> Elegir cuáles</label>' +
        '</div>';
      if (S.sucModo === 'elegir') {
        h += '<div style="display:flex;gap:14px;flex-wrap:wrap;margin:8px 0 0 22px">' + S.sucursales.map(function (s) {
          return '<label style="font-size:14px"><input type="checkbox" ' + (S.sucSel[s.id] ? 'checked' : '') + ' onchange="ListasProvUI.sucToggle(\'' + esc(s.id) + '\',this.checked)"> ' + esc(s.nombre) + '</label>';
        }).join('') + '</div>';
      }
      h += '<div class="sdesc" style="font-size:12px;margin-top:8px">La vista previa muestra los valores de esta sucursal. En las otras se aplica el mismo costo nuevo, recalculando cada precio con el margen que tenga allá cada artículo. Los productos que no existan en una sucursal se saltean.</div>';
    }

    if (sel.error) h += '<div class="alert ar" style="margin-top:12px">' + esc(sel.error) + '</div>';
    if (pendSync) h += '<div class="alert aa" style="margin-top:12px">Hay cambios tuyos que todavía no se sincronizaron con el servidor. Esperá a que se sincronicen (o volvé a tener conexión) antes de aplicar la lista.</div>';
    if (!Adaptador.online()) h += '<div class="alert aa" style="margin-top:12px">Sin conexión: para actualizar precios necesitás internet.</div>';

    h += '<div style="margin-top:16px"><button class="btn bv" style="padding:11px 22px;font-size:14px" ' + (puede ? '' : 'disabled ') + 'onclick="ListasProvUI.aplicar()">' +
      (S.aplicando ? 'Aplicando…' : '✅ Confirmar y actualizar ' + cambios.length + ' artículo' + (cambios.length === 1 ? '' : 's')) + '</button>' +
      (cambios.length === 0 ? ' <span class="sdesc">No hay cambios de costo para aplicar.</span>' : '') + '</div>';
    box.innerHTML = h;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Resultado y historial
  // ════════════════════════════════════════════════════════════════════════
  function textoPorSucursal(porSuc) {
    const partes = Object.keys(porSuc || {}).map(function (k) { return esc(nombreSuc(k)) + ': <b>' + porSuc[k] + '</b>'; });
    return partes.length ? partes.join(' · ') : '';
  }

  function renderResultado() {
    const box = $('lp-resultado');
    if (!S.resultado) { box.style.display = 'none'; return; }
    box.style.display = '';
    const x = S.resultado;
    box.innerHTML = '<div class="ptit" style="font-size:18px">✅ Lista aplicada</div>' +
      '<p style="font-size:14px;margin-bottom:6px">Se actualizaron <b>' + x.actualizados + '</b> artículos.</p>' +
      (textoPorSucursal(x.por_sucursal) ? '<p style="font-size:13px;color:var(--gris);margin-bottom:12px">' + textoPorSucursal(x.por_sucursal) + '</p>' : '') +
      '<div class="brow">' +
        (x.deshecha ? '<span class="alert av" style="margin:0">Esta carga fue deshecha.</span>' :
          '<button class="btn br" onclick="ListasProvUI.deshacer(\'' + esc(x.carga_id) + '\',true)">↩ Deshacer esta carga</button>') +
        '<button class="btn bg" onclick="ListasProvUI.nueva()">Cargar otra lista</button>' +
      '</div>';
  }

  async function renderHistorial() {
    const box = $('lp-his-panel');
    box.innerHTML = '<div class="vacio">Cargando…</div>';
    try {
      const filas = await Adaptador.cargas();
      if (!filas.length) { box.innerHTML = '<div class="vacio">Todavía no aplicaste ninguna lista.</div>'; return; }
      box.innerHTML = '<div class="twrap"><table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Archivo</th><th>Actualizados</th><th>Estado</th><th></th></tr></thead><tbody>' +
        filas.map(function (c) {
          const r = c.resumen || {};
          const fecha = new Date(c.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
          const estado = c.estado === 'aplicada' ? '<span style="color:var(--verde);font-weight:600">Aplicada</span>' : (c.estado === 'deshecha' ? '<span style="color:var(--gris)">Deshecha</span>' : esc(c.estado));
          const suc = textoPorSucursal(r.por_sucursal);
          return '<tr><td>' + esc(fecha) + '</td><td>' + esc(r.proveedor || '—') + '</td><td>' + esc(c.archivo_nombre || '') + '</td>' +
            '<td>' + (r.actualizados !== undefined ? '<b>' + r.actualizados + '</b>' : '—') + (suc ? '<br><span style="font-size:11px;color:var(--gris)">' + suc + '</span>' : '') + '</td>' +
            '<td>' + estado + '</td><td>' + (c.estado === 'aplicada' ? '<button class="btn br bsm" onclick="ListasProvUI.deshacer(\'' + esc(c.id) + '\',false)">↩ Deshacer</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    } catch (e) {
      console.error('[ListasProv] historial:', e);
      box.innerHTML = '<div class="alert ar">No se pudo cargar el historial.</div>';
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Acciones (llamadas desde la pantalla)
  // ════════════════════════════════════════════════════════════════════════
  function recalcularVP() {
    S.vp = Core.armarVistaPrevia(S.resultados, S.idx, { ajuste: S.ajuste, umbralAlertaPct: S.umbral, proveedorId: S.provId });
  }

  function refrescarPasos() { renderPaso2(); if (S.paso >= 3) { recalcularVP(); renderPaso3(); } }

  function sugerirParaHoja() {
    // Prioridad: lo guardado para este proveedor (por nombre de encabezado, o por posición) → si no, detección automática.
    const m = S.matriz || [];
    const cfg = S.configGuardada && S.configGuardada.mapeo;
    let fila = Core.detectarFilaEncabezado(m);
    if (cfg && S.configGuardada.fila_encabezado) {
      const guardada = S.configGuardada.fila_encabezado - 1;
      if (guardada >= 0 && guardada < m.length) fila = guardada;
    }
    S.filaEnc = fila;
    const enc = m[fila] || [];
    const sug = Core.sugerirMapeo(enc);
    const porNombre = function (campo) {
      const g = cfg && cfg[campo];
      if (!g) return null;
      const n = Core.normalizarTexto(g.n || '');
      if (n) { for (let i = 0; i < enc.length; i++) if (Core.normalizarTexto(enc[i]) === n) return i; }
      return (typeof g.i === 'number' && g.i < enc.length) ? g.i : null;
    };
    ['codigo', 'descripcion', 'costo'].forEach(function (c) {
      const v = porNombre(c);
      S.mapeo[c] = v !== null ? v : sug[c];
    });
    if (cfg) {
      if (cfg.ajuste) S.ajuste = { descuentoPct: Number(cfg.ajuste.descuentoPct) || 0, ivaPct: Number(cfg.ajuste.ivaPct) || 0 };
      if (cfg.decimal) S.decimal = cfg.decimal;
      if (cfg.umbralAlertaPct) S.umbral = Number(cfg.umbralAlertaPct) || 25;
    }
  }

  function reiniciarAnalisis() { S.paso = 1; S.resultados = []; S.vp = null; S.invalidas = []; S.resultado = null; S.limiteVP = LIMITE; S.limiteDud = LIMITE; S.filtroVP = 'todos'; }

  const UI = {
    subtab(t) { S.subtab = t; pintarSubtab(); if (t === 'historial') renderHistorial(); else renderTodo(); },

    refrescarProvs() {
      const nuevos = Adaptador.proveedores();
      if (nuevos.length === S.provs.length) return;
      S.provs = nuevos;
      const sel = $('lp-prov');
      if (sel) sel.innerHTML = opcionesProv();
    },

    nuevoProveedor() { if (typeof abrirProv === 'function') abrirProv(); else if (typeof irA === 'function') irA('proveedores'); },

    async elegirProv(id) {
      S.provId = id;
      S.configGuardada = null; S.matriz = null; S.hojas = null; S.archivo = null;
      reiniciarAnalisis();
      if (id) {
        try { S.configGuardada = await Adaptador.leerConfig(id); } catch (e) { console.warn('[ListasProv] config:', e); }
      }
      renderTodo();
    },

    async archivo(input) {
      const f = input.files && input.files[0];
      if (!f) return;
      reiniciarAnalisis();
      S.archivo = f.name; S.cargando = 'Leyendo el archivo…'; S.matriz = null; renderTodo();
      try {
        const hojas = await leerArchivo(f);
        if (!hojas.length || !hojas[0].matriz.length) throw new Error('El archivo está vacío.');
        S.hojas = hojas; S.hoja = 0; S.matriz = hojas[0].matriz;
        sugerirParaHoja();
      } catch (e) {
        console.error('[ListasProv] leer archivo:', e);
        S.matriz = null; S.hojas = null; S.archivo = null;
        aviso(e && e.message ? e.message : 'No se pudo leer el archivo.', 'r');
      }
      S.cargando = false; renderTodo();
    },

    hoja(i) { S.hoja = parseInt(i, 10) || 0; S.matriz = S.hojas[S.hoja].matriz; reiniciarAnalisis(); sugerirParaHoja(); renderTodo(); },
    filaEnc(v) { const n = Math.max(1, parseInt(v, 10) || 1); S.filaEnc = Math.min(n - 1, Math.max(0, S.matriz.length - 1)); const sug = Core.sugerirMapeo(S.matriz[S.filaEnc] || []); S.mapeo = { codigo: sug.codigo, descripcion: sug.descripcion, costo: sug.costo }; reiniciarAnalisis(); renderTodo(); },
    mapear(campo, v) { S.mapeo[campo] = v === '' ? null : parseInt(v, 10); reiniciarAnalisis(); renderPaso2(); renderPaso3(); renderResultado(); },
    ajuste(campo, v) { S.ajuste[campo] = Number(v) || 0; if (S.paso >= 3) { recalcularVP(); renderPaso3(); } },
    decimal(v) { S.decimal = v; reiniciarAnalisis(); renderTodo(); },
    umbral(v) { S.umbral = Math.max(1, Number(v) || 25); if (S.paso >= 3) { recalcularVP(); renderPaso3(); } },

    async analizar() {
      if (!S.provId) return aviso('Elegí el proveedor.');
      const m = S.mapeo;
      if (m.costo === null) return aviso('Elegí la columna del costo.');
      if (m.codigo === null && m.descripcion === null) return aviso('Elegí al menos la columna del código o la de la descripción.');
      S.cargando = 'Analizando la lista…'; renderPaso1();
      await new Promise(function (r) { setTimeout(r, 30); });
      try {
        const ex = Core.extraerFilas(S.matriz, { codigo: m.codigo, descripcion: m.descripcion, costo: m.costo }, S.filaEnc, { decimal: S.decimal });
        if (!ex.filas.length) { S.cargando = false; renderPaso1(); return aviso('No encontré renglones con costo válido. Revisá las columnas y el formato de números.'); }
        S.invalidas = ex.invalidas;
        S.arts = Adaptador.articulos();
        S.idx = Core.indexarArticulos(S.arts);
        const rel = await Adaptador.relaciones(S.provId);
        S.resultados = Core.matchear(ex.filas, S.idx, rel);
        S.resultados.forEach(function (r) { r.eraDudoso = r.estado === 'dudoso'; });
        S.paso = 2; S.vp = null; S.resultado = null; S.limiteDud = LIMITE;
        // Se recuerdan las columnas para la próxima lista de este proveedor (no es crítico si falla)
        const enc = S.matriz[S.filaEnc] || [];
        const guardar = function (i) { return i === null ? null : { i: i, n: enc[i] === null || enc[i] === undefined ? '' : String(enc[i]) }; };
        try {
          const cfgNueva = {
            codigo: guardar(m.codigo), descripcion: guardar(m.descripcion), costo: guardar(m.costo),
            ajuste: { descuentoPct: S.ajuste.descuentoPct, ivaPct: S.ajuste.ivaPct }, decimal: S.decimal, umbralAlertaPct: S.umbral
          };
          await Adaptador.guardarConfig(S.provId, cfgNueva, S.filaEnc + 1);
          S.configGuardada = { mapeo: cfgNueva, fila_encabezado: S.filaEnc + 1 };
        } catch (e) { console.warn('[ListasProv] no se pudo guardar la configuración:', e); }
      } catch (e) {
        console.error('[ListasProv] analizar:', e);
        aviso('No se pudo analizar la lista. Probá de nuevo.', 'r');
      }
      S.cargando = false; renderTodo();
      const p2 = $('lp-paso2'); if (p2 && p2.scrollIntoView) p2.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    // ── paso 2
    elegirCand(i, codigo) { const r = S.resultados[i]; r.articuloCodigo = codigo || null; },
    aceptar(i) {
      const r = S.resultados[i];
      if (!r.articuloCodigo) return aviso('Elegí un artículo o usá "Ignorar".');
      r.aceptado = true; r.estado = 'confirmado'; refrescarPasos();
    },
    ignorar(i) { const r = S.resultados[i]; r.aceptado = false; r.estado = 'ignorado'; refrescarPasos(); },
    reabrir(i) { const r = S.resultados[i]; r.aceptado = false; r.estado = 'dudoso'; refrescarPasos(); },
    aceptarSugeridos() {
      let n = 0;
      S.resultados.forEach(function (r) {
        if (r.eraDudoso && r.estado === 'dudoso' && !r.aceptado && r.articuloCodigo && !r.motivo && r.score >= 0.75) { r.aceptado = true; r.estado = 'confirmado'; n++; }
      });
      aviso(n ? n + ' renglones vinculados.' : 'No había sugeridos con 75% o más para vincular de una.', n ? 'v' : 'a');
      refrescarPasos();
    },
    vincular(i, codigo) { const r = S.resultados[i]; r.articuloCodigo = codigo; r.aceptado = true; r.estado = 'manual'; S.buscando = null; refrescarPasos(); },
    verMasDud() { S.limiteDud += LIMITE; renderPaso2(); },
    filtrarNuevos(v) { S.filtroNuevos = v; const el = $('lp-nuevos'); if (el) el.innerHTML = htmlNuevos(); },

    // ── búsqueda manual
    abrirBuscar(i) {
      S.buscando = i;
      const r = S.resultados[i];
      $('lp-bus-ctx').innerHTML = 'Lista del proveedor: <b>' + esc(r.codigo || '—') + '</b> · ' + esc(r.descripcion);
      $('lp-bus-q').value = '';
      $('lp-bus-res').innerHTML = '<div class="sdesc">Escribí para buscar.</div>';
      $('m-lp-buscar').classList.add('open');
      setTimeout(function () { $('lp-bus-q').focus(); }, 50);
      UI.buscarArt('');
    },
    cerrarBuscar() { $('m-lp-buscar').classList.remove('open'); S.buscando = null; },
    buscarArt(q) {
      const toks = Core.normalizarTexto(q).split(' ').filter(Boolean);
      const box = $('lp-bus-res');
      const r = S.resultados[S.buscando];
      if (!toks.length) {
        // Sin texto: mostrar los más parecidos a la descripción de la lista
        const cands = r ? Core.candidatosPorNombre(r.descripcion, S.idx, 8) : [];
        S.busRes = cands;
        box.innerHTML = cands.length ? '<div class="sdesc" style="margin-bottom:6px">Los más parecidos:</div>' + cands.map(filaBusqueda).join('') : '<div class="sdesc">Escribí para buscar.</div>';
        return;
      }
      const hallados = [];
      for (let k = 0; k < S.idx.items.length && hallados.length < 30; k++) {
        const it = S.idx.items[k];
        const pajar = Core.normalizarTexto(it.art.nombre) + ' ' + it.nCodigo;
        if (toks.every(function (t) { return pajar.indexOf(t) >= 0; })) hallados.push({ codigo: it.codigo, nombre: it.art.nombre, score: 0 });
      }
      S.busRes = hallados;
      box.innerHTML = hallados.length ? hallados.map(filaBusqueda).join('') : '<div class="sdesc">Sin resultados.</div>';
    },

    // ── paso 3
    vistaPrevia() {
      if (!S.resultados.length) return;
      S.paso = 3; S.filtroVP = 'todos'; S.limiteVP = LIMITE;
      recalcularVP(); renderPaso3();
      const p3 = $('lp-paso3'); if (p3 && p3.scrollIntoView) p3.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    filtrarVP(f) { S.filtroVP = f; S.limiteVP = LIMITE; renderPaso3(); },
    verMasVP() { S.limiteVP += LIMITE; renderPaso3(); },
    sucModo(m) { S.sucModo = m; renderPaso3(); },
    sucToggle(id, on) { S.sucSel[id] = !!on; renderPaso3(); },

    async aplicar() {
      if (S.aplicando || !S.vp) return;
      recalcularVP();
      const vp = S.vp;
      const cambios = vp.items.filter(function (i) { return i.tipo !== 'igual'; });
      const sel = sucursalesElegidas();
      if (!cambios.length) return aviso('No hay cambios de costo para aplicar.');
      if (vp.duplicados.length) return aviso('Hay artículos vinculados a más de un renglón. Revisalo en el paso anterior.');
      if (sel.error) return aviso(sel.error);
      if (Adaptador.sincronizacionPendiente()) return aviso('Hay cambios sin sincronizar. Esperá a que se sincronicen antes de aplicar la lista.');
      if (!Adaptador.online()) return aviso('Sin conexión a internet.');
      const prov = S.provs.find(function (p) { return p.id === S.provId; });
      const donde = sel.ids.length > 1 ? ' en ' + sel.ids.length + ' sucursales' : '';
      const ok = await confirmar('¿Actualizar ' + cambios.length + ' artículos con la lista de ' + (prov ? prov.nombre : 'el proveedor') + donde + '? Vas a poder deshacerlo desde el Historial.');
      if (!ok) return;
      S.aplicando = true; renderPaso3();
      try {
        const res = await Adaptador.aplicar({
          proveedorId: S.provId, archivo: S.archivo || null,
          sucursalIds: sel.ids, incluirSinSucursal: sel.incluirSin,
          items: cambios.map(function (i) { return { codigo: i.articuloCodigo, costo: i.costoNuevo }; }),
          relaciones: Core.relacionesParaGuardar(S.resultados)
        });
        Adaptador.refrescarCacheLocal(res && res.articulos);
        Adaptador.registrar('Lista de proveedor aplicada: ' + (prov ? prov.nombre : '') + ' — ' + res.actualizados + ' artículos', { carga: res.carga_id });
        S.resultado = { carga_id: res.carga_id, actualizados: res.actualizados, por_sucursal: res.por_sucursal, deshecha: false };
        S.paso = 1; S.resultados = []; S.vp = null; S.matriz = null; S.hojas = null; S.archivo = null;
        if (typeof toast === 'function') toast('Lista aplicada: ' + res.actualizados + ' artículos actualizados', 'v', 5000);
      } catch (e) {
        console.error('[ListasProv] aplicar:', e);
        aviso('No se pudo aplicar la lista. No se cambió nada. ' + (e && e.message && e.message.length < 140 ? e.message : ''), 'r');
      }
      S.aplicando = false; renderTodo();
      const rr = $('lp-resultado'); if (rr && rr.scrollIntoView) rr.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    async deshacer(cargaId, desdeResultado) {
      if (!Adaptador.online()) return aviso('Sin conexión a internet.');
      if (Adaptador.sincronizacionPendiente()) return aviso('Hay cambios sin sincronizar. Esperá a que se sincronicen antes de deshacer.');
      const ok = await confirmar('¿Deshacer esta carga? Los artículos vuelven al costo y precios de antes (salvo los que cambiaste a mano después).');
      if (!ok) return;
      try {
        const res = await Adaptador.deshacer(cargaId);
        Adaptador.refrescarCacheLocal(res && res.articulos);
        Adaptador.registrar('Lista de proveedor deshecha: ' + res.deshechos + ' artículos restaurados', { carga: cargaId });
        aviso(res.deshechos + ' artículos restaurados' + (res.omitidos ? '. ' + res.omitidos + ' no se tocaron porque su costo cambió después.' : '.'), 'v');
        if (S.resultado && S.resultado.carga_id === cargaId) S.resultado.deshecha = true;
        if (desdeResultado) renderResultado(); else await renderHistorial();
      } catch (e) {
        console.error('[ListasProv] deshacer:', e);
        aviso('No se pudo deshacer: ' + (e && e.message && e.message.length < 140 ? e.message : 'error inesperado'), 'r');
      }
    },

    nueva() { S.resultado = null; S.paso = 1; S.matriz = null; S.hojas = null; S.archivo = null; renderTodo(); }
  };

  function filaBusqueda(c, k) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid #eee">' +
      '<div style="font-size:13px"><b>' + esc(c.codigo) + '</b> — ' + esc(c.nombre) + (c.score ? ' <span style="color:var(--gris)">(' + Math.round(c.score * 100) + '%)</span>' : '') + '</div>' +
      '<button class="btn bv bsm" onclick="ListasProvUI.vincularBuscado(' + k + ')">Vincular</button></div>';
  }
  UI.vincularBuscado = function (k) {
    const i = S.buscando, c = S.busRes && S.busRes[k];
    if (i === null || !c) return;
    $('m-lp-buscar').classList.remove('open');
    UI.vincular(i, c.codigo);
  };
  UI.vincularSug = function (i) {
    const c = S.resultados[i] && S.resultados[i].candidatos && S.resultados[i].candidatos[0];
    if (c) UI.vincular(i, c.codigo);
  };

  window.ListasProvUI = UI;
  window.ListasProvAdaptador = Adaptador; // expuesto para pruebas

  // La pestaña y el módulo se crean apenas el HTML de la página está listo.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();
