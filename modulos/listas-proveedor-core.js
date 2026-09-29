/*!
 * Listas de proveedor — LÓGICA PURA (sin DOM, sin Supabase, sin variables globales de Mi Gestor).
 *
 * Todo lo que hay acá trabaja solo con datos que recibe por parámetro y devuelve resultados.
 * Por eso se puede probar con Node y, más adelante, llevar tal cual a otro producto
 * (por ejemplo uno conectado a Tiendanube).
 *
 * Forma de los datos que usa este archivo (los adaptadores de cada sistema los arman):
 *   artículo  → { codigo, nombre, costo, utils:{l1,l2,l3,mayor}, precios?:{l1,l2,l3,mayor}, proveedorId? }
 *               (precios = los que están guardados hoy; si no vienen, se calculan desde costo y utils)
 *   fila      → { fila, codigo, descripcion, costo }      (fila de la lista del proveedor)
 *   relación  → Map( codigoProveedor(normalizado) → codigoArtículo )
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ListasProvCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ───────────────────────── Números ─────────────────────────

  /**
   * Convierte texto de una planilla en número. Entiende formato argentino y anglosajón.
   * decimal: 'auto' (por defecto) | 'coma' | 'punto'
   * Reglas en modo auto:
   *   "1.234,56" → 1234.56     "1,234.56" → 1234.56     "12,5" → 12.5
   *   "1.234"    → 1234  (un solo punto seguido de 3 dígitos se toma como separador de miles)
   *   "0.125"    → 0.125 ; "12.5" → 12.5 ; "1.234.567" → 1234567
   * Devuelve null si no hay un número.
   */
  function parseNumero(v, decimal) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).trim();
    if (!s) return null;
    s = s.replace(/[^\d.,\-]/g, '');
    if (!/\d/.test(s)) return null;
    const neg = s.charAt(0) === '-';
    s = s.replace(/-/g, '');
    const hayPunto = s.indexOf('.') >= 0;
    const hayComa = s.indexOf(',') >= 0;
    let dec = null; // separador decimal detectado: '.' | ',' | null (solo miles)
    if (decimal === 'coma') dec = ',';
    else if (decimal === 'punto') dec = '.';
    else if (hayPunto && hayComa) dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    else if (hayComa) dec = s.split(',').length > 2 ? null : ',';
    else if (hayPunto) {
      const p = s.split('.');
      if (p.length > 2) dec = null;
      else dec = (p[1].length === 3 && p[0].length >= 1 && p[0].length <= 3 && p[0] !== '0') ? null : '.';
    }
    if (dec === ',') s = s.replace(/\./g, '').replace(',', '.');
    else if (dec === '.') s = s.replace(/,/g, '');
    else s = s.replace(/[.,]/g, '');
    const n = parseFloat(s);
    if (isNaN(n)) return null;
    return neg ? -n : n;
  }

  function redondear(n, dec) {
    const f = Math.pow(10, dec);
    return Math.round((n + Number.EPSILON) * f) / f;
  }

  // ───────────────────────── CSV ─────────────────────────

  function detectarSeparador(texto) {
    const cands = [';', ',', '\t'];
    const lineas = [];
    let cur = '', q = false;
    for (let i = 0; i < texto.length && lineas.length < 5; i++) {
      const c = texto[i];
      if (c === '"') q = !q;
      if ((c === '\n' || c === '\r') && !q) { if (cur.trim()) lineas.push(cur); cur = ''; }
      else cur += c;
    }
    if (cur.trim() && lineas.length < 5) lineas.push(cur);
    let mejor = ';', mejorN = -1;
    cands.forEach(function (sep) {
      let total = 0;
      lineas.forEach(function (l) {
        let qq = false;
        for (let i = 0; i < l.length; i++) {
          if (l[i] === '"') qq = !qq;
          else if (l[i] === sep && !qq) total++;
        }
      });
      if (total > mejorN) { mejorN = total; mejor = sep; }
    });
    return mejor;
  }

  /** Lee un CSV completo (comillas, saltos de línea dentro de comillas, BOM, ; , o tab). */
  function parseCSV(texto, sep) {
    texto = String(texto == null ? '' : texto).replace(/^﻿/, '');
    if (!sep) sep = detectarSeparador(texto);
    const filas = [];
    let fila = [], cur = '', q = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (q) {
        if (c === '"') {
          if (texto[i + 1] === '"') { cur += '"'; i++; } else q = false;
        } else cur += c;
      } else if (c === '"' && cur.trim() === '') {
        q = true; cur = '';
      } else if (c === sep) {
        fila.push(cur); cur = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && texto[i + 1] === '\n') i++;
        fila.push(cur); cur = ''; filas.push(fila); fila = [];
      } else cur += c;
    }
    if (cur !== '' || fila.length) { fila.push(cur); filas.push(fila); }
    return filas.filter(function (f) { return f.some(function (x) { return String(x).trim() !== ''; }); });
  }

  // ───────────────────────── Encabezados y mapeo ─────────────────────────

  const CLAVES = {
    codigo: ['codigo', 'cod', 'cod.', 'sku', 'art', 'articulo', 'nro', 'ref', 'referencia', 'item', 'id'],
    descripcion: ['descripcion', 'detalle', 'producto', 'nombre', 'articulo', 'denominacion', 'concepto', 'desc'],
    costo: ['costo', 'precio', 'precio lista', 'lista', 'p lista', 'p. lista', 'importe', 'neto', 'precio neto',
      'precio unitario', 'p unit', 'unitario', 'valor', 'pvp', 'mayorista']
  };

  function sinAcentos(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  function puntajeEncabezado(celda, campo) {
    const t = sinAcentos(celda).replace(/[^a-z0-9. ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return 0;
    let mejor = 0;
    CLAVES[campo].forEach(function (k) {
      if (t === k) mejor = Math.max(mejor, 3);
      else if (t.split(' ').indexOf(k) >= 0) mejor = Math.max(mejor, 2);
      else if (t.indexOf(k) >= 0) mejor = Math.max(mejor, 1);
    });
    return mejor;
  }

  /** Busca en las primeras filas la que parece ser el encabezado. Devuelve índice (0 = primera fila). */
  function detectarFilaEncabezado(matriz, maxFilas) {
    maxFilas = Math.min(maxFilas || 20, matriz.length);
    let mejorIdx = 0, mejorPts = -1;
    for (let i = 0; i < maxFilas; i++) {
      const fila = matriz[i] || [];
      let pts = 0;
      const usados = new Set();
      ['codigo', 'descripcion', 'costo'].forEach(function (campo) {
        let mp = 0, mj = -1;
        fila.forEach(function (c, j) {
          if (usados.has(j)) return;
          const p = puntajeEncabezado(c, campo);
          if (p > mp) { mp = p; mj = j; }
        });
        if (mj >= 0) { usados.add(mj); pts += mp; }
      });
      if (pts > mejorPts) { mejorPts = pts; mejorIdx = i; }
    }
    return mejorIdx;
  }

  /** Propone qué columna es código, descripción y costo. Devuelve índices (o null). */
  function sugerirMapeo(encabezados) {
    const res = { codigo: null, descripcion: null, costo: null };
    const usados = new Set();
    ['costo', 'codigo', 'descripcion'].forEach(function (campo) {
      let mp = 0, mj = null;
      (encabezados || []).forEach(function (c, j) {
        if (usados.has(j)) return;
        const p = puntajeEncabezado(c, campo);
        if (p > mp) { mp = p; mj = j; }
      });
      if (mj !== null) { res[campo] = mj; usados.add(mj); }
    });
    return res;
  }

  /**
   * Convierte la matriz de la planilla en filas de lista.
   * mapeo: { codigo, descripcion, costo } (índices de columna; codigo o descripcion pueden ser null,
   * pero al menos uno de los dos y costo son obligatorios).
   * Devuelve { filas:[...], invalidas:[{fila, motivo}] }
   */
  function extraerFilas(matriz, mapeo, indiceEncabezado, opts) {
    opts = opts || {};
    const filas = [], invalidas = [];
    const dec = opts.decimal || 'auto';
    for (let i = (indiceEncabezado == null ? 0 : indiceEncabezado + 1); i < matriz.length; i++) {
      const r = matriz[i] || [];
      const celda = function (idx) { return idx == null ? '' : r[idx]; };
      const codigo = celdaATexto(celda(mapeo.codigo));
      const descripcion = celdaATexto(celda(mapeo.descripcion));
      const crudo = celda(mapeo.costo);
      if (!codigo && !descripcion && (crudo === '' || crudo == null)) continue; // renglón vacío
      const costo = parseNumero(crudo, dec);
      if (!codigo && !descripcion) { invalidas.push({ fila: i + 1, motivo: 'Sin código ni descripción' }); continue; }
      if (costo === null) { invalidas.push({ fila: i + 1, codigo, descripcion, motivo: 'Costo vacío o ilegible' }); continue; }
      if (costo <= 0) { invalidas.push({ fila: i + 1, codigo, descripcion, motivo: 'Costo en cero o negativo' }); continue; }
      filas.push({ fila: i + 1, codigo, descripcion, costo });
    }
    return { filas, invalidas };
  }

  function celdaATexto(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
    return String(v).trim();
  }

  // ───────────────────────── Ajuste de costo (IVA / descuento) ─────────────────────────

  /** ajuste: { descuentoPct?, ivaPct? }. Primero se descuenta y después se suma el IVA. */
  function ajustarCosto(costo, ajuste) {
    ajuste = ajuste || {};
    const d = Number(ajuste.descuentoPct) || 0;
    const iva = Number(ajuste.ivaPct) || 0;
    return redondear(costo * (1 - d / 100) * (1 + iva / 100), 4);
  }

  // ───────────────────────── Textos y similitud ─────────────────────────

  const UNIDADES = {
    gr: 'g', grs: 'g', gramo: 'g', gramos: 'g', kgs: 'kg', kilo: 'kg', kilos: 'kg', kg: 'kg',
    lt: 'l', lts: 'l', litro: 'l', litros: 'l', cc: 'ml', unidades: 'u', unidad: 'u', un: 'u', unid: 'u', und: 'u'
  };
  const RELLENO = new Set(['x', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'para', 'en', 'por', 'a']);

  function tokenizar(s) {
    let t = sinAcentos(s);
    t = t.replace(/(\d)[.,](\d)/g, '$1#$2');            // 1,5 y 1.5 → 1#5
    t = t.replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2');
    t = t.replace(/[^a-z0-9#]+/g, ' ').trim();
    if (!t) return [];
    const out = [];
    t.split(' ').forEach(function (tok) {
      if (!tok) return;
      if (UNIDADES[tok]) tok = UNIDADES[tok];
      if (RELLENO.has(tok)) return;
      out.push(tok);
    });
    return out;
  }

  function esNumero(tok) { return /^\d+(#\d+)?$/.test(tok); }

  function normalizarTexto(s) { return tokenizar(s).join(' '); }

  /** Código para comparar: sin espacios, minúsculas, sin ceros a la izquierda ni ".0" que mete Excel. */
  function normCodigo(c) {
    let s = celdaATexto(c).toLowerCase().replace(/\s+/g, '');
    s = s.replace(/^(\d+)\.0+$/, '$1');
    if (/^\d+$/.test(s)) s = s.replace(/^0+(?=\d)/, '');
    return s;
  }

  function bigramas(s) {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const b = s.substr(i, 2);
      m.set(b, (m.get(b) || 0) + 1);
    }
    return m;
  }

  function diceBigramas(a, b) {
    if (a === b) return a.length ? 1 : 0;
    if (a.length < 2 || b.length < 2) return 0;
    const ma = bigramas(a), mb = bigramas(b);
    let inter = 0;
    ma.forEach(function (n, k) { if (mb.has(k)) inter += Math.min(n, mb.get(k)); });
    return (2 * inter) / ((a.length - 1) + (b.length - 1));
  }

  function conjunto(arr) { return Array.from(new Set(arr)); }

  function puntajeTokens(sa, sb) {
    if (!sa.length || !sb.length) return 0;
    const setB = new Set(sb);
    let inter = 0;
    sa.forEach(function (t) { if (setB.has(t)) inter++; });
    let score = (2 * inter) / (sa.length + sb.length);
    score = penalizarNumeros(score, sa, sb);
    return score;
  }

  // Si los dos nombres traen cantidades/tamaños y no coinciden ("500 g" vs "1 kg"), no son el mismo producto.
  function penalizarNumeros(score, sa, sb) {
    const na = sa.filter(esNumero), nb = sb.filter(esNumero);
    if (na.length && nb.length) {
      const setNb = new Set(nb);
      const iguales = na.length === nb.length && na.every(function (x) { return setNb.has(x); });
      if (!iguales) return score * 0.5;
    } else if (na.length !== nb.length) {
      return score * 0.9;
    }
    return score;
  }

  /** Similitud entre dos descripciones, de 0 a 1. */
  function similitud(a, b) {
    const ta = tokenizar(a), tb = tokenizar(b);
    if (!ta.length || !tb.length) return 0;
    const sa = conjunto(ta), sb = conjunto(tb);
    const tok = puntajeTokens(sa, sb);
    const big = penalizarNumeros(diceBigramas(ta.join(''), tb.join('')) * 0.95, sa, sb);
    return Math.max(tok, big);
  }

  // ───────────────────────── Índice de artículos ─────────────────────────

  function indexarArticulos(articulos) {
    const items = [];
    const porCodigo = new Map();
    const inv = new Map(); // token → [posiciones]
    articulos.forEach(function (a) {
      const toks = tokenizar(a.nombre);
      const it = { art: a, codigo: a.codigo, nCodigo: normCodigo(a.codigo), toks: conjunto(toks), joined: toks.join('') };
      const pos = items.length;
      items.push(it);
      if (it.nCodigo && !porCodigo.has(it.nCodigo)) porCodigo.set(it.nCodigo, it);
      it.toks.forEach(function (t) {
        if (!inv.has(t)) inv.set(t, []);
        inv.get(t).push(pos);
      });
    });
    return { items, porCodigo, inv };
  }

  /** Mejores candidatos por nombre para una descripción. Devuelve [{codigo, nombre, score}] ordenado. */
  function candidatosPorNombre(descripcion, idx, max) {
    max = max || 3;
    const tq = tokenizar(descripcion);
    if (!tq.length) return [];
    const sq = conjunto(tq);
    const posibles = new Set();
    sq.forEach(function (t) {
      const lista = idx.inv.get(t);
      if (lista && lista.length <= 2000) lista.forEach(function (p) { posibles.add(p); });
    });
    const puntuados = [];
    posibles.forEach(function (p) {
      const it = idx.items[p];
      puntuados.push({ it, score: puntajeTokens(sq, it.toks) });
    });
    puntuados.sort(function (x, y) { return y.score - x.score; });
    const joinedQ = tq.join('');
    return puntuados.slice(0, 8).map(function (x) {
      const big = penalizarNumeros(diceBigramas(joinedQ, x.it.joined) * 0.95, sq, x.it.toks);
      return { codigo: x.it.codigo, nombre: x.it.art.nombre, score: redondear(Math.max(x.score, big), 4) };
    }).sort(function (x, y) { return y.score - x.score; }).slice(0, max);
  }

  // ───────────────────────── Matcheo ─────────────────────────

  /**
   * Cruza cada fila de la lista con los artículos del cliente.
   * Estados devueltos:
   *   'relacion' → ya estaba vinculado de una carga anterior (automático)
   *   'codigo'   → el código del proveedor coincide con el del artículo (automático)
   *   'nombre'   → el nombre coincide exacto (automático)
   *   'dudoso'   → hay un candidato parecido, el cliente tiene que confirmar
   *   'nuevo'    → no se encontró nada
   * Cada resultado trae `aceptado` (true si ya se toma por bueno) y `candidatos` (sugerencias).
   *
   * relaciones: Map(normCodigo del proveedor → codigo del artículo)
   * opts: { umbralDudoso=0.6, umbralCodigoNombre=0.25 }
   */
  function matchear(filas, idx, relaciones, opts) {
    opts = opts || {};
    const umbralDudoso = opts.umbralDudoso != null ? opts.umbralDudoso : 0.6;
    const umbralCodNombre = opts.umbralCodigoNombre != null ? opts.umbralCodigoNombre : 0.25;
    relaciones = relaciones || new Map();
    const res = filas.map(function (f) {
      const r = { fila: f.fila, codigo: f.codigo, descripcion: f.descripcion, costo: f.costo,
        estado: 'nuevo', articuloCodigo: null, aceptado: false, score: 0, candidatos: [], motivo: '' };
      const nProv = normCodigo(f.codigo);

      // 1) Relación guardada
      if (nProv && relaciones.has(nProv)) {
        const it = idx.porCodigo.get(normCodigo(relaciones.get(nProv)));
        if (it) { r.estado = 'relacion'; r.articuloCodigo = it.codigo; r.aceptado = true; r.score = 1; return r; }
        r.motivo = 'El artículo vinculado antes ya no existe';
      }

      // 2) Mismo código
      if (nProv && idx.porCodigo.has(nProv)) {
        const it = idx.porCodigo.get(nProv);
        const sc = f.descripcion ? similitud(f.descripcion, it.art.nombre) : 1;
        r.articuloCodigo = it.codigo; r.score = sc;
        if (sc >= umbralCodNombre) { r.estado = 'codigo'; r.aceptado = true; return r; }
        // El código coincide pero el nombre no tiene nada que ver: puede ser casualidad.
        r.estado = 'dudoso'; r.motivo = 'El código coincide pero el nombre es muy distinto';
        r.candidatos = [{ codigo: it.codigo, nombre: it.art.nombre, score: redondear(sc, 4) }];
        return r;
      }

      // 3) Nombre parecido
      if (f.descripcion) {
        const cands = candidatosPorNombre(f.descripcion, idx, 3);
        r.candidatos = cands;
        if (cands.length) {
          const mejor = cands[0];
          const empate = cands.length > 1 && Math.abs(cands[1].score - mejor.score) < 0.001;
          r.score = mejor.score;
          if (mejor.score >= 0.999 && !empate) {
            r.estado = 'nombre'; r.articuloCodigo = mejor.codigo; r.aceptado = true; return r;
          }
          if (mejor.score >= umbralDudoso) {
            r.estado = 'dudoso'; r.articuloCodigo = mejor.codigo;
            if (empate) r.motivo = 'Hay dos artículos igual de parecidos';
            return r;
          }
        }
      }
      return r; // 'nuevo'
    });

    // Dos renglones de la lista apuntando al mismo artículo: que el cliente decida.
    const usos = new Map();
    res.forEach(function (r) {
      if (r.aceptado && r.articuloCodigo) {
        const k = normCodigo(r.articuloCodigo);
        usos.set(k, (usos.get(k) || 0) + 1);
      }
    });
    res.forEach(function (r) {
      if (r.aceptado && usos.get(normCodigo(r.articuloCodigo)) > 1) {
        r.aceptado = false;
        r.estado = 'dudoso';
        r.motivo = 'Otro renglón de la lista apunta al mismo artículo';
      }
    });
    return res;
  }

  // ───────────────────────── Precios ─────────────────────────

  /** Precio = costo × (1 + utilidad/100), igual que pxc() de Mi Gestor (sin redondeo; el redondeo es de pantalla). */
  function calcularPrecios(costo, utils) {
    utils = utils || {};
    const p = function (u) { return costo * (1 + (Number(u) || 0) / 100); };
    return { l1: p(utils.l1), l2: p(utils.l2), l3: p(utils.l3), mayor: p(utils.mayor) };
  }

  // ───────────────────────── Vista previa ─────────────────────────

  /**
   * Arma lo que se le muestra al cliente antes de confirmar.
   * resultados: salida de matchear(), con `aceptado` ya decidido por el cliente.
   * opts: { ajuste:{descuentoPct,ivaPct}, umbralAlertaPct=25, proveedorId }
   */
  function armarVistaPrevia(resultados, idx, opts) {
    opts = opts || {};
    const umbral = opts.umbralAlertaPct != null ? opts.umbralAlertaPct : 25;
    const items = [];
    const tocados = new Set();
    const cont = { suben: 0, bajan: 0, iguales: 0, alertas: 0, nuevos: 0, dudosos: 0, noAparecen: 0, duplicados: 0 };

    resultados.forEach(function (r) {
      if (r.estado === 'nuevo') { cont.nuevos++; return; }
      if (!r.aceptado) { if (r.estado === 'dudoso') cont.dudosos++; return; }
      const it = idx.porCodigo.get(normCodigo(r.articuloCodigo));
      if (!it) return;
      tocados.add(normCodigo(it.codigo));
      const anterior = Number(it.art.costo) || 0;
      const nuevo = ajustarCosto(r.costo, opts.ajuste);
      const pct = anterior > 0 ? redondear(((nuevo - anterior) / anterior) * 100, 2) : null;
      let tipo = 'igual';
      if (Math.abs(nuevo - anterior) > 0.00005) tipo = nuevo > anterior ? 'sube' : 'baja';
      const alerta = pct === null ? true : Math.abs(pct) >= umbral;
      if (tipo === 'sube') cont.suben++; else if (tipo === 'baja') cont.bajan++; else cont.iguales++;
      if (alerta && tipo !== 'igual') cont.alertas++;
      items.push({
        fila: r.fila, estado: r.estado,
        codigoProveedor: r.codigo, descripcionProveedor: r.descripcion,
        articuloCodigo: it.codigo, articuloNombre: it.art.nombre,
        costoAnterior: anterior, costoNuevo: nuevo, diffPct: pct, tipo, alerta: alerta && tipo !== 'igual',
        // El precio "anterior" es el que realmente está guardado (puede no coincidir con costo × margen).
        preciosAnteriores: it.art.precios || calcularPrecios(anterior, it.art.utils),
        preciosNuevos: calcularPrecios(nuevo, it.art.utils)
      });
    });

    const noAparecen = [];
    if (opts.proveedorId != null) {
      idx.items.forEach(function (it) {
        if (it.art.proveedorId === opts.proveedorId && !tocados.has(it.nCodigo)) {
          noAparecen.push({ articuloCodigo: it.codigo, articuloNombre: it.art.nombre, costo: it.art.costo });
        }
      });
    }
    cont.noAparecen = noAparecen.length;

    // Dos renglones de la lista que terminaron en el mismo artículo (por decisiones manuales): no se puede aplicar así.
    const veces = new Map();
    items.forEach(function (i) { const k = normCodigo(i.articuloCodigo); veces.set(k, (veces.get(k) || 0) + 1); });
    const duplicados = [];
    veces.forEach(function (n, k) { if (n > 1) duplicados.push(k); });
    cont.duplicados = duplicados.length;
    return { items, noAparecen, duplicados, resumen: cont };
  }

  /** Lo que se manda a guardar como vínculos (código del proveedor → artículo) tras confirmar. */
  function relacionesParaGuardar(resultados) {
    const out = [];
    resultados.forEach(function (r) {
      if (!r.aceptado || !r.articuloCodigo || !r.codigo) return;
      out.push({ codigo_proveedor: r.codigo, descripcion_proveedor: r.descripcion || null,
        articulo_codigo: r.articuloCodigo, ultimo_costo: r.costo });
    });
    return out;
  }

  return {
    parseNumero, parseCSV, detectarSeparador, detectarFilaEncabezado, sugerirMapeo, extraerFilas,
    ajustarCosto, normalizarTexto, normCodigo, similitud, indexarArticulos, candidatosPorNombre,
    matchear, calcularPrecios, armarVistaPrevia, relacionesParaGuardar, redondear
  };
});
