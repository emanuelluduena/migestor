/* ═══════════════════════════════════════════════════════════
   Almacén Natural — Sistema de Gestión
   app.js
═══════════════════════════════════════════════════════════ */

// ═══════════════════════ DB ═══════════════════════
const SK = 'almacen_v2';
function loadDB() {
  const defaults = {
    arts:[], provs:[], clis:[],
    usrs:[{id:1,nom:'Administrador',usr:'admin',pass:'1234',rol:'Administrador',activo:true}],
    bitacora:[], comps:[], ventas:[], gastos:[], caja:[], config:{},
    ids:{art:1,prov:1,cli:1,usr:2,comp:1,venta:1,gasto:1,caja:1}
  };
  try {
    const r = localStorage.getItem(SK);
    if (r) {
      const parsed = JSON.parse(r);
      // Normalizar datos viejos - agregar campos que puedan faltar
      return Object.assign({}, defaults, parsed, {
        bitacora: parsed.bitacora || [],
        ids: Object.assign({}, defaults.ids, parsed.ids || {})
      });
    }
  } catch(e) { console.warn('Error cargando DB:', e); }
  return defaults;
}
let DB = loadDB();
function saveDB() {
  localStorage.setItem(SK, JSON.stringify(DB));
  if (typeof _renderCache !== 'undefined') {
    Object.keys(_renderCache).forEach(k => delete _renderCache[k]);
  }
}
function nid(k) { const id=DB.ids[k]; DB.ids[k]++; saveDB(); return id; }
// ═══════════════════════ PAGINACIÓN ═══════════════════════
const PG_SIZE = 25;
const _pags = {};
function pgActual(mod) { return _pags[mod] || 1; }

function paginar(mod, items, pgSize) {
  var PG_SZ = pgSize || PG_SIZE;
  var total = items.length;
  var totalPags = Math.max(1, Math.ceil(total / PG_SZ));
  var pag = Math.min(_pags[mod] || 1, totalPags);
  _pags[mod] = pag;
  var slice = items.slice((pag-1)*PG_SZ, pag*PG_SZ);
  var nav = '';
  if (totalPags > 1) {
    var desde = (pag-1)*PG_SZ + 1;
    var hasta = Math.min(pag*PG_SZ, total);
    var nums = Array.from({length:totalPags}, function(_,i){return i+1;})
      .filter(function(p){return p===1||p===totalPags||Math.abs(p-pag)<=2;});
    var btnPags = '';
    for(var bi=0;bi<nums.length;bi++){
      var p=nums[bi];
      if(bi>0&&p-nums[bi-1]>1) btnPags+='<span style="color:var(--gris);padding:0 4px">…</span>';
      btnPags+='<button class="btn bsm '+(p===pag?'bv':'bg')+'" onclick="pgIr(\''+mod+'\','+p+')">'+p+'</button>';
    }
    nav='<div style="display:flex;align-items:center;gap:8px;padding:10px 4px;font-size:13px;flex-wrap:wrap;border-top:1px solid #eee;margin-top:6px">'
      +'<span style="color:var(--gris);font-size:12px">'+desde+'–'+hasta+' de '+total+'</span>'
      +'<div style="display:flex;gap:4px;margin-left:auto;flex-wrap:wrap">'
      +(pag>1?'<button class="btn bg bsm" onclick="pgIr(\''+mod+'\',1)">«</button>'
             +'<button class="btn bg bsm" onclick="pgIr(\''+mod+'\','+(pag-1)+')">‹</button>':'')
      +btnPags
      +(pag<totalPags?'<button class="btn bg bsm" onclick="pgIr(\''+mod+'\','+(pag+1)+')">›</button>'
                     +'<button class="btn bg bsm" onclick="pgIr(\''+mod+'\','+totalPags+')">»</button>':'')
      +'</div></div>';
  }
  return { slice: slice, nav: nav, total: total, totalPags: totalPags, pag: pag };
}

const _pgRender = {};
function pgIr(mod, n) { _pags[mod] = n; if(_pgRender[mod]) _pgRender[mod](); }



// ═══════════════════════ UTILS ═══════════════════════
// Formateadores creados UNA SOLA VEZ y reutilizados (47x más rápido que toLocaleString por llamada)
const _nf = new Intl.NumberFormat('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2});
const _df = new Intl.DateTimeFormat('es-AR');
const fmt = n => '$' + _nf.format(parseFloat(n)||0);
const hoy = () => new Date().toISOString().split('T')[0];
const hora = () => new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
const fleg = f => { if(!f) return '-'; const p=f.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; };
const pxc = (c,p) => c*(1+p/100);
function cerrar(id) { document.getElementById(id).classList.remove('open'); }
function abrir(id) { document.getElementById(id).classList.add('open'); }
document.querySelectorAll('.moverlay').forEach(m => m.addEventListener('click', e => { if(e.target===m) m.classList.remove('open'); }));

// ═══════════════════════ NAVEGACIÓN ═══════════════════════

const _renderCache = {};
const _siempreRender = new Set(['inicio', 'ventas', 'caja']);

function _firma(tab) {
  try {
    switch(tab) {
      case 'articulos':   return DB.arts.length + '|' + (DB.arts[DB.arts.length-1]||{}).id;
      case 'proveedores': return DB.provs.length + '|' + (DB.provs[DB.provs.length-1]||{}).id;
      case 'clientes':    return DB.clis.length  + '|' + (DB.clis[DB.clis.length-1]||{}).id;
      case 'usuarios':    return DB.usrs.length  + '|' + (DB.usrs[DB.usrs.length-1]||{}).id;
      case 'compras':     return DB.comps.length + '|' + (DB.comps[DB.comps.length-1]||{}).id;
      case 'gastos':      return DB.gastos.length + '|' + (DB.gastos[DB.gastos.length-1]||{}).id;
      case 'estadisticas':return DB.ventas.length + '|' + DB.gastos.length + '|' + DB.comps.length;
      case 'contabilidad':return DB.ventas.length + '|' + DB.gastos.length + '|' + DB.caja.length;
      case 'precios':     return DB.arts.length + '|' + JSON.stringify(DB.config&&DB.config.listas||'');
      case 'bitacora':    return DB.bitacora.length + '|' + (DB.bitacora[DB.bitacora.length-1]||{}).ts;
      case 'config':      return JSON.stringify(DB.config||{});
      case 'importar':    return 'static';
      case 'asistente':   return 'static';
      default:            return null;
    }
  } catch(e) { return null; }
}

function irA(tab) {
  try {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('activo'));
    document.querySelectorAll('.modulo').forEach(m => m.classList.remove('activo'));
    const tabEl = document.querySelector('[data-tab="'+tab+'"]');
    const modEl = document.getElementById('mod-'+tab);
    if (tabEl) tabEl.classList.add('activo');
    if (modEl) modEl.classList.add('activo');
    const firmaActual = _firma(tab);
    const debeRender = _siempreRender.has(tab)
      || firmaActual === null
      || _renderCache[tab] !== firmaActual;
    if (debeRender) {
      renderMod(tab);
      if (firmaActual !== null) _renderCache[tab] = firmaActual;
    }
  } catch(err) {
    console.error('Error en irA('+tab+'):', err);
  }
}

function renderMod(tab) {
  if(tab==='inicio') renderInicio();
  else if(tab==='articulos') renderArts();
  else if(tab==='proveedores') renderProvs();
  else if(tab==='clientes') renderClis();
  else if(tab==='usuarios') renderUsrs();
  else if(tab==='compras') renderComps();
  else if(tab==='ventas') renderVentas();
  else if(tab==='caja') renderCaja();
  else if(tab==='estadisticas') renderStats();
  else if(tab==='gastos') renderGastos();
  else if(tab==='contabilidad') renderConta();
  else if(tab==='config') renderConfig();
  else if(tab==='bitacora') renderBitacora();
  else if(tab==='precios') renderPrecios();
  else if(tab==='importar') renderImportar();
  else if(tab==='asistente') renderAsistente();
}

// ═══════════════════════ INICIO ═══════════════════════
function renderInicio() {
  var hoyStr = hoy();
  var mesStr = new Date().toISOString().slice(0,7);
  var vh = DB.ventas.filter(function(v){return v.fecha===hoyStr;}).reduce(function(s,v){return s+v.total;},0);
  var vm = DB.ventas.filter(function(v){return v.fecha&&v.fecha.startsWith(mesStr);}).reduce(function(s,v){return s+v.total;},0);
  var sb = DB.arts.filter(function(a){return a.usastk!=='no'&&a.stk<=a.stkmin;}).length;
  var vhoy = DB.ventas.filter(function(v){return v.fecha===hoyStr;}).length;
  document.getElementById('si').innerHTML =
    '<div class="scard"><div class="snum">'+fmt(vh)+'</div><div class="slbl">💰 Ventas de hoy ('+vhoy+' tickets)</div></div>'+
    '<div class="scard"><div class="snum">'+fmt(vm)+'</div><div class="slbl">📅 Ventas del mes</div></div>'+
    '<div class="scard am"><div class="snum">'+DB.arts.length+'</div><div class="slbl">📦 Artículos</div></div>'+
    '<div class="scard '+(sb>0?'ro':'')+'"><div class="snum">'+sb+'</div><div class="slbl">⚠️ Stock bajo</div></div>';

  // Grafico de barras - ultimos N dias
  var dias = parseInt((document.getElementById('dash-periodo')||{value:'7'}).value)||7;
  var fechas = [];
  for(var i=dias-1;i>=0;i--){
    var d = new Date(); d.setDate(d.getDate()-i);
    fechas.push(d.toISOString().slice(0,10));
  }
  var totales = fechas.map(function(f){
    return DB.ventas.filter(function(v){return v.fecha===f;}).reduce(function(s,v){return s+v.total;},0);
  });
  var maxVal = Math.max.apply(null, totales.concat([1]));
  var grafico = document.getElementById('dash-grafico');
  var eje = document.getElementById('dash-eje');
  if(grafico) {
    var barWidth = Math.floor(100/dias);
    grafico.innerHTML = totales.map(function(t,i){
      var h = Math.max(4, Math.round((t/maxVal)*160));
      var esFin = new Date(fechas[i]).getDay()===0||new Date(fechas[i]).getDay()===6;
      var esHoy = fechas[i]===hoyStr;
      var color = esHoy?'var(--verde)':esFin?'var(--tierra-claro)':'var(--verde-claro)';
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;cursor:default" title="'+fechas[i]+': '+fmt(t)+'">'
        +(t>0?'<span style="font-size:9px;color:var(--verde);font-weight:600">'+fmt(t).replace('$','').trim()+'</span>':'<span style="font-size:9px"> </span>')
        +'<div style="width:100%;max-width:40px;height:'+h+'px;background:'+color+';border-radius:4px 4px 0 0;transition:height 0.3s"></div>'
        +'</div>';
    }).join('');
    eje.innerHTML = fechas.map(function(f){
      var d = new Date(f+'T00:00:00');
      var esHoy = f===hoyStr;
      return '<div style="flex:1;text-align:center;font-size:9px;color:'+(esHoy?'var(--verde)':'var(--gris)')+';font-weight:'+(esHoy?'700':'400')+'">'+d.getDate()+'/'+(d.getMonth()+1)+'</div>';
    }).join('');
  }

  // Top 5 productos
  var conteo = {};
  DB.ventas.filter(function(v){return v.fecha&&v.fecha.startsWith(mesStr);}).forEach(function(v){
    v.items.forEach(function(it){conteo[it.nom]=(conteo[it.nom]||0)+it.cant;});
  });
  var top = Object.entries(conteo).sort(function(a,b){return b[1]-a[1];}).slice(0,5);
  var topEl = document.getElementById('dash-top');
  if(topEl) {
    var emos = ['🥇','🥈','🥉','4️⃣','5️⃣'];
    topEl.innerHTML = top.length===0
      ? '<div class="vacio" style="padding:20px"><div class="vi">📦</div><p>Sin ventas este mes</p></div>'
      : top.map(function(x,i){
          return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px">'
            +'<span>'+emos[i]+'</span>'
            +'<span style="flex:1">'+x[0]+'</span>'
            +'<span class="bdg bv2">'+x[1]+' u.</span>'
            +'</div>';
        }).join('');
  }

  // Ventas por pago hoy
  var pagos = {};
  DB.ventas.filter(function(v){return v.fecha===hoyStr;}).forEach(function(v){
    pagos[v.pago]=(pagos[v.pago]||0)+v.total;
  });
  var pagosEl = document.getElementById('dash-pagos');
  if(pagosEl) {
    var totPagos = Object.values(pagos).reduce(function(s,v){return s+v;},0);
    pagosEl.innerHTML = Object.keys(pagos).length===0
      ? '<div class="vacio" style="padding:20px"><div class="vi">💳</div><p>Sin ventas hoy</p></div>'
      : Object.entries(pagos).sort(function(a,b){return b[1]-a[1];}).map(function(x){
          var pct = totPagos?Math.round(x[1]/totPagos*100):0;
          return '<div style="margin-bottom:10px">'
            +'<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px">'
            +'<span>'+x[0]+'</span><span class="tv">'+fmt(x[1])+'</span></div>'
            +'<div style="background:#eee;border-radius:20px;height:7px">'
            +'<div style="background:var(--verde-claro);border-radius:20px;height:7px;width:'+pct+'%"></div>'
            +'</div></div>';
        }).join('');
  }

  // Stock bajo
  var sbajo = DB.arts.filter(function(a){return a.usastk!=='no'&&a.stk<=a.stkmin;});
  document.getElementById('sb').innerHTML = sbajo.length===0
    ? '<div class="alert av">✅ Todo el stock en orden</div>'
    : sbajo.slice(0,6).map(function(a){
        return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;font-size:13px">'
          +'<span>'+a.nom+'</span>'
          +'<span class="bdg '+(a.stk<=0?'br2':'ba2')+'">'+a.stk+' '+a.uni+'</span></div>';
      }).join('')+(sbajo.length>6?'<div style="font-size:12px;color:var(--gris);margin-top:6px">...y '+(sbajo.length-6)+' más</div>':'');

  // Ultimas ventas
  var uv = [...DB.ventas].reverse().slice(0,5);
  document.getElementById('uv').innerHTML = uv.length===0
    ? '<div class="vacio"><div class="vi">💰</div><p>Sin ventas</p></div>'
    : uv.map(function(v){
        return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;font-size:13px">'
          +'<div><span>'+(v.clinom||'Consumidor Final')+'</span><br><span style="font-size:10px;color:var(--gris)">'+v.hora+' — '+v.pago+'</span></div>'
          +'<span class="tv">'+fmt(v.total)+'</span></div>';
      }).join('');
}

// ═══════════════════════ ARTÍCULOS ═══════════════════════
function renderArts(lista) {
  const arts = lista || DB.arts;
  const cats = [...new Set(DB.arts.map(a=>a.cat).filter(Boolean))].sort();
  const provs = [...new Set(DB.arts.map(a=>{const p=DB.provs.find(x=>x.id==a.provid);return p?p.nom:'';}).filter(Boolean))].sort();
  const dl = document.getElementById('lcats');
  if(dl) dl.innerHTML = cats.map(c=>'<option value="'+c+'">').join('');
  const fc = document.getElementById('fcat');
  if(fc) { const cv=fc.value; fc.innerHTML='<option value="">Todas las categorías</option>'+cats.map(c=>'<option value="'+c+'" '+(c===cv?'selected':'')+'>'+c+'</option>').join(''); }
  const fp = document.getElementById('fprov');
  if(fp) { const cv=fp.value; fp.innerHTML='<option value="">Todos los proveedores</option>'+provs.map(p=>'<option value="'+p+'" '+(p===cv?'selected':'')+'>'+p+'</option>').join(''); }
  const tb = document.getElementById('tart');
  const pgEl = document.getElementById('pg-arts');
  if(!arts.length) { tb.innerHTML='<tr><td colspan="13"><div class="vacio"><div class="vi">📦</div><p>Sin artículos que coincidan</p></div></td></tr>'; if(pgEl)pgEl.innerHTML=''; actualizarContador(); return; }
  const { slice, nav } = paginar('arts', arts);
  tb.innerHTML = slice.map(a=>{
    const l1=fmt(pxc(a.cos,a.u1)),l2=fmt(pxc(a.cos,a.u2)),l3=fmt(pxc(a.cos,a.u3)),lm=fmt(pxc(a.cos,a.um));
    const sb=a.stk<=0?'br2':a.stk<=a.stkmin?'ba2':'bv2';
    return '<tr ondblclick="editArt('+a.id+')" style="cursor:pointer"><td onclick="event.stopPropagation()"><input type="checkbox" class="art-chk" value="'+a.id+'" onchange="actualizarContador()"></td><td><span class="bdg bv2">'+a.cod+'</span></td><td><strong>'+a.nom+'</strong></td><td>'+(a.cat||'-')+'</td><td>'+fmt(a.cos)+'</td><td>'+l1+'</td><td>'+l2+'</td><td>'+l3+'</td><td class="tt2">'+lm+'</td><td>>='+a.cm+'</td><td><span class="bdg '+sb+'">'+a.stk+' '+a.uni+'</span></td><td><span class="bdg '+(a.usastk==='no'?'bt2':'bv2')+'">'+(a.usastk==='no'?'Libre':'Con stk')+'</span></td><td style="white-space:nowrap" onclick="event.stopPropagation()"><button class="btn bg bsm" onclick="editArt('+a.id+')">✏️</button> <button class="btn br bsm" onclick="delArt('+a.id+')">🗑️</button></td></tr>';
  }).join('');
  if(pgEl) pgEl.innerHTML = nav;
  sincronizarCheckboxes();
}
_pgRender['arts'] = () => renderArts(_artsFiltradas);
let _artsFiltradas = null;

// ── Selección multi-página ──────────────────────────────────────────
// _selArt guarda los IDs seleccionados aunque el usuario cambie de página
const _selArt = new Set();

function actualizarContador() {
  // Sincronizar checkboxes visibles → _selArt
  document.querySelectorAll('.art-chk').forEach(function(c) {
    const id = parseInt(c.value);
    if (c.checked) _selArt.add(id);
    else _selArt.delete(id);
  });
  // Pintar los checkboxes visibles según _selArt
  document.querySelectorAll('.art-chk').forEach(function(c) {
    c.checked = _selArt.has(parseInt(c.value));
  });
  const cnt = document.getElementById('sel-count');
  const n = _selArt.size;
  if(cnt) cnt.textContent = n + ' seleccionado' + (n!==1?'s':'');
  // Actualizar el checkbox de cabecera
  const chkAll = document.getElementById('sel-all');
  if(chkAll) {
    const visibles = document.querySelectorAll('.art-chk');
    const todasMarcadas = visibles.length > 0 && [...visibles].every(c => _selArt.has(parseInt(c.value)));
    chkAll.checked = todasMarcadas;
    chkAll.indeterminate = !todasMarcadas && _selArt.size > 0;
  }
}

// Selecciona / deselecciona solo los de la página visible
function selPaginaActual(cb) {
  document.querySelectorAll('.art-chk').forEach(function(c) {
    const id = parseInt(c.value);
    if(cb.checked) _selArt.add(id);
    else _selArt.delete(id);
    c.checked = cb.checked;
  });
  actualizarContador();
}

// Selecciona TODOS los artículos del listado filtrado actual (todas las páginas)
function selTodasLasPaginas() {
  const lista = _artsFiltradas || DB.arts;
  lista.forEach(function(a){ _selArt.add(a.id); });
  // Marcar también los checkboxes visibles
  document.querySelectorAll('.art-chk').forEach(function(c){ c.checked = true; });
  actualizarContador();
  toast(lista.length + ' artículo' + (lista.length!==1?'s':'') + ' seleccionado' + (lista.length!==1?'s':''), 'v');
}

// Limpia toda la selección
function deselTodo() {
  _selArt.clear();
  document.querySelectorAll('.art-chk').forEach(function(c){ c.checked = false; });
  actualizarContador();
}

// Llamado al renderizar cada página para pintar los checkboxes correctamente
function sincronizarCheckboxes() {
  document.querySelectorAll('.art-chk').forEach(function(c) {
    c.checked = _selArt.has(parseInt(c.value));
  });
  actualizarContador();
}

function limpiarFiltros() {
  document.getElementById('bart').value='';
  document.getElementById('fcat').value='';
  document.getElementById('fprov').value='';
  document.getElementById('fstk').value='';
  _selArt.clear();
  renderArts();
}

async function borrarSeleccionados() {
  const ids = [..._selArt];
  if(!ids.length){toast('Seleccioná al menos un artículo','a');return;}
  if(!await confirmar('Vas a borrar '+ids.length+' artículo'+(ids.length!==1?'s':'')+'. ¿Confirmás?'))return;
  DB.arts = DB.arts.filter(function(a){return !ids.includes(a.id);});
  _selArt.clear();
  saveDB(); filtArt();
  toast(ids.length+' artículo'+(ids.length!==1?'s':'')+' eliminado'+(ids.length!==1?'s':'')+'.', 'v');
}

async function borrarTodosLosArticulos() {
  const total = DB.arts.length;
  if(!total){toast('No hay artículos para borrar','a');return;}
  if(!await confirmar('⚠️ Esto borrará los '+total+' artículos del sistema. Esta acción no se puede deshacer. ¿Confirmás?'))return;
  // Segunda confirmación para una acción tan destructiva
  if(!await confirmar('⚠️ Segunda confirmación: ¿Seguro que querés borrar TODOS los artículos?'))return;
  DB.arts = [];
  DB.ids.art = 1;
  _selArt.clear();
  saveDB(); filtArt();
  toast('Todos los artículos fueron eliminados.', 'v');
}

function editarSeleccionado() {
  const ids = [..._selArt];
  if(!ids.length){toast('Seleccioná un artículo','a');return;}
  if(ids.length>1){toast('Seleccioná solo uno para editar','a');return;}
  editArt(ids[0]);
}
function filtArt() {
  const q=document.getElementById('bart').value.toLowerCase();
  const cat=document.getElementById('fcat').value;
  const provNom=document.getElementById('fprov').value;
  const stk=document.getElementById('fstk').value;
  _artsFiltradas = DB.arts.filter(function(a){
    if(q && !a.nom.toLowerCase().includes(q) && !a.cod.toLowerCase().includes(q)) return false;
    if(cat && a.cat!==cat) return false;
    if(provNom){const p=DB.provs.find(function(x){return x.id==a.provid;});if(!p||p.nom!==provNom) return false;}
    if(stk==='bajo' && !(a.usastk!=='no' && a.stk<=a.stkmin && a.stk>0)) return false;
    if(stk==='sin' && a.stk>0) return false;
    if(stk==='libre' && a.usastk!=='no') return false;
    return true;
  });
  _pags['arts'] = 1;
  renderArts(_artsFiltradas);
}
function calcPrecios() {
  const c=parseFloat(document.getElementById('art-cos').value)||0;
  ['1','2','3'].forEach(n=>{ document.getElementById('art-p'+n).textContent='Precio: '+fmt(pxc(c,parseFloat(document.getElementById('art-u'+n).value)||0)); });
  document.getElementById('art-pm').textContent='Precio: '+fmt(pxc(c,parseFloat(document.getElementById('art-um').value)||0));
}
function abrirArt() {
  document.getElementById('art-id').value='';
  document.getElementById('mart-tit').textContent='Nuevo Artículo';
  ['cod','nom','cat'].forEach(f=>document.getElementById('art-'+f).value='');
  document.getElementById('art-uni').value='Unidad';
  document.getElementById('art-stk').value=0;
  document.getElementById('art-stkmin').value=5;
  document.getElementById('art-usastk').value='si';
  document.getElementById('art-cos').value='';
  document.getElementById('art-u1').value=30;
  document.getElementById('art-u2').value=25;
  document.getElementById('art-u3').value=20;
  document.getElementById('art-um').value=15;
  document.getElementById('art-cm').value=2;
  const sp=document.getElementById('art-prov');
  sp.innerHTML='<option value="">Sin proveedor</option>'+DB.provs.map(p=>'<option value="'+p.id+'">'+p.nom+'</option>').join('');
  calcPrecios(); abrir('m-art');
}
function editArt(id) {
  const a=DB.arts.find(x=>x.id===id); if(!a) return;
  document.getElementById('art-id').value=id;
  document.getElementById('mart-tit').textContent='Editar Artículo';
  document.getElementById('art-cod').value=a.cod;
  document.getElementById('art-nom').value=a.nom;
  document.getElementById('art-cat').value=a.cat||'';
  document.getElementById('art-uni').value=a.uni;
  document.getElementById('art-stk').value=a.stk;
  document.getElementById('art-stkmin').value=a.stkmin;
  document.getElementById('art-usastk').value=a.usastk||'si';
  document.getElementById('art-cos').value=a.cos;
  document.getElementById('art-u1').value=a.u1;
  document.getElementById('art-u2').value=a.u2;
  document.getElementById('art-u3').value=a.u3;
  document.getElementById('art-um').value=a.um;
  document.getElementById('art-cm').value=a.cm;
  const sp=document.getElementById('art-prov');
  sp.innerHTML='<option value="">Sin proveedor</option>'+DB.provs.map(p=>'<option value="'+p.id+'" '+(p.id==a.provid?'selected':'')+'>'+p.nom+'</option>').join('');
  calcPrecios(); abrir('m-art');
}
function guardarArt() {
  const nom=document.getElementById('art-nom').value.trim();
  const cos=parseFloat(document.getElementById('art-cos').value);
  if(!nom){toast('Ingresá el nombre','a');return;}
  if(isNaN(cos)){toast('Ingresá un costo válido','a');return;}
  const d={
    cod:document.getElementById('art-cod').value||'ART'+String(DB.ids.art).padStart(3,'0'),
    nom,cat:document.getElementById('art-cat').value.trim(),
    uni:document.getElementById('art-uni').value,
    stk:parseFloat(document.getElementById('art-stk').value)||0,
    stkmin:parseFloat(document.getElementById('art-stkmin').value)||0,
    usastk:document.getElementById('art-usastk').value,
    cos,u1:parseFloat(document.getElementById('art-u1').value)||0,
    u2:parseFloat(document.getElementById('art-u2').value)||0,
    u3:parseFloat(document.getElementById('art-u3').value)||0,
    um:parseFloat(document.getElementById('art-um').value)||0,
    cm:parseFloat(document.getElementById('art-cm').value)||2,
    provid:document.getElementById('art-prov').value||null
  };
  const eid=document.getElementById('art-id').value;
  if(eid){const i=DB.arts.findIndex(x=>x.id==eid);if(i>=0)DB.arts[i]={...DB.arts[i],...d};}
  else{d.id=nid('art');DB.arts.push(d);}
  saveDB(); cerrar('m-art'); renderArts();
}
async function delArt(id){if(!await confirmar('¿Eliminás este artículo?'))return;DB.arts=DB.arts.filter(a=>a.id!==id);saveDB();renderArts();}

// ═══════════════════════ PROVEEDORES ═══════════════════════
function renderProvs(lista) {
  const provs=lista||DB.provs;
  const tb=document.getElementById('tprov');
  if(!provs.length){tb.innerHTML='<tr><td colspan="7"><div class="vacio"><div class="vi">🚚</div><p>Sin proveedores</p></div></td></tr>';return;}
  tb.innerHTML=provs.map(p=>'<tr><td>'+p.id+'</td><td><strong>'+p.nom+'</strong></td><td>'+(p.cuit||'-')+'</td><td>'+(p.tel||'-')+'</td><td>'+(p.email||'-')+'</td><td><span class="bdg bv2">'+(p.rub||'-')+'</span></td><td><button class="btn bg bsm" onclick="editProv('+p.id+')">✏️</button> <button class="btn br bsm" onclick="delProv('+p.id+')">🗑️</button></td></tr>').join('');
}
function filtProv(){const q=document.getElementById('bprov').value.toLowerCase();renderProvs(DB.provs.filter(p=>p.nom.toLowerCase().includes(q)));}
function abrirProv(){document.getElementById('prov-id').value='';document.getElementById('mprov-tit').textContent='Nuevo Proveedor';['nom','cuit','tel','email','dir','rub','not'].forEach(f=>{const el=document.getElementById('prov-'+f);if(el)el.value='';});abrir('m-prov');}
function editProv(id){const p=DB.provs.find(x=>x.id===id);if(!p)return;document.getElementById('prov-id').value=id;document.getElementById('mprov-tit').textContent='Editar Proveedor';document.getElementById('prov-nom').value=p.nom;document.getElementById('prov-cuit').value=p.cuit||'';document.getElementById('prov-tel').value=p.tel||'';document.getElementById('prov-email').value=p.email||'';document.getElementById('prov-dir').value=p.dir||'';document.getElementById('prov-rub').value=p.rub||'';document.getElementById('prov-not').value=p.not||'';abrir('m-prov');}
function guardarProv(){const nom=document.getElementById('prov-nom').value.trim();if(!nom){toast('Ingresá el nombre','a');return;}const d={nom,cuit:document.getElementById('prov-cuit').value.trim(),tel:document.getElementById('prov-tel').value.trim(),email:document.getElementById('prov-email').value.trim(),dir:document.getElementById('prov-dir').value.trim(),rub:document.getElementById('prov-rub').value.trim(),not:document.getElementById('prov-not').value.trim()};const eid=document.getElementById('prov-id').value;if(eid){const i=DB.provs.findIndex(x=>x.id==eid);if(i>=0)DB.provs[i]={...DB.provs[i],...d};}else{d.id=nid('prov');DB.provs.push(d);}saveDB();cerrar('m-prov');renderProvs();}
async function delProv(id){if(!await confirmar('¿Eliminás este proveedor?'))return;DB.provs=DB.provs.filter(p=>p.id!==id);saveDB();renderProvs();}

// ═══════════════════════ CLIENTES ═══════════════════════
const lnom={'lista1':'Lista 1','lista2':'Lista 2','lista3':'Lista 3','mayor':'Mayor'};
function renderClis(lista){
  const clis=lista||DB.clis;const tb=document.getElementById('tcli');
  if(!clis.length){tb.innerHTML='<tr><td colspan="6"><div class="vacio"><div class="vi">👥</div><p>Sin clientes</p></div></td></tr>';return;}
  tb.innerHTML=clis.map(c=>{const s=DB.ventas.filter(v=>v.cliid==c.id&&v.pago==='Cuenta Corriente').reduce((a,v)=>a+v.total,0);return '<tr><td>'+c.id+'</td><td><strong>'+c.nom+'</strong></td><td>'+(c.dni||'-')+'</td><td>'+(c.tel||'-')+'</td><td><span class="bdg bv2">'+(lnom[c.lista]||c.lista)+'</span></td><td class="'+(s>0?'tr2':'tv')+'">'+fmt(s)+'</td><td><button class="btn bg bsm" onclick="editCli('+c.id+')">✏️</button> <button class="btn br bsm" onclick="delCli('+c.id+')">🗑️</button></td></tr>';}).join('');
}
function filtCli(){const q=document.getElementById('bcli').value.toLowerCase();renderClis(DB.clis.filter(c=>c.nom.toLowerCase().includes(q)||(c.dni||'').includes(q)));}
function abrirCli(){document.getElementById('cli-id').value='';document.getElementById('mcli-tit').textContent='Nuevo Cliente';['nom','dni','tel','email','dir'].forEach(f=>document.getElementById('cli-'+f).value='');document.getElementById('cli-lista').value='lista1';abrir('m-cli');}
function editCli(id){const c=DB.clis.find(x=>x.id===id);if(!c)return;document.getElementById('cli-id').value=id;document.getElementById('mcli-tit').textContent='Editar Cliente';document.getElementById('cli-nom').value=c.nom;document.getElementById('cli-dni').value=c.dni||'';document.getElementById('cli-tel').value=c.tel||'';document.getElementById('cli-email').value=c.email||'';document.getElementById('cli-dir').value=c.dir||'';document.getElementById('cli-lista').value=c.lista||'lista1';abrir('m-cli');}
function guardarCli(){const nom=document.getElementById('cli-nom').value.trim();if(!nom){toast('Ingresá el nombre','a');return;}const d={nom,dni:document.getElementById('cli-dni').value.trim(),tel:document.getElementById('cli-tel').value.trim(),email:document.getElementById('cli-email').value.trim(),dir:document.getElementById('cli-dir').value.trim(),lista:document.getElementById('cli-lista').value};const eid=document.getElementById('cli-id').value;if(eid){const i=DB.clis.findIndex(x=>x.id==eid);if(i>=0)DB.clis[i]={...DB.clis[i],...d};}else{d.id=nid('cli');DB.clis.push(d);}saveDB();cerrar('m-cli');renderClis();}
async function delCli(id){if(!await confirmar('¿Eliminás este cliente?'))return;DB.clis=DB.clis.filter(c=>c.id!==id);saveDB();renderClis();}

// ═══════════════════════ USUARIOS ═══════════════════════
function renderUsrs(){const tb=document.getElementById('tusr');tb.innerHTML=DB.usrs.map(u=>'<tr><td>'+u.id+'</td><td>'+u.nom+'</td><td><code>'+u.usr+'</code></td><td><span class="bdg '+(u.rol==='Administrador'?'bt2':'bv2')+'">'+u.rol+'</span></td><td><span class="bdg '+(u.activo!==false?'bv2':'br2')+'">'+(u.activo!==false?'Activo':'Inactivo')+'</span></td><td><button class="btn bg bsm" onclick="editUsr('+u.id+')">✏️</button>'+(u.id!==1?' <button class="btn br bsm" onclick="delUsr('+u.id+')">🗑️</button>':'')+'</td></tr>').join('');}
function abrirUsr(){document.getElementById('usr-id').value='';document.getElementById('musr-tit').textContent='Nuevo Usuario';['nom','usr','pass'].forEach(f=>document.getElementById('usr-'+f).value='');document.getElementById('usr-rol').value='Vendedor';abrir('m-usr');}
function editUsr(id){const u=DB.usrs.find(x=>x.id===id);if(!u)return;document.getElementById('usr-id').value=id;document.getElementById('musr-tit').textContent='Editar Usuario';document.getElementById('usr-nom').value=u.nom;document.getElementById('usr-usr').value=u.usr;document.getElementById('usr-pass').value=u.pass||'';document.getElementById('usr-rol').value=u.rol;abrir('m-usr');}
function guardarUsr(){const nom=document.getElementById('usr-nom').value.trim(),usr=document.getElementById('usr-usr').value.trim();if(!nom||!usr){toast('Completá nombre y usuario','a');return;}const d={nom,usr,pass:document.getElementById('usr-pass').value,rol:document.getElementById('usr-rol').value,activo:true};const eid=document.getElementById('usr-id').value;if(eid){const i=DB.usrs.findIndex(x=>x.id==eid);if(i>=0)DB.usrs[i]={...DB.usrs[i],...d};}else{d.id=nid('usr');DB.usrs.push(d);}saveDB();cerrar('m-usr');renderUsrs();}
async function delUsr(id){if(id===1){toast('No podés eliminar el admin','r');return;}if(!await confirmar('¿Eliminás este usuario?'))return;DB.usrs=DB.usrs.filter(u=>u.id!==id);saveDB();renderUsrs();}

// ═══════════════════════ COMPRAS ═══════════════════════
let itemsComp=[];
function renderComps(){
  const tb=document.getElementById('tcomp');
  const pgEl=document.getElementById('pg-comps');
  const items=[...DB.comps].reverse();
  if(!items.length){tb.innerHTML='<tr><td colspan="6"><div class="vacio"><div class="vi">🛒</div><p>Sin compras</p></div></td></tr>';if(pgEl)pgEl.innerHTML='';return;}
  const {slice,nav}=paginar('comps',items);
  tb.innerHTML=slice.map(c=>'<tr><td>'+c.id+'</td><td>'+fleg(c.fecha)+'</td><td>'+(c.provnom||'-')+'</td><td>'+(c.nro||'-')+'</td><td class="tv">'+fmt(c.total)+'</td><td><button class="btn br bsm" onclick="delComp('+c.id+')">🗑️</button></td></tr>').join('');
  if(pgEl)pgEl.innerHTML=nav;
}
_pgRender['comps'] = renderComps;
function abrirCompra(){itemsComp=[];document.getElementById('cfecha').value=hoy();document.getElementById('cnro').value='';const sp=document.getElementById('cprov');sp.innerHTML=DB.provs.length?DB.provs.map(p=>'<option value="'+p.id+'">'+p.nom+'</option>').join(''):'<option>Sin proveedores</option>';const sa=document.getElementById('cart');sa.innerHTML=DB.arts.length?DB.arts.map(a=>'<option value="'+a.id+'">'+a.nom+'</option>').join(''):'<option>Sin artículos</option>';renderItemsComp();abrir('m-compra');}
function addItemComp(){const aid=parseInt(document.getElementById('cart').value);const cant=parseFloat(document.getElementById('ccant').value)||1;const cos=parseFloat(document.getElementById('ccosto').value)||0;const art=DB.arts.find(a=>a.id===aid);if(!art)return;itemsComp.push({aid,nom:art.nom,cant,cos,sub:cant*cos});renderItemsComp();}
function renderItemsComp(){const tb=document.getElementById('titemscomp');let tot=0;if(!itemsComp.length){tb.innerHTML='<tr><td colspan="5" style="text-align:center;padding:12px;color:#999">Agregá artículos</td></tr>';}else{tb.innerHTML=itemsComp.map((it,i)=>{tot+=it.sub;return '<tr><td>'+it.nom+'</td><td>'+it.cant+'</td><td>'+fmt(it.cos)+'</td><td>'+fmt(it.sub)+'</td><td><button class="btn br bsm" onclick="quitItemComp('+i+')">✕</button></td></tr>';}).join('');}document.getElementById('ctotal').textContent=fmt(tot);}
function quitItemComp(i){itemsComp.splice(i,1);renderItemsComp();}
function guardarCompra(){if(!itemsComp.length){toast('Agregá artículos','i');return;}const pid=parseInt(document.getElementById('cprov').value);const prov=DB.provs.find(p=>p.id===pid);const tot=itemsComp.reduce((s,i)=>s+i.sub,0);const comp={id:nid('comp'),fecha:document.getElementById('cfecha').value,provid:pid,provnom:prov?prov.nom:'-',nro:document.getElementById('cnro').value,items:[...itemsComp],total:tot};itemsComp.forEach(it=>{const art=DB.arts.find(a=>a.id===it.aid);if(art){art.stk=(art.stk||0)+it.cant;art.cos=it.cos;}});DB.comps.push(comp);saveDB();cerrar('m-compra');renderComps();}
async function delComp(id){if(!await confirmar('¿Eliminás esta compra?'))return;DB.comps=DB.comps.filter(c=>c.id!==id);saveDB();renderComps();}

// ═══════════════════════ VENTAS ═══════════════════════
let ticket=[];
let ventaActual=null;
let _bloqCobro=false;
let _filaSelPV=-1;

function getPrecio(art,lista,cant){if(cant>=art.cm)return (art.um===0&&art.pm)?art.pm:pxc(art.cos,art.um);if(lista==='lista2')return (art.u2===0&&art.p2)?art.p2:pxc(art.cos,art.u2);if(lista==='lista3')return (art.u3===0&&art.p3)?art.p3:pxc(art.cos,art.u3);if(lista==='mayor')return (art.um===0&&art.pm)?art.pm:pxc(art.cos,art.um);return (art.u1===0&&art.p1)?art.p1:pxc(art.cos,art.u1);}

function renderVentas(){
  const sc=document.getElementById('pvcli');sc.innerHTML='<option value="">Consumidor Final</option>'+DB.clis.map(c=>'<option value="'+c.id+'">'+c.nom+'</option>').join('');
  sc.onchange=function(){const c=DB.clis.find(x=>x.id==this.value);if(c)document.getElementById('pvlista').value=c.lista||'lista1';};
  renderPVArts();renderHist();
  setTimeout(function(){const b=document.getElementById('pvbus');if(b)b.focus();},100);
}
let _pvArts = null; // lista filtrada actual del PV

function renderPVArts(lista){
  _pvArts = lista !== undefined ? lista : DB.arts;
  const arts = _pvArts;
  const L=document.getElementById('pvlista').value;
  const tb=document.getElementById('tpvart');
  const pgEl=document.getElementById('pg-pv');
  if(!arts.length){tb.innerHTML='<tr><td colspan="5"><div class="vacio"><div class="vi">📦</div><p>Sin artículos</p></div></td></tr>';if(pgEl)pgEl.innerHTML='';_filaSelPV=-1;return;}
  const pg=paginar('pv',arts,20);
  tb.innerHTML=pg.slice.map(function(a,idx){
    return '<tr id="pvrow-'+idx+'" class="pvfila" style="cursor:pointer" onclick="addTicket('+a.id+')" onmouseover="resaltarFila('+idx+')"><td><span class="bdg bv2">'+a.cod+'</span></td><td>'+a.nom+'</td><td><span class="bdg '+(a.stk>0?'bv2':'br2')+'">'+a.stk+'</span></td><td class="tv">'+fmt(getPrecio(a,L,1))+'</td><td><button class="btn bv bsm" onclick="event.stopPropagation();addTicket('+a.id+')">➕</button></td></tr>';
  }).join('');
  if(pgEl)pgEl.innerHTML=pg.nav;
  _filaSelPV=-1;
}
_pgRender['pv'] = function(){ renderPVArts(_pvArts); };
function filtPV(){_filaSelPV=-1;_pags['pv']=1;const q=document.getElementById('pvbus').value.toLowerCase();renderPVArts(DB.arts.filter(a=>a.nom.toLowerCase().includes(q)||a.cod.toLowerCase().includes(q)));}
function refrescaPV(){renderPVArts();recalc();}
function limpiaPV(){document.getElementById('pvbus').value='';_pags['pv']=1;renderPVArts();document.getElementById('pvbus').focus();}
function pvEnter(){
  const q=document.getElementById('pvbus').value.trim();
  if(!q){if(ticket.length>0&&!_bloqCobro)iniciarCobro();return;}
  // Codigo "1" = articulo generico con precio manual
  if(q==='1'){limpiaPV();abrirGenerico();return;}

  // Detectar codigo de balanza Systel (empieza con 2, 13 digitos)
  if(q.length===13 && q.startsWith('2')){
    const plu = String(parseInt(q.substring(1,6)));  // extraer PLU sin ceros
    const precioRaw = parseInt(q.substring(7,12));   // extraer precio (5 digitos)
    const precio = precioRaw;                        // precio directo sin division
    // Buscar articulo por PLU ignorando ceros del principio
    const artBalanza = DB.arts.find(function(a){
      return parseInt(a.cod) === parseInt(plu) || parseInt(a.cod) === parseInt(q.substring(1,6));
    });
    if(artBalanza){
      // Agregar al ticket con el precio de la balanza
      ticket.push({aid:artBalanza.id, nom:artBalanza.nom, cant:1, precio:precio, esMayor:false, manual:true, balanza:true});
      document.getElementById('pvbus').value='';
      renderPVArts();
      renderTicket();
      _bloqCobro=true;
      setTimeout(function(){_bloqCobro=false;var b=document.getElementById('pvbus');if(b)b.focus();},600);
      return;
    }
  }

  // Busqueda normal - ignorar ceros del principio para comparar codigos
  const qNum = parseInt(q) || 0;
  let art = DB.arts.find(function(a){
    return a.cod.toLowerCase()===q.toLowerCase() || parseInt(a.cod)===qNum;
  });
  if(!art){
    const m=DB.arts.filter(function(a){
      return a.nom.toLowerCase().includes(q.toLowerCase()) ||
             a.cod.toLowerCase().includes(q.toLowerCase()) ||
             (qNum && parseInt(a.cod)===qNum);
    });
    if(m.length===1) art=m[0];
    else if(m.length>1){renderPVArts(m);return;}
  }
  if(art){
    addTicket(art.id);
    document.getElementById('pvbus').value='';
    renderPVArts();
    _bloqCobro=true;
    setTimeout(function(){
      _bloqCobro=false;
      var b=document.getElementById('pvbus');
      if(b){b.focus();}
    },600);
  } else {
    document.getElementById('pvbus').style.borderColor='var(--rojo)';
    setTimeout(function(){document.getElementById('pvbus').style.borderColor='';},1000);
  }
}
function addTicket(id){
  const art=DB.arts.find(a=>a.id===id);if(!art)return;
  if(art.usastk!=='no'&&art.stk<=0){toast('Sin stock: '+art.nom,'r');return;}
  const L=document.getElementById('pvlista').value;
  const ex=ticket.find(i=>i.aid===id);
  if(ex){ex.cant++;ex.precio=getPrecio(art,L,ex.cant);ex.esMayor=ex.cant>=art.cm;}
  else ticket.push({aid:id,nom:art.nom,cant:1,precio:getPrecio(art,L,1),esMayor:false,manual:false});
  limpiaPV();renderTicket();
}
function addGenerico(){
  const p=parseFloat(document.getElementById('gpre').value);
  if(isNaN(p)||p<=0){document.getElementById('gpre').style.borderColor='var(--rojo)';setTimeout(function(){document.getElementById('gpre').style.borderColor='';},1000);return;}
  const nom=document.getElementById('gnom').value.trim()||'Artículo manual';
  ticket.push({aid:null,nom,cant:1,precio:p,esMayor:false,manual:true});
  cerrar('m-gen');
  document.getElementById('gnom').value='';
  document.getElementById('gpre').value='';
  renderTicket();
  // Delay para evitar que el Enter del precio dispare el cobro al volver al buscador
  setTimeout(function(){document.getElementById('pvbus').focus();},200);
}
function abrirGenerico(){abrir('m-gen');setTimeout(function(){document.getElementById('gnom').focus();},100);}
function renderTicket(){
  const vac=document.getElementById('tvacio'),cont=document.getElementById('tcont');
  if(!ticket.length){vac.style.display='block';cont.style.display='none';document.getElementById('tcnt').textContent='';return;}
  vac.style.display='none';cont.style.display='block';
  document.getElementById('tcnt').textContent='('+ticket.reduce(function(s,i){return s+i.cant;},0)+' productos)';
  const L=document.getElementById('pvlista').value;
  ticket.forEach(function(it){if(!it.manual){const art=DB.arts.find(a=>a.id===it.aid);if(art){it.precio=getPrecio(art,L,it.cant);it.esMayor=it.cant>=art.cm;}}});
  document.getElementById('titems').innerHTML=ticket.map(function(it,i){
    return '<div class="titem"><span class="tnm">'+it.nom+(it.esMayor?' <span style="font-size:9px;background:var(--tierra);color:white;border-radius:3px;padding:1px 4px">MAYOR</span>':'')+'</span><span class="tct"><button class="bmenos" onclick="chgCant('+i+',-1)">−</button>'+it.cant+'<button class="bmas" onclick="chgCant('+i+',1)">+</button></span><span class="tpr">'+fmt(it.precio*it.cant)+'</span></div>';
  }).join('');
  recalc();
}
function chgCant(i,d){
  ticket[i].cant+=d;
  if(ticket[i].cant<=0)ticket.splice(i,1);
  else if(!ticket[i].manual){const art=DB.arts.find(a=>a.id===ticket[i].aid);if(art){const L=document.getElementById('pvlista').value;ticket[i].precio=getPrecio(art,L,ticket[i].cant);ticket[i].esMayor=ticket[i].cant>=art.cm;}}
  renderTicket();
}
function recalc(){
  const sub=ticket.reduce(function(s,it){return s+it.precio*it.cant;},0);
  const desc=parseFloat(document.getElementById('tdesc').value)||0;
  const tot=sub*(1-desc/100);
  document.getElementById('tsub').textContent=fmt(sub);
  document.getElementById('ttot2').textContent=fmt(tot);
}
function selPago(t){
  document.getElementById('tpago').value=t;
  document.querySelectorAll('.bpago').forEach(function(b){b.classList.remove('act');});
  const bid=t==='Cuenta Corriente'?'pg-CuentaCorriente':'pg-'+t;
  const el=document.getElementById(bid);if(el)el.classList.add('act');
}
async function nuevaVenta(){
  if(ticket.length>0&&!await confirmar('¿Cancelás la venta actual?'))return;
  ticket=[];renderTicket();limpiaPV();
  document.getElementById('tdesc').value=0;document.getElementById('pvcli').value='';document.getElementById('pvlista').value='lista1';
  selPago('Efectivo');renderPVArts();
}
async function cancelarTicket(){if(ticket.length>0&&!await confirmar('¿Cancelás el ticket?'))return;ticket=[];renderTicket();limpiaPV();}
function iniciarCobro(){
  if(!ticket.length)return;
  const desc=parseFloat(document.getElementById('tdesc').value)||0;
  const sub=ticket.reduce(function(s,it){return s+it.precio*it.cant;},0);
  const tot=sub*(1-desc/100);
  const pago=document.getElementById('tpago').value;
  if(pago!=='Efectivo'){cobrarVenta();return;}
  document.getElementById('cobrotot').textContent=fmt(tot);
  document.getElementById('cobrorec').value='';
  document.getElementById('cobrovuelto').style.display='none';
  document.getElementById('cobrosin').style.display='block';
  abrir('m-cobro');setTimeout(function(){document.getElementById('cobrorec').focus();},120);
}
function calcVuelto(){
  const desc=parseFloat(document.getElementById('tdesc').value)||0;
  const sub=ticket.reduce(function(s,it){return s+it.precio*it.cant;},0);
  const tot=sub*(1-desc/100);
  const rec=parseFloat(document.getElementById('cobrorec').value)||0;
  if(rec>0){
    const v=rec-tot;
    document.getElementById('cobrosin').style.display='none';
    document.getElementById('cobrovuelto').style.display='block';
    document.getElementById('cobrovmonto').textContent=v<0?'⚠️ Falta '+fmt(Math.abs(v)):fmt(v);
    document.getElementById('cobrovmonto').style.color=v<0?'var(--rojo)':'var(--tierra)';
  }else{document.getElementById('cobrosin').style.display='block';document.getElementById('cobrovuelto').style.display='none';}
}
function confirmarCobro(){cerrar('m-cobro');cobrarVenta();}
function cobrarVenta(){
  if(!ticket.length)return;
  const desc=parseFloat(document.getElementById('tdesc').value)||0;
  const sub=ticket.reduce(function(s,it){return s+it.precio*it.cant;},0);
  const tot=sub*(1-desc/100);
  const cliid=document.getElementById('pvcli').value;
  const cli=DB.clis.find(c=>c.id==cliid);
  const lista=document.getElementById('pvlista').value;
  const pago=document.getElementById('tpago').value;
  ticket.forEach(function(it){if(it.aid){const art=DB.arts.find(a=>a.id===it.aid);if(art)art.stk=Math.max(0,art.stk-it.cant);}});
  const v={id:nid('venta'),fecha:hoy(),hora:hora(),cliid:cliid||null,clinom:cli?cli.nom:'Consumidor Final',lista,listaNom:lnom[lista]||lista,items:ticket.map(function(it){return Object.assign({},it);}),sub,desc,total:tot,pago};
  DB.ventas.push(v);
  if(pago!=='Cuenta Corriente')DB.caja.push({id:nid('caja'),fecha:hoy(),hora:hora(),tipo:'venta',desc:'Venta #'+v.id+' - '+v.clinom,monto:tot});
  saveDB();
  const tf=fmt(tot);ticket=[];renderTicket();limpiaPV();
  document.getElementById('tdesc').value=0;document.getElementById('pvcli').value='';document.getElementById('pvlista').value='lista1';
  selPago('Efectivo');renderHist();renderPVArts();
  toast('✅ Venta registrada — Total: '+tf,'v');
}
function renderHist(){
  const tb=document.getElementById('thist');
  const pgEl=document.getElementById('pg-hist');
  const items=[...DB.ventas].reverse();
  if(!items.length){tb.innerHTML='<tr><td colspan="6"><div class="vacio"><div class="vi">📋</div><p>Sin ventas</p></div></td></tr>';if(pgEl)pgEl.innerHTML='';return;}
  const {slice,nav}=paginar('hist',items);
  tb.innerHTML=slice.map(function(v){return '<tr><td>#'+v.id+'</td><td>'+fleg(v.fecha)+' '+(v.hora||'')+'</td><td>'+v.clinom+'</td><td class="tv">'+fmt(v.total)+'</td><td><span class="bdg bt2">'+v.pago+'</span></td><td><button class="btn bg bsm" onclick="verVenta('+v.id+')">👁️</button></td></tr>';}).join('');
  if(pgEl)pgEl.innerHTML=nav;
}
_pgRender['hist'] = renderHist;
function verVenta(id){
  ventaActual=DB.ventas.find(function(x){return x.id===id;});if(!ventaActual)return;
  const v=ventaActual;
  let rows='';v.items.forEach(function(it){rows+='<tr><td>'+it.nom+'</td><td>'+it.cant+'</td><td>'+fmt(it.precio)+'</td><td>'+fmt(it.precio*it.cant)+'</td></tr>';});
  document.getElementById('dventa').innerHTML='<div style="background:var(--crema);border-radius:10px;padding:14px;font-size:13px"><div style="display:flex;justify-content:space-between;margin-bottom:10px"><div><strong>Venta #'+v.id+'</strong><br>'+fleg(v.fecha)+' '+(v.hora||'')+'</div><div style="text-align:right"><strong>Cliente:</strong> '+v.clinom+'<br><span class="bdg bv2">'+(v.listaNom||v.lista)+'</span></div></div><div class="twrap"><table><thead><tr><th>Artículo</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>'+rows+'</tbody></table></div><div style="margin-top:10px;text-align:right">Subtotal: '+fmt(v.sub)+(v.desc?'<br>Descuento: '+v.desc+'%':'')+'<div style="font-size:20px;font-weight:700;color:var(--verde);font-family:Fraunces,serif">TOTAL: '+fmt(v.total)+'</div>Pago: <strong>'+v.pago+'</strong></div></div>';
  abrir('m-vventa');
}
function imprimirTicket(){
  if(!ventaActual)return;const v=ventaActual;
  let items='';v.items.forEach(function(it){items+='<div>'+it.nom+'<br>  '+it.cant+' x '+fmt(it.precio)+' = '+fmt(it.precio*it.cant)+'</div>';});
  const w=window.open('','_blank','width=400,height=600');
  w.document.write('<!DOCTYPE html><html><head><title>Ticket #'+v.id+'</title><style>body{font-family:monospace;font-size:13px;padding:18px;max-width:300px}h2{text-align:center}hr{border:1px dashed #999}.tot{font-size:15px;font-weight:bold}</style></head><body><h2>Almacen Natural</h2><hr><p>Ticket #'+v.id+' - '+fleg(v.fecha)+'</p><p>Cliente: '+v.clinom+'</p><hr>'+items+'<hr>'+(v.desc?'<p>Descuento: '+v.desc+'%</p>':'')+'<p class="tot">TOTAL: '+fmt(v.total)+'</p><p>Pago: '+v.pago+'</p><hr><p style="text-align:center">Gracias!</p></body></html>');
  w.print();
}

// CAJA
function renderCaja(){
  const mhoy=DB.caja.filter(function(m){return m.fecha===hoy();});
  const venHoy=mhoy.filter(function(m){return m.tipo==='venta';}).reduce(function(s,m){return s+m.monto;},0);
  const ingEx=mhoy.filter(function(m){return m.tipo==='entrada';}).reduce(function(s,m){return s+m.monto;},0);
  const salEx=mhoy.filter(function(m){return m.tipo==='salida';}).reduce(function(s,m){return s+m.monto;},0);
  const tot=venHoy+ingEx-salEx;
  document.getElementById('cajres').innerHTML='<div class="cajcard"><div class="cajmnt tv">'+fmt(venHoy)+'</div><div class="cajlbl">Ventas de hoy</div></div><div class="cajcard"><div class="cajmnt" style="color:var(--verde-claro)">'+fmt(ingEx)+'</div><div class="cajlbl">Ingresos extra</div></div><div class="cajcard"><div class="cajmnt tr2">'+fmt(salEx)+'</div><div class="cajlbl">Egresos</div></div><div class="cajcard" style="background:var(--verde-suave)"><div class="cajmnt tv">'+fmt(tot)+'</div><div class="cajlbl">Total en Caja</div></div>';
  const tb=document.getElementById('tcajmov');
  const mr=[...DB.caja].filter(function(m){return m.fecha===hoy();}).reverse();
  if(!mr.length){tb.innerHTML='<tr><td colspan="4"><div class="vacio"><div class="vi">🏦</div><p>Sin movimientos hoy</p></div></td></tr>';}
  else tb.innerHTML=mr.map(function(m){return '<tr><td>'+(m.hora||'-')+'</td><td><span class="bdg '+(m.tipo==='salida'?'br2':'bv2')+'">'+m.tipo+'</span></td><td>'+m.desc+'</td><td class="'+(m.tipo==='salida'?'tr2':'tv')+'">'+(m.tipo==='salida'?'-':'')+fmt(m.monto)+'</td></tr>';}).join('');
}
function regMovCaja(){
  const tipo=document.getElementById('cajt').value;
  const monto=parseFloat(document.getElementById('cajm').value);
  const desc=document.getElementById('cajd').value.trim();
  if(isNaN(monto)||monto<=0){toast('Monto inválido','a');return;}
  DB.caja.push({id:nid('caja'),fecha:hoy(),hora:hora(),tipo,desc:desc||tipo,monto});
  saveDB();document.getElementById('cajm').value='';document.getElementById('cajd').value='';renderCaja();
}

// ESTADISTICAS
function getFiltro(){
  const v=document.getElementById('sperio').value;const now=new Date();
  if(v==='hoy')return function(d){return d===hoy();};
  if(v==='semana'){const ini=new Date(now);ini.setDate(now.getDate()-now.getDay());const is=ini.toISOString().slice(0,10);return function(d){return d>=is;};}
  if(v==='mes'){const ms=now.toISOString().slice(0,7);return function(d){return d&&d.startsWith(ms);};}
  return function(){return true;};
}
function renderStats(){
  const f=getFiltro();
  const vf=DB.ventas.filter(function(v){return f(v.fecha);});
  const gf=DB.gastos.filter(function(g){return f(g.fecha);});
  const cf=DB.comps.filter(function(c){return f(c.fecha);});
  const tv=vf.reduce(function(s,v){return s+v.total;},0);
  const tg=gf.reduce(function(s,g){return s+g.monto;},0);
  const tc=cf.reduce(function(s,c){return s+c.total;},0);
  const ut=tv-tg-tc;
  document.getElementById('sstats').innerHTML=
    '<div class="scard" style="cursor:pointer" onclick="verDetStats(\'ventas\')"><div class="snum">'+fmt(tv)+'</div><div class="slbl">Ventas (click)</div></div>'+
    '<div class="scard"><div class="snum">'+vf.length+'</div><div class="slbl">Tickets</div></div>'+
    '<div class="scard ti"><div class="snum">'+fmt(tg+tc)+'</div><div class="slbl">Egresos</div></div>'+
    '<div class="scard '+(ut>=0?'':'ro')+'"><div class="snum">'+fmt(ut)+'</div><div class="slbl">Utilidad neta</div></div>'+
    '<div class="scard am"><div class="snum">'+fmt(vf.length?tv/vf.length:0)+'</div><div class="slbl">Ticket promedio</div></div>';
  const c=document.getElementById('scons').value;
  const cont=document.getElementById('scont');
  if(c==='resumen')statsResumen(vf,gf,cf,cont);
  else if(c==='vart')statsVArt(vf,cont);
  else if(c==='vcli')statsVCli(vf,cont);
  else if(c==='vpago')statsVPago(vf,cont);
  else if(c==='vlista')statsVLista(vf,cont);
  else if(c==='gcat')statsGCat(gf,cont);
  else if(c==='cprov')statsCProv(cf,cont);
  else if(c==='inv')statsInv(cont);
  else if(c==='stk')statsStk(cont);
  else if(c==='rent')statsRent(vf,cont);
  else if(c==='evol')statsEvol(vf,cont);
}
function verDetStats(tipo){
  const f=getFiltro();const vf=DB.ventas.filter(function(v){return f(v.fecha);});
  if(tipo==='ventas'){
    let rows='';[...vf].reverse().forEach(function(v){rows+='<tr><td>'+fleg(v.fecha)+'</td><td>'+v.clinom+'</td><td class="tv">'+fmt(v.total)+'</td><td>'+v.pago+'</td></tr>';});
    abrirStats('Detalle de Ventas','<div class="twrap"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Total</th><th>Pago</th></tr></thead><tbody>'+rows+'</tbody></table></div>');
  }
}
function abrirStats(tit,html){document.getElementById('mstit').textContent=tit;document.getElementById('mscont').innerHTML=html;abrir('m-stats');}
function statsResumen(vf,gf,cf,cont){
  const cnt={},mon={};
  vf.forEach(function(v){v.items.forEach(function(it){cnt[it.nom]=(cnt[it.nom]||0)+it.cant;mon[it.nom]=(mon[it.nom]||0)+it.precio*it.cant;});});
  const top=Object.entries(cnt).sort(function(a,b){return b[1]-a[1];}).slice(0,5);
  const emos=['1.','2.','3.','4.','5.'];
  let th=top.length?top.map(function(x,i){return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0f0f0"><span>'+emos[i]+'</span><span style="flex:1;font-size:13px">'+x[0]+'</span><span class="bdg bv2">'+x[1]+' u.</span><span class="tv" style="font-size:12px">'+fmt(mon[x[0]])+'</span></div>';}).join(''):'<div class="vacio" style="padding:20px"><div class="vi">📦</div><p>Sin ventas</p></div>';
  const pags={};vf.forEach(function(v){pags[v.pago]=(pags[v.pago]||0)+v.total;});
  const tp=Object.values(pags).reduce(function(s,v){return s+v;},0);
  let ph=Object.keys(pags).length?Object.entries(pags).sort(function(a,b){return b[1]-a[1];}).map(function(x){const pct=tp?((x[1]/tp)*100).toFixed(1):0;return '<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px"><span>'+x[0]+'</span><span class="tv">'+fmt(x[1])+'</span></div><div style="background:#eee;border-radius:20px;height:6px"><div style="background:var(--verde-claro);border-radius:20px;height:6px;width:'+pct+'%"></div></div></div>';}).join(''):'<div class="vacio" style="padding:20px"><div class="vi">💳</div><p>Sin ventas</p></div>';
  const cats={};gf.forEach(function(g){cats[g.cat]=(cats[g.cat]||0)+g.monto;});
  const tg=Object.values(cats).reduce(function(s,v){return s+v;},0);
  let ch=Object.keys(cats).length?Object.entries(cats).sort(function(a,b){return b[1]-a[1];}).map(function(x){const pct=tg?((x[1]/tg)*100).toFixed(1):0;return '<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px"><span>'+x[0]+'</span><span class="tr2">'+fmt(x[1])+'</span></div><div style="background:#eee;border-radius:20px;height:6px"><div style="background:var(--rojo);border-radius:20px;height:6px;width:'+pct+'%;opacity:.7"></div></div></div>';}).join(''):'<div class="vacio" style="padding:20px"><div class="vi">📋</div><p>Sin gastos</p></div>';
  const sb=DB.arts.filter(function(a){return a.usastk!=='no'&&a.stk<=a.stkmin;});
  let sk=sb.length?sb.slice(0,4).map(function(a){return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px"><span>'+a.nom+'</span><span class="bdg '+(a.stk<=0?'br2':'ba2')+'">'+a.stk+'</span></div>';}).join(''):'<div class="alert av">Todo OK</div>';
  cont.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px"><div class="panel" style="cursor:pointer" onclick="document.getElementById(\'scons\').value=\'vart\';renderStats()"><div class="ptit" style="justify-content:space-between"><span>📦 Top Artículos</span><span style="font-size:11px;color:var(--gris);font-weight:400">ver detalle</span></div>'+th+'</div><div class="panel" style="cursor:pointer" onclick="document.getElementById(\'scons\').value=\'vpago\';renderStats()"><div class="ptit" style="justify-content:space-between"><span>💳 Ventas por Pago</span><span style="font-size:11px;color:var(--gris);font-weight:400">ver detalle</span></div>'+ph+'</div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:18px"><div class="panel" style="cursor:pointer" onclick="document.getElementById(\'scons\').value=\'gcat\';renderStats()"><div class="ptit" style="justify-content:space-between"><span>💸 Gastos por Categ.</span><span style="font-size:11px;color:var(--gris);font-weight:400">ver detalle</span></div>'+ch+'</div><div class="panel" style="cursor:pointer" onclick="document.getElementById(\'scons\').value=\'stk\';renderStats()"><div class="ptit" style="justify-content:space-between"><span>⚠️ Stock Bajo</span><span style="font-size:11px;color:var(--gris);font-weight:400">ver todo</span></div>'+sk+'</div></div>';
}
function statsVArt(vf,cont){
  const cnt={},mon={};vf.forEach(function(v){v.items.forEach(function(it){cnt[it.nom]=(cnt[it.nom]||0)+it.cant;mon[it.nom]=(mon[it.nom]||0)+it.precio*it.cant;});});
  const tot=Object.values(mon).reduce(function(s,v){return s+v;},0);
  const filas=Object.entries(cnt).sort(function(a,b){return b[1]-a[1];});
  if(!filas.length){cont.innerHTML='<div class="panel"><div class="ptit">📦 Ventas por Artículo</div><div class="vacio"><div class="vi">📦</div><p>Sin ventas</p></div></div>';return;}
  let rows='';filas.forEach(function(x,i){const pct=tot?((mon[x[0]]/tot)*100).toFixed(1):0;rows+='<tr><td>'+(i+1)+'</td><td><strong>'+x[0]+'</strong></td><td>'+x[1]+'</td><td class="tv">'+fmt(mon[x[0]])+'</td><td>'+pct+'%</td></tr>';});
  cont.innerHTML='<div class="panel"><div class="ptit">📦 Ventas por Artículo</div><div class="twrap"><table><thead><tr><th>#</th><th>Artículo</th><th>Unidades</th><th>Total</th><th>%</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}
function statsVCli(vf,cont){
  const d={};vf.forEach(function(v){const k=v.clinom||'Consumidor Final';if(!d[k])d[k]={tot:0,cnt:0};d[k].tot+=v.total;d[k].cnt++;});
  const filas=Object.entries(d).sort(function(a,b){return b[1].tot-a[1].tot;});
  if(!filas.length){cont.innerHTML='<div class="panel"><div class="ptit">👥 Ventas por Cliente</div><div class="vacio"><div class="vi">👥</div><p>Sin ventas</p></div></div>';return;}
  const tg=filas.reduce(function(s,x){return s+x[1].tot;},0);
  let rows='';filas.forEach(function(x,i){rows+='<tr><td>'+(i+1)+'</td><td><strong>'+x[0]+'</strong></td><td>'+x[1].cnt+'</td><td class="tv">'+fmt(x[1].tot)+'</td><td>'+(tg?((x[1].tot/tg)*100).toFixed(1):0)+'%</td></tr>';});
  cont.innerHTML='<div class="panel"><div class="ptit">👥 Ventas por Cliente</div><div class="twrap"><table><thead><tr><th>#</th><th>Cliente</th><th>Tickets</th><th>Total</th><th>%</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}
function statsVPago(vf,cont){
  const d={};vf.forEach(function(v){if(!d[v.pago])d[v.pago]={tot:0,cnt:0};d[v.pago].tot+=v.total;d[v.pago].cnt++;});
  const tot=Object.values(d).reduce(function(s,v){return s+v.tot;},0);
  if(!Object.keys(d).length){cont.innerHTML='<div class="panel"><div class="ptit">💳 Ventas por Pago</div><div class="vacio"><div class="vi">💳</div><p>Sin ventas</p></div></div>';return;}
  let rows='';Object.entries(d).sort(function(a,b){return b[1].tot-a[1].tot;}).forEach(function(x){const pct=tot?((x[1].tot/tot)*100).toFixed(1):0;rows+='<tr><td><strong>'+x[0]+'</strong></td><td>'+x[1].cnt+'</td><td class="tv">'+fmt(x[1].tot)+'</td><td>'+pct+'%</td></tr>';});
  cont.innerHTML='<div class="panel"><div class="ptit">💳 Ventas por Forma de Pago</div><div class="twrap"><table><thead><tr><th>Pago</th><th>Tickets</th><th>Total</th><th>%</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}
function statsVLista(vf,cont){
  const d={};vf.forEach(function(v){const k=v.listaNom||v.lista||'Sin lista';if(!d[k])d[k]={tot:0,cnt:0};d[k].tot+=v.total;d[k].cnt++;});
  if(!Object.keys(d).length){cont.innerHTML='<div class="panel"><div class="ptit">📋 Ventas por Lista</div><div class="vacio"><div class="vi">📋</div><p>Sin ventas</p></div></div>';return;}
  const tot=Object.values(d).reduce(function(s,v){return s+v.tot;},0);
  let rows='';Object.entries(d).sort(function(a,b){return b[1].tot-a[1].tot;}).forEach(function(x){rows+='<tr><td><span class="bdg bv2">'+x[0]+'</span></td><td>'+x[1].cnt+'</td><td class="tv">'+fmt(x[1].tot)+'</td><td>'+(tot?((x[1].tot/tot)*100).toFixed(1):0)+'%</td></tr>';});
  cont.innerHTML='<div class="panel"><div class="ptit">📋 Ventas por Lista</div><div class="twrap"><table><thead><tr><th>Lista</th><th>Tickets</th><th>Total</th><th>%</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}
function statsGCat(gf,cont){
  const d={};gf.forEach(function(g){if(!d[g.cat])d[g.cat]={tot:0,items:[]};d[g.cat].tot+=g.monto;d[g.cat].items.push(g);});
  if(!Object.keys(d).length){cont.innerHTML='<div class="panel"><div class="ptit">💸 Gastos por Categoría</div><div class="vacio"><div class="vi">💸</div><p>Sin gastos</p></div></div>';return;}
  const tot=Object.values(d).reduce(function(s,v){return s+v.tot;},0);
  const cats=Object.entries(d).sort(function(a,b){return b[1].tot-a[1].tot;});
  let html='<div class="panel"><div class="ptit">💸 Gastos por Categoría — Click para detalle</div>';
  cats.forEach(function(x,idx){const pct=tot?((x[1].tot/tot)*100).toFixed(1):0;html+='<div class="panel" data-gi="'+idx+'" style="cursor:pointer;margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><strong>'+x[0]+'</strong><div style="display:flex;gap:7px;align-items:center"><span class="tr2">'+fmt(x[1].tot)+'</span><span class="bdg bt2">'+pct+'%</span><span style="font-size:11px;color:var(--gris)">ver detalle</span></div></div><div style="background:#eee;border-radius:20px;height:6px"><div style="background:var(--rojo);border-radius:20px;height:6px;width:'+pct+'%;opacity:.7"></div></div></div>';});
  html+='</div>';cont.innerHTML=html;
  cont.querySelectorAll('[data-gi]').forEach(function(el){el.addEventListener('click',function(){const idx=parseInt(this.getAttribute('data-gi'));const x=cats[idx];if(!x)return;let rows='';x[1].items.forEach(function(g){rows+='<tr><td>'+fleg(g.fecha)+'</td><td>'+(g.desc||'-')+'</td><td>'+(g.met==='transferencia'?'Transf.':'Efectivo')+'</td><td class="tr2">'+fmt(g.monto)+'</td></tr>';});abrirStats('Gastos: '+x[0],'<div class="twrap"><table><thead><tr><th>Fecha</th><th>Desc.</th><th>Método</th><th>Monto</th></tr></thead><tbody>'+rows+'</tbody></table></div>');});});
}
function statsCProv(cf,cont){
  const d={};cf.forEach(function(c){const k=c.provnom||'Sin proveedor';if(!d[k])d[k]={tot:0,cnt:0,items:[]};d[k].tot+=c.total;d[k].cnt++;d[k].items.push(c);});
  if(!Object.keys(d).length){cont.innerHTML='<div class="panel"><div class="ptit">🚚 Compras por Proveedor</div><div class="vacio"><div class="vi">🚚</div><p>Sin compras</p></div></div>';return;}
  const provs=Object.entries(d).sort(function(a,b){return b[1].tot-a[1].tot;});
  let html='<div class="panel"><div class="ptit">🚚 Compras por Proveedor — Click para detalle</div>';
  provs.forEach(function(x,idx){html+='<div class="panel" data-pi="'+idx+'" style="cursor:pointer;margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center"><strong>'+x[0]+'</strong><div style="display:flex;gap:7px"><span>'+x[1].cnt+' compras</span><span class="tt2">'+fmt(x[1].tot)+'</span><span style="font-size:11px;color:var(--gris)">ver detalle</span></div></div></div>';});
  html+='</div>';cont.innerHTML=html;
  cont.querySelectorAll('[data-pi]').forEach(function(el){el.addEventListener('click',function(){const idx=parseInt(this.getAttribute('data-pi'));const x=provs[idx];if(!x)return;let rows='';x[1].items.forEach(function(c){rows+='<tr><td>'+fleg(c.fecha)+'</td><td>'+(c.nro||'-')+'</td><td class="tt2">'+fmt(c.total)+'</td></tr>';});abrirStats('Compras: '+x[0],'<div class="twrap"><table><thead><tr><th>Fecha</th><th>N° Fact.</th><th>Total</th></tr></thead><tbody>'+rows+'</tbody></table></div>');});});
}
function statsInv(cont){
  if(!DB.arts.length){cont.innerHTML='<div class="panel"><div class="ptit">📦 Inventario</div><div class="vacio"><div class="vi">📦</div><p>Sin artículos</p></div></div>';return;}
  let rows='';DB.arts.forEach(function(a){const sb=a.stk<=0?'br2':a.stk<=a.stkmin?'ba2':'bv2';const stb=a.usastk==='no'?'bt2':sb;const st=a.usastk==='no'?'Libre':a.stk<=0?'Sin stk':a.stk<=a.stkmin?'Bajo':'OK';rows+='<tr><td><span class="bdg bv2">'+a.cod+'</span></td><td><strong>'+a.nom+'</strong></td><td>'+(a.cat||'-')+'</td><td><span class="bdg '+sb+'">'+a.stk+' '+a.uni+'</span></td><td>'+a.stkmin+'</td><td><span class="bdg '+stb+'">'+st+'</span></td><td>'+fmt(a.cos)+'</td><td>'+fmt(pxc(a.cos,a.u1))+'</td><td>'+fmt(pxc(a.cos,a.u2))+'</td><td>'+fmt(pxc(a.cos,a.u3))+'</td><td class="tt2">'+fmt(pxc(a.cos,a.um))+'</td></tr>';});
  cont.innerHTML='<div class="panel"><div class="ptit">📦 Inventario Completo</div><div class="twrap"><table><thead><tr><th>Cod.</th><th>Artículo</th><th>Cat.</th><th>Stock</th><th>Min.</th><th>Estado</th><th>Costo</th><th>L1</th><th>L2</th><th>L3</th><th>Mayor</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}
function statsStk(cont){
  const arts=DB.arts.filter(function(a){return a.usastk!=='no'&&a.stk<=a.stkmin;});
  if(!arts.length){cont.innerHTML='<div class="panel"><div class="ptit">Stock Bajo</div><div class="alert av">Todo en orden</div></div>';return;}
  let rows='';arts.forEach(function(a){const p=DB.provs.find(function(x){return x.id==a.provid;});const sb=a.stk<=0?'br2':'ba2';rows+='<tr><td><strong>'+a.nom+'</strong></td><td><span class="bdg '+sb+'">'+a.stk+' '+a.uni+'</span></td><td>'+a.stkmin+'</td><td>'+(p?p.nom:'-')+'</td><td><span class="bdg '+sb+'">'+(a.stk<=0?'SIN STOCK':'BAJO')+'</span></td></tr>';});
  cont.innerHTML='<div class="panel"><div class="ptit">⚠️ Stock Bajo</div><div class="twrap"><table><thead><tr><th>Artículo</th><th>Stock</th><th>Min.</th><th>Proveedor</th><th>Estado</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}
function statsRent(vf,cont){
  const d={};vf.forEach(function(v){v.items.forEach(function(it){const art=DB.arts.find(function(a){return a.nom===it.nom;});if(!d[it.nom])d[it.nom]={u:0,ing:0,cos:0};d[it.nom].u+=it.cant;d[it.nom].ing+=it.precio*it.cant;d[it.nom].cos+=(art?art.cos:0)*it.cant;});});
  const filas=Object.entries(d).map(function(x){return{nom:x[0],u:x[1].u,ing:x[1].ing,cos:x[1].cos,gan:x[1].ing-x[1].cos,mar:x[1].ing?((x[1].ing-x[1].cos)/x[1].ing*100).toFixed(1):0};}).sort(function(a,b){return b.gan-a.gan;});
  if(!filas.length){cont.innerHTML='<div class="panel"><div class="ptit">Rentabilidad</div><div class="vacio"><div class="vi">💰</div><p>Sin ventas</p></div></div>';return;}
  let rows='';filas.forEach(function(f){const mb=parseFloat(f.mar)>30?'bv2':parseFloat(f.mar)>15?'ba2':'br2';rows+='<tr><td><strong>'+f.nom+'</strong></td><td>'+f.u+'</td><td class="tv">'+fmt(f.ing)+'</td><td class="tr2">'+fmt(f.cos)+'</td><td class="'+(f.gan>=0?'tv':'tr2')+'">'+fmt(f.gan)+'</td><td><span class="bdg '+mb+'">'+f.mar+'%</span></td></tr>';});
  cont.innerHTML='<div class="panel"><div class="ptit">💰 Rentabilidad por Artículo</div><div class="twrap"><table><thead><tr><th>Artículo</th><th>Unidades</th><th>Ingresos</th><th>Costo</th><th>Ganancia</th><th>Margen</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}
function statsEvol(vf,cont){
  const d={};vf.forEach(function(v){if(!d[v.fecha])d[v.fecha]={tot:0,cnt:0};d[v.fecha].tot+=v.total;d[v.fecha].cnt++;});
  const dias=Object.entries(d).sort(function(a,b){return a[0].localeCompare(b[0]);});
  if(!dias.length){cont.innerHTML='<div class="panel"><div class="ptit">Evolución Diaria</div><div class="vacio"><div class="vi">📅</div><p>Sin ventas</p></div></div>';return;}
  const mx=Math.max.apply(null,dias.map(function(x){return x[1].tot;}));
  let barras='';dias.forEach(function(x){const h=Math.max(20,(x[1].tot/mx)*120);barras+='<div style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:48px"><span style="font-size:10px;color:var(--verde);font-weight:600">'+fmt(x[1].tot)+'</span><div style="background:var(--verde-claro);border-radius:4px 4px 0 0;width:34px;height:'+h+'px"></div><span style="font-size:10px;color:var(--gris)">'+x[0].slice(8)+'</span></div>';});
  let rows='';dias.forEach(function(x){rows+='<tr><td>'+fleg(x[0])+'</td><td>'+x[1].cnt+'</td><td class="tv">'+fmt(x[1].tot)+'</td><td>'+fmt(x[1].cnt?x[1].tot/x[1].cnt:0)+'</td></tr>';});
  cont.innerHTML='<div class="panel"><div class="ptit">📅 Evolución Diaria</div><div style="overflow-x:auto;padding-bottom:7px"><div style="display:flex;align-items:flex-end;gap:7px;min-height:150px;padding:0 4px">'+barras+'</div></div><div class="twrap" style="margin-top:14px"><table><thead><tr><th>Fecha</th><th>Tickets</th><th>Total</th><th>Promedio</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}
function exportCSV(){const f=getFiltro();const vf=DB.ventas.filter(function(v){return f(v.fecha);});let csv='Fecha,Cliente,Lista,Total,Pago
';vf.forEach(function(v){csv+=v.fecha+',"'+v.clinom+'",'+(v.listaNom||v.lista)+','+v.total+','+v.pago+'
';});const b=new Blob([csv],{type:'text/csv'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download='ventas_'+hoy()+'.csv';a.click();URL.revokeObjectURL(u);}
function exportDetalle(){const t=document.querySelector('#mscont table');if(!t){toast('Sin tabla','a');return;}let csv='';t.querySelectorAll('tr').forEach(function(r){csv+=[...r.querySelectorAll('th,td')].map(function(c){return '"'+c.textContent.trim()+'"';}).join(',')+'
';});const b=new Blob([csv],{type:'text/csv'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download='detalle_'+hoy()+'.csv';a.click();URL.revokeObjectURL(u);}

// GASTOS
function renderGastos(){
  document.getElementById('gfecha').value=hoy();
  const tb=document.getElementById('tgastos');
  const pgEl=document.getElementById('pg-gastos');
  const items=[...DB.gastos].reverse();
  if(!items.length){tb.innerHTML='<tr><td colspan="7"><div class="vacio"><div class="vi">📋</div><p>Sin gastos</p></div></td></tr>';if(pgEl)pgEl.innerHTML='';return;}
  const {slice,nav}=paginar('gastos',items);
  tb.innerHTML=slice.map(function(g){const ef=g.met!=='transferencia';return '<tr><td>'+fleg(g.fecha)+'</td><td><span class="bdg bt2">'+g.cat+'</span></td><td>'+(g.desc||'-')+'</td><td><span class="bdg '+(ef?'bv2':'ba2')+'">'+(ef?'Efectivo':'Transferencia')+'</span></td><td class="tr2">'+fmt(g.monto)+'</td><td><span class="bdg '+(ef?'br2':'ba2')+'">'+(ef?'Descuenta':'No descuenta')+'</span></td><td><button class="btn br bsm" onclick="delGasto('+g.id+')">Del</button></td></tr>';}).join('');
  if(pgEl)pgEl.innerHTML=nav;
}
_pgRender['gastos'] = renderGastos;
function regGasto(){
  const monto=parseFloat(document.getElementById('gmonto').value);const fecha=document.getElementById('gfecha').value;const met=document.getElementById('gmet').value;
  if(isNaN(monto)||monto<=0){toast('Monto invalido','a');return;}
  const g={id:nid('gasto'),fecha,cat:document.getElementById('gcat').value,desc:document.getElementById('gdesc').value.trim(),met,monto};
  DB.gastos.push(g);
  if(met==='efectivo')DB.caja.push({id:nid('caja'),fecha,hora:hora(),tipo:'salida',desc:'Gasto: '+g.cat,monto});
  saveDB();document.getElementById('gmonto').value='';document.getElementById('gdesc').value='';renderGastos();
}
async function delGasto(id){
  if(!await confirmar('¿Eliminás este gasto?'))return;
  const g=DB.gastos.find(function(x){return x.id===id;});
  if(g)regBita('gasto_borrado','Gasto borrado: '+g.cat+' - '+(g.desc||'')+ ' del '+g.fecha,g);
  DB.gastos=DB.gastos.filter(function(g){return g.id!==id;});saveDB();renderGastos();
}

// CONTABILIDAD
function renderConta(){
  const mes=new Date().toISOString().slice(0,7);
  const vm=DB.ventas.filter(function(v){return v.fecha&&v.fecha.startsWith(mes);});
  const gm=DB.gastos.filter(function(g){return g.fecha&&g.fecha.startsWith(mes);});
  const cm=DB.comps.filter(function(c){return c.fecha&&c.fecha.startsWith(mes);});
  const tv=vm.reduce(function(s,v){return s+v.total;},0);
  const tg=gm.reduce(function(s,g){return s+g.monto;},0);
  const tc=cm.reduce(function(s,c){return s+c.total;},0);
  const bal=tv-tg-tc;
  document.getElementById('sconta').innerHTML='<div class="scard"><div class="snum">'+fmt(tv)+'</div><div class="slbl">Ingresos del mes</div></div><div class="scard ti"><div class="snum">'+fmt(tg+tc)+'</div><div class="slbl">Egresos del mes</div></div><div class="scard '+(bal>=0?'':'ro')+'"><div class="snum">'+fmt(bal)+'</div><div class="slbl">Balance neto</div></div><div class="scard am"><div class="snum">'+fmt(tc)+'</div><div class="slbl">Compras del mes</div></div>';
  let vi='<div style="font-size:13px;padding:5px 0;border-bottom:1px solid #eee">Ventas: <strong class="tv">'+fmt(tv)+'</strong></div>';
  vm.forEach(function(v){vi+='<div style="font-size:12px;color:#666;padding:2px 0">#'+v.id+' '+fleg(v.fecha)+' - '+fmt(v.total)+'</div>';});
  document.getElementById('cingresos').innerHTML=vi;
  let eg='<div style="font-size:13px;padding:5px 0;border-bottom:1px solid #eee">Compras: <strong class="tr2">'+fmt(tc)+'</strong></div><div style="font-size:13px;padding:5px 0;border-bottom:1px solid #eee">Gastos: <strong class="tr2">'+fmt(tg)+'</strong></div>';
  gm.forEach(function(g){eg+='<div style="font-size:12px;color:#666;padding:2px 0">'+g.cat+' - '+fmt(g.monto)+'</div>';});
  document.getElementById('cegresos').innerHTML=eg;
  document.getElementById('cbalance').innerHTML='<div style="background:'+(bal>=0?'var(--verde-suave)':'#fde8e8')+';border-radius:10px;padding:14px;text-align:center"><div style="font-family:Fraunces,serif;font-size:26px;font-weight:700;color:'+(bal>=0?'var(--verde)':'var(--rojo)')+'">'+fmt(bal)+'</div><div style="font-size:13px;color:var(--gris);margin-top:3px">'+(bal>=0?'Balance positivo':'Balance negativo')+'</div></div>';
  const todos=[...vm.map(function(v){return{fecha:v.fecha,tipo:'Venta',desc:'#'+v.id+' '+v.clinom,debe:0,haber:v.total};}), ...cm.map(function(c){return{fecha:c.fecha,tipo:'Compra',desc:(c.provnom||'-'),debe:c.total,haber:0};}), ...gm.map(function(g){return{fecha:g.fecha,tipo:'Gasto',desc:g.cat,debe:g.monto,haber:0};})].sort(function(a,b){return a.fecha.localeCompare(b.fecha);});
  let saldo=0;const td=document.getElementById('tdiario');
  if(!todos.length){td.innerHTML='<tr><td colspan="6"><div class="vacio"><div class="vi">📒</div><p>Sin movimientos</p></div></td></tr>';return;}
  const pgElD=document.getElementById('pg-diario');
  const {slice:sliceDiario,nav:navDiario}=paginar('diario',todos);
  sliceDiario.forEach(function(m){saldo+=m.haber-m.debe;});
  // recalcular saldo desde el inicio de la página
  let saldoBase=0;
  todos.slice(0,((_pags['diario']||1)-1)*PG_SIZE).forEach(function(m){saldoBase+=m.haber-m.debe;});
  let saldoPag=saldoBase;
  td.innerHTML=sliceDiario.map(function(m){saldoPag+=m.haber-m.debe;return '<tr><td>'+fleg(m.fecha)+'</td><td>'+m.tipo+'</td><td>'+m.desc+'</td><td class="'+(m.debe?'tr2':'')+'">'+( m.debe?fmt(m.debe):'-')+'</td><td class="'+(m.haber?'tv':'')+'">'+( m.haber?fmt(m.haber):'-')+'</td><td class="'+(saldoPag>=0?'tv':'tr2')+'">'+fmt(saldoPag)+'</td></tr>';}).join('');
  if(pgElD)pgElD.innerHTML=navDiario;
}

// TECLADO - atajos dentro de cada modulo
document.addEventListener('keydown',function(e){
  if(document.querySelector('.moverlay.open'))return;
  const enI=['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName);
  const mod=function(id){return !!document.querySelector('#mod-'+id+'.activo');};

  // Atajos globales de navegacion (sin F keys - solo con mouse)
  // F12 = precio manual en ventas (unico global)
  if(e.key==='F12'){e.preventDefault();if(mod('ventas'))abrirGenerico();return;}

  // Atajos dentro de ARTICULOS
  if(mod('articulos')){
    if(e.key==='F2'){e.preventDefault();abrirArt();}           // F2 = Nuevo articulo
    else if(e.key==='F3'&&!enI){e.preventDefault();document.getElementById('bart').focus();}  // F3 = Buscar
    return;
  }
  // Atajos dentro de PROVEEDORES
  if(mod('proveedores')){
    if(e.key==='F2'){e.preventDefault();abrirProv();}
    else if(e.key==='F3'&&!enI){e.preventDefault();document.getElementById('bprov').focus();}
    return;
  }
  // Atajos dentro de CLIENTES
  if(mod('clientes')){
    if(e.key==='F2'){e.preventDefault();abrirCli();}
    else if(e.key==='F3'&&!enI){e.preventDefault();document.getElementById('bcli').focus();}
    return;
  }
  // Atajos dentro de USUARIOS
  if(mod('usuarios')){
    if(e.key==='F2'){e.preventDefault();abrirUsr();}
    return;
  }
  // Atajos dentro de COMPRAS
  if(mod('compras')){
    if(e.key==='F2'){e.preventDefault();abrirCompra();}
    return;
  }
  // Atajos dentro de GASTOS
  if(mod('gastos')){
    if(e.key==='F4'){e.preventDefault();regGasto();}           // F4 = Registrar gasto
    else if(e.key==='F3'&&!enI){e.preventDefault();document.getElementById('gdesc').focus();}
    return;
  }
  // Atajos dentro de CAJA
  if(mod('caja')){
    if(e.key==='F4'){e.preventDefault();regMovCaja();}         // F4 = Registrar movimiento
    return;
  }
  // Atajos dentro de VENTAS
  if(mod('ventas')){
    if(e.key==='F2'){e.preventDefault();nuevaVenta();}         // F2 = Nueva venta
    else if(e.key==='F3'){e.preventDefault();const b=document.getElementById('pvbus');if(b)b.focus();}  // F3 = Foco buscador
    else if(e.key==='F4'){e.preventDefault();iniciarCobro();}  // F4 = Cobrar
    else if(e.key==='Enter'){
      const bus=document.getElementById('pvbus');
      // Primero verificar si hay fila seleccionada - tiene prioridad sobre cobro
      if(_filaSelPV>=0){e.preventDefault();seleccionarFilaPV();return;}
      if(bus&&document.activeElement===bus&&bus.value.trim()===''&&ticket.length>0&&!_bloqCobro){e.preventDefault();iniciarCobro();}
    }
    else if(e.key==='Escape'){limpiaPV();_filaSelPV=-1;}
    else if(e.key==='ArrowDown'){e.preventDefault();navegarPV(1);}
    else if(e.key==='ArrowUp'){e.preventDefault();navegarPV(-1);}
    else if(!enI&&e.key==='+'){if(ticket.length>0)chgCant(ticket.length-1,1);}
    else if(!enI&&e.key==='-'){if(ticket.length>0)chgCant(ticket.length-1,-1);}
    return;
  }
  // Atajos dentro de ESTADISTICAS
  if(mod('estadisticas')){
    if(e.key==='F3'){e.preventDefault();renderStats();}        // F3 = Actualizar
    return;
  }
  // Atajos dentro de ASISTENTE
  if(mod('asistente')){
    if(e.key==='Enter'&&document.activeElement.id==='chat-input'){e.preventDefault();enviarChat();}
    return;
  }
});


// =================== BITACORA ===================
function regBita(tipo, detalle, data) {
  if(!DB.bitacora) DB.bitacora = [];
  DB.bitacora.unshift({
    id: Date.now(),
    fecha: hoy(),
    hora: hora(),
    tipo: tipo,
    detalle: detalle,
    data: data ? JSON.stringify(data).slice(0,200) : '',
    estado: data && data.total ? 'COBRADA $'+data.total : (data && data.monto ? 'MONTO $'+data.monto : 'registro')
  });
  if(DB.bitacora.length > 500) DB.bitacora = DB.bitacora.slice(0,500);
  saveDB();
}
function renderBitacora() {
  const usr = DB.usrs.find(u => u.id === (DB.usuarioActual || 1));
  const esAdmin = !usr || usr.rol === 'Administrador';
  document.getElementById('bita-acceso-denegado').style.display = esAdmin ? 'none' : 'block';
  document.getElementById('bita-contenido').style.display = esAdmin ? 'block' : 'none';
  if(!esAdmin) return;
  if(!DB.bitacora) DB.bitacora = [];
  const filtro = document.getElementById('bita-filtro').value;
  const lista = filtro === 'todo' ? DB.bitacora : DB.bitacora.filter(function(b){return b.tipo===filtro;});
  const tb = document.getElementById('tbita');
  if(!lista.length){tb.innerHTML='<tr><td colspan="5"><div class="vacio"><div class="vi">📋</div><p>Sin eventos registrados</p></div></td></tr>';return;}
  const tipos = {
    'venta_borrada':'🗑️ Venta borrada','gasto_borrado':'🗑️ Gasto borrado',
    'art_borrado':'🗑️ Artículo borrado','comp_borrada':'🗑️ Compra borrada'
  };
  const pgEl=document.getElementById('pg-bita');
  const {slice,nav}=paginar('bita',lista);
  tb.innerHTML = slice.map(function(b){
    return '<tr><td>'+b.fecha+' '+b.hora+'</td><td><span class="bdg br2">'+(tipos[b.tipo]||b.tipo)+'</span></td><td style="font-size:12px">'+b.detalle+'</td><td>Admin</td><td><span class="bdg ba2">'+b.estado+'</span></td></tr>';
  }).join('');
  if(pgEl)pgEl.innerHTML=nav;
}
_pgRender['bita'] = renderBitacora;

// =================== IMPORTAR / EXPORTAR ===================
function renderImportar() {}

function exportarArticulosCSV() {
  const cols = ['codigo','nombre','categoria','unidad','proveedor','stock','stock_minimo','control_stock','costo','util_lista1','util_lista2','util_lista3','util_mayor','cant_mayor'];
  let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="UTF-8"></head><body><table>';
  html += '<tr>' + cols.map(function(c){return '<th style="background:#2d6a4f;color:white;font-weight:bold;padding:5px">'+c+'</th>';}).join('') + '</tr>';
  DB.arts.forEach(function(a) {
    const prov = DB.provs.find(function(p){return p.id==a.provid;});
    const vals = [a.cod, a.nom, a.cat||'', a.uni||'Unidad', prov?prov.nom:'', a.stk||0, a.stkmin||0, a.usastk||'si', a.cos||0, a.u1||0, a.u2||0, a.u3||0, a.um||0, a.cm||2];
    html += '<tr>' + vals.map(function(v){return '<td>'+v+'</td>';}).join('') + '</tr>';
  });
  html += '</table></body></html>';
  const b = new Blob([html],{type:'application/vnd.ms-excel;charset=utf-8'});
  const u = URL.createObjectURL(b);
  const a = document.createElement('a');
  a.href=u; a.download='articulos_almacen_'+hoy()+'.xls'; a.click();
  URL.revokeObjectURL(u);
}

function descargarPlantilla() {
  const cols = ['codigo','nombre','categoria','unidad','proveedor','stock','stock_minimo','control_stock','costo','util_lista1','util_lista2','util_lista3','util_mayor','cant_mayor'];
  const ejemplo = ['ART001','Arroz integral 1kg','Cereales','Kg','Proveedor Ejemplo','50','5','si','1200','30','25','20','15','2'];
  let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="UTF-8"></head><body><table>';
  html += '<tr>' + cols.map(function(c){return '<th style="background:#2d6a4f;color:white;font-weight:bold;padding:5px">'+c+'</th>';}).join('') + '</tr>';
  html += '<tr>' + ejemplo.map(function(v){return '<td>'+v+'</td>';}).join('') + '</tr>';
  html += '</table></body></html>';
  const b = new Blob([html],{type:'application/vnd.ms-excel;charset=utf-8'});
  const u = URL.createObjectURL(b);
  const a = document.createElement('a');
  a.href=u; a.download='plantilla_articulos.xls'; a.click();
  URL.revokeObjectURL(u);
}

function importarCSV() {
  const file = document.getElementById('csv-file').files[0];
  if(!file){toast('Seleccioná un archivo CSV','a');return;}
  const modo = document.getElementById('csv-modo').value;
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result.replace(/^﻿/,'');
    const lines = text.split('
').map(function(l){return l.trim();}).filter(Boolean);
    if(lines.length < 2){
      document.getElementById('csv-resultado').innerHTML='<div class="alert ar">El archivo no tiene datos.</div>';
      return;
    }
    // Parsear CSV respetando comillas
        const sep = lines[0].includes(';') ? ';' : ',';
    function parseCSVLine(line) {
      const result=[]; let cur=''; let inQ=false;
      for(let i=0;i<line.length;i++){
        const c=line[i];
        if(c==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++;}else{inQ=!inQ;}}
        else if(c===sep&&!inQ){result.push(cur.trim());cur='';}
        else{cur+=c;}
      }
      result.push(cur.trim());
      return result;
    }
    const headers = parseCSVLine(lines[0]).map(function(h){return h.toLowerCase().replace(/[^a-z0-9_]/g,'');});
    let agregados=0, actualizados=0, errores=0;
    for(let i=1;i<lines.length;i++){
      const vals = parseCSVLine(lines[i]);
      if(vals.length < 3) continue;
      const get = function(campo) {
        const idx = headers.indexOf(campo);
        return idx>=0 ? (vals[idx]||'').replace(/^"|"$/g,'') : '';
      };
      const cod = get('codigo')||('IMP'+Date.now()+i);
      const nom = get('nombre');
      if(!nom){errores++;continue;}
      // Buscar proveedor
      const provNom = get('proveedor');
      let provid = null;
      if(provNom){
        const pexist = DB.provs.find(function(p){return p.nom.toLowerCase()===provNom.toLowerCase();});
        if(pexist) provid = pexist.id;
        else if(provNom){
          const np={id:nid('prov'),nom:provNom,cuit:'',tel:'',email:'',dir:'',rub:'Importado',not:''};
          DB.provs.push(np); provid=np.id;
        }
      }
      const nuevo = {
        cod: cod, nom: nom,
        cat: get('categoria')||'',
        uni: get('unidad')||'Unidad',
        provid: provid,
        stk: parseFloat(get('stock'))||0,
        stkmin: parseFloat(get('stock_minimo'))||5,
        usastk: get('control_stock')||'si',
        cos: parseFloat(get('costo'))||0,
        u1: parseFloat(get('util_lista1'))||30,
        u2: parseFloat(get('util_lista2'))||25,
        u3: parseFloat(get('util_lista3'))||20,
        um: parseFloat(get('util_mayor'))||15,
        cm: parseFloat(get('cant_mayor'))||2,
      };
      const existe = DB.arts.find(function(a){return a.cod===cod;});
      if(existe){
        if(modo==='actualizar'){
          const idx=DB.arts.indexOf(existe);
          DB.arts[idx]={...existe,...nuevo,id:existe.id};
          actualizados++;
        }
      } else {
        nuevo.id = nid('art');
        DB.arts.push(nuevo);
        agregados++;
      }
    }
    saveDB();
    document.getElementById('csv-resultado').innerHTML=
      '<div class="alert av">✅ Importación completada:<br>'+
      '• '+agregados+' artículos nuevos agregados<br>'+
      '• '+actualizados+' artículos actualizados<br>'+
      (errores?'• '+errores+' filas con error (sin nombre)':'')+'</div>';
  };
  reader.readAsText(file,'UTF-8');
}

// =================== ASISTENTE IA ===================
function renderAsistente() {}

function preguntaRapida(q) {
  document.getElementById('chat-input').value = q;
  enviarChat();
}

function agregarMensajeChat(texto, esUsuario) {
  const cont = document.getElementById('chat-mensajes');
  const div = document.createElement('div');
  div.style.cssText = 'border-radius:10px;padding:12px 14px;font-size:13px;max-width:85%;line-height:1.5;white-space:pre-wrap;' +
    (esUsuario ?
      'background:var(--verde);color:white;align-self:flex-end;' :
      'background:var(--verde-suave);align-self:flex-start;');
  div.textContent = texto;
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;
}

function agregarCargando() {
  const cont = document.getElementById('chat-mensajes');
  const div = document.createElement('div');
  div.id = 'chat-cargando';
  div.style.cssText = 'background:var(--verde-suave);border-radius:10px;padding:12px 14px;font-size:13px;align-self:flex-start;';
  div.textContent = '⏳ Analizando tu consulta...';
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;
}

function quitarCargando() {
  const el = document.getElementById('chat-cargando');
  if(el) el.remove();
}

async function enviarChat() {
  const input = document.getElementById('chat-input');
  const pregunta = input.value.trim();
  if(!pregunta) return;
  input.value = '';
  agregarMensajeChat(pregunta, true);
  agregarCargando();

  // Preparar resumen del negocio para el contexto
  const hoyStr = hoy();
  const mesStr = new Date().toISOString().slice(0,7);
  const ventasMes = DB.ventas.filter(function(v){return v.fecha&&v.fecha.startsWith(mesStr);});
  const totalVentasMes = ventasMes.reduce(function(s,v){return s+v.total;},0);
  const gastosMes = DB.gastos.filter(function(g){return g.fecha&&g.fecha.startsWith(mesStr);});
  const totalGastosMes = gastosMes.reduce(function(s,g){return s+g.monto;},0);
  const artsBajoStock = DB.arts.filter(function(a){return a.usastk!=='no'&&a.stk<=a.stkmin;});
  const conteo={};DB.ventas.forEach(function(v){v.items.forEach(function(it){conteo[it.nom]=(conteo[it.nom]||0)+it.cant;});});
  const topArts = Object.entries(conteo).sort(function(a,b){return b[1]-a[1];}).slice(0,5);

  const contexto = 'Sos el asistente de un almacen natural en Argentina. Tenes acceso a los datos del negocio. Responde en espanol, de forma clara y concisa. No uses markdown. Usa emojis cuando ayude.

' +
    'DATOS DEL NEGOCIO:
' +
    '- Total artículos: ' + DB.arts.length + '
' +
    '- Artículos con stock bajo: ' + artsBajoStock.map(function(a){return a.nom+'('+a.stk+')';}).join(', ') + '
' +
    '- Ventas del mes: $' + totalVentasMes.toFixed(2) + ' (' + ventasMes.length + ' tickets)
' +
    '- Gastos del mes: $' + totalGastosMes.toFixed(2) + '
' +
    '- Utilidad neta del mes: $' + (totalVentasMes - totalGastosMes).toFixed(2) + '
' +
    '- Top 5 productos más vendidos: ' + topArts.map(function(x){return x[0]+'('+x[1]+' u.)';}).join(', ') + '
' +
    '- Total clientes: ' + DB.clis.length + '
' +
    '- Total proveedores: ' + DB.provs.length + '
' +
    '- Artículos: ' + DB.arts.slice(0,30).map(function(a){return a.nom+' stock:'+a.stk+' precio:$'+Math.round(a.cos*(1+a.u1/100));}).join(' | ') + '
' +
    '- Ventas hoy: $' + DB.ventas.filter(function(v){return v.fecha===hoyStr;}).reduce(function(s,v){return s+v.total;},0).toFixed(2);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',
        max_tokens:1000,
        system: contexto,
        messages:[{role:'user',content:pregunta}]
      })
    });
    const data = await res.json();
    quitarCargando();
    if(data.content&&data.content[0]) {
      agregarMensajeChat(data.content[0].text, false);
    } else {
      agregarMensajeChat('No pude obtener respuesta. Verificá tu conexión.', false);
    }
  } catch(err) {
    quitarCargando();
    agregarMensajeChat('Error de conexión. Verificá que estés conectado a internet.', false);
  }
}


function descargarPlantillaFormulas() {
  const cols = ['codigo','nombre','categoria','unidad','proveedor','stock','stock_minimo','control_stock','costo','util_lista1','util_lista2','util_lista3','util_mayor','cant_mayor'];
  // Fila de ejemplo con valores fijos para las listas
  const filas = [
    ['ART001','Nombre del producto','Categoria','Kg','Proveedor',50,5,'si',1000,100,75,50,75,2],
    ['ART002','Otro producto','Categoria','Unidad','',0,5,'si',500,100,75,50,75,2],
  ];
  let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="UTF-8"></head><body><table>';
  // Header
  html += '<tr>' + cols.map(function(c){
    const esCalculado = ['util_lista1','util_lista2','util_lista3','util_mayor','cant_mayor'].includes(c);
    const bg = esCalculado ? '#d8f3dc' : '#fff3cd';
    return '<th style="background:'+bg+';font-weight:bold;padding:5px;border:1px solid #ccc">'+c+'</th>';
  }).join('') + '</tr>';
  // Filas de ejemplo
  filas.forEach(function(fila) {
    html += '<tr>' + fila.map(function(v,i){
      const esCalculado = i >= 9;
      const bg = esCalculado ? '#d8f3dc' : '#fff9c4';
      return '<td style="background:'+bg+';padding:4px;border:1px solid #ccc">'+v+'</td>';
    }).join('') + '</tr>';
  });
  // 50 filas vacias con valores por defecto en columnas calculadas
  for(let r=0;r<50;r++){
    html += '<tr>';
    for(let c=0;c<14;c++){
      const esCalculado = c >= 9;
      const bg = esCalculado ? '#d8f3dc' : '#fff9c4';
      const pcts = [100,75,50,75,2];
      const val = esCalculado ? pcts[c-9] : '';
      html += '<td style="background:'+bg+';padding:4px;border:1px solid #ccc">'+val+'</td>';
    }
    html += '</tr>';
  }
  html += '</table>';
  html += '<br><p style="font-size:11px;color:#666">🟡 Amarillo = completar a mano &nbsp; 🟢 Verde = ya tiene valores (podés cambiarlos)</p>';
  html += '</body></html>';
  const b = new Blob([html],{type:'application/vnd.ms-excel;charset=utf-8'});
  const u = URL.createObjectURL(b);
  const a = document.createElement('a');
  a.href=u; a.download='plantilla_con_formulas.xls'; a.click();
  URL.revokeObjectURL(u);
}

function toast(msg,tipo,dur){
  tipo=tipo||'v';dur=dur||3000;
  var c=document.getElementById('toast-container');if(!c)return;
  var ico={v:'OK',r:'Error',a:'Aviso',i:'Info'};
  var cls={v:'tv',r:'tr',a:'ta',i:'ti'};
  var e=document.createElement('div');
  e.className='toast '+(cls[tipo]||'tv');
  e.innerHTML='<span class="tmsg">'+msg+'</span>';
  c.appendChild(e);
  setTimeout(function(){e.classList.add('hide');setTimeout(function(){if(e.parentNode)e.parentNode.removeChild(e);},400);},dur);
}
function confirmar(msg) {
  return new Promise(function(resolve) {
    document.getElementById('confirm-msg').textContent = msg;
    document.getElementById('m-confirm').classList.add('open');
    window._confirmResolve = resolve;
  });
}
function confirmResp(val) {
  document.getElementById('m-confirm').classList.remove('open');
  if(window._confirmResolve) { window._confirmResolve(val); window._confirmResolve = null; }
}

function resaltarFila(idx) {
  _filaSelPV = idx;
  document.querySelectorAll('.pvfila').forEach(function(r,i){
    r.style.background = i===idx ? 'var(--verde-suave)' : '';
    r.style.fontWeight = i===idx ? '600' : '';
  });
}
function navegarPV(dir) {
  var filas = document.querySelectorAll('.pvfila');
  if(!filas.length) return;
  _filaSelPV = Math.max(0, Math.min(filas.length-1, _filaSelPV + dir));
  filas.forEach(function(r,i){
    r.style.background = i===_filaSelPV ? 'var(--verde-suave)' : '';
    r.style.fontWeight = i===_filaSelPV ? '600' : '';
  });
  filas[_filaSelPV].scrollIntoView({block:'nearest'});
}
function seleccionarFilaPV() {
  var filas = document.querySelectorAll('.pvfila');
  if(_filaSelPV >= 0 && _filaSelPV < filas.length) {
    filas[_filaSelPV].click();
    _filaSelPV = -1;
  }
}

// =================== MODULO PRECIOS ===================
function renderPrecios() {
  var cats = [...new Set(DB.arts.map(function(a){return a.cat;}).filter(Boolean))].sort();
  var provs = [...new Set(DB.arts.map(function(a){var p=DB.provs.find(function(x){return x.id==a.provid;});return p?p.nom:'';}).filter(Boolean))].sort();
  var sc = document.getElementById('prec-cat');
  var sv = sc.value;
  sc.innerHTML = '<option value="">Todas las categorías</option>' + cats.map(function(c){return '<option value="'+c+'" '+(c===sv?'selected':'')+'>'+c+'</option>';}).join('');
  var sp = document.getElementById('prec-prov');
  var spv = sp.value;
  sp.innerHTML = '<option value="">Todos los proveedores</option>' + provs.map(function(p){return '<option value="'+p+'" '+(p===spv?'selected':'')+'>'+p+'</option>';}).join('');
  renderPreciosFiltro();
}

function getPreciosFiltrados() {
  var cat = document.getElementById('prec-cat').value;
  var prov = document.getElementById('prec-prov').value;
  var bus = document.getElementById('prec-bus').value.toLowerCase();
  return DB.arts.filter(function(a){
    if(cat && a.cat !== cat) return false;
    if(prov){var p=DB.provs.find(function(x){return x.id==a.provid;});if(!p||p.nom!==prov) return false;}
    if(bus && !a.nom.toLowerCase().includes(bus) && !a.cod.toLowerCase().includes(bus)) return false;
    return true;
  });
}

function renderPreciosFiltro() {
  var arts = getPreciosFiltrados();
  var tb = document.getElementById('tprecios');
  var pgEl = document.getElementById('pg-precios');
  if(!arts.length){tb.innerHTML='<tr><td colspan="13"><div class="vacio"><div class="vi">💲</div><p>Sin artículos</p></div></td></tr>';if(pgEl)pgEl.innerHTML='';return;}
  var pg=paginar('precios',arts);
  tb.innerHTML = pg.slice.map(function(a){
    return '<tr>' +
      '<td><input type="checkbox" class="prec-chk" value="'+a.id+'" onchange="actualizarContadorPrecios()"></td>' +
      '<td><span class="bdg bv2">'+a.cod+'</span></td>' +
      '<td><strong>'+a.nom+'</strong></td>' +
      '<td>'+(a.cat||'-')+'</td>' +
      '<td>'+fmt(a.cos)+'</td>' +
      '<td><input type="number" class="prec-input" data-id="'+a.id+'" data-campo="u1" value="'+a.u1+'" style="width:55px;border:1px solid #ddd;border-radius:4px;padding:3px;text-align:center" onchange="actualizarPrecioArt(this)"></td>' +
      '<td class="tv">'+fmt(pxc(a.cos,a.u1))+'</td>' +
      '<td><input type="number" class="prec-input" data-id="'+a.id+'" data-campo="u2" value="'+a.u2+'" style="width:55px;border:1px solid #ddd;border-radius:4px;padding:3px;text-align:center" onchange="actualizarPrecioArt(this)"></td>' +
      '<td class="tv">'+fmt(pxc(a.cos,a.u2))+'</td>' +
      '<td><input type="number" class="prec-input" data-id="'+a.id+'" data-campo="u3" value="'+a.u3+'" style="width:55px;border:1px solid #ddd;border-radius:4px;padding:3px;text-align:center" onchange="actualizarPrecioArt(this)"></td>' +
      '<td class="tv">'+fmt(pxc(a.cos,a.u3))+'</td>' +
      '<td><input type="number" class="prec-input" data-id="'+a.id+'" data-campo="um" value="'+a.um+'" style="width:55px;border:1px solid #ddd;border-radius:4px;padding:3px;text-align:center" onchange="actualizarPrecioArt(this)"></td>' +
      '<td class="tt2">'+fmt(pxc(a.cos,a.um))+'</td>' +
    '</tr>';
  }).join('');
  if(pgEl)pgEl.innerHTML=pg.nav;
  actualizarContadorPrecios();
}
_pgRender['precios'] = renderPreciosFiltro;

function actualizarPrecioArt(input) {
  var id = parseInt(input.getAttribute('data-id'));
  var campo = input.getAttribute('data-campo');
  var val = parseFloat(input.value) || 0;
  var art = DB.arts.find(function(a){return a.id===id;});
  if(art){ art[campo]=val; saveDB(); }
  // Actualizar precio calculado en la fila
  renderPreciosFiltro();
}

function actualizarContadorPrecios() {
  var sel = document.querySelectorAll('.prec-chk:checked').length;
  var cnt = document.getElementById('prec-count');
  if(cnt) cnt.textContent = sel + ' seleccionado' + (sel!==1?'s':'');
}

function selTodosPrecios(cb) {
  document.querySelectorAll('.prec-chk').forEach(function(c){c.checked=cb.checked;});
  actualizarContadorPrecios();
}

function aplicarCambio(arts) {
  var lista = document.getElementById('prec-lista').value;
  var tipo = document.getElementById('prec-tipo').value;
  var pct = parseFloat(document.getElementById('prec-pct').value) || 0;
  var listas = lista === 'todas' ? ['u1','u2','u3','um'] : [lista];
  arts.forEach(function(a){
    listas.forEach(function(l){
      if(tipo==='set') a[l] = pct;
      else if(tipo==='aum') a[l] = Math.round((a[l]||0) + pct);
      else if(tipo==='dis') a[l] = Math.max(0, Math.round((a[l]||0) - pct));
    });
  });
  saveDB();
  renderPreciosFiltro();
  toast('Precios actualizados en '+arts.length+' artículos','v');
}

function aplicarCambioMasivo() {
  var arts = getPreciosFiltrados();
  if(!arts.length){toast('No hay artículos filtrados','a');return;}
  aplicarCambio(arts);
}

function aplicarCambioSeleccionados() {
  var ids = [...document.querySelectorAll('.prec-chk:checked')].map(function(c){return parseInt(c.value);});
  if(!ids.length){toast('Seleccioná al menos un artículo','a');return;}
  var arts = DB.arts.filter(function(a){return ids.includes(a.id);});
  aplicarCambio(arts);
}

function importarCSVPrecios() {
  var file = document.getElementById('csv-file2').files[0];
  if(!file){toast('Selecciona un archivo','a');return;}
  var modo = document.getElementById('csv-modo').value;
  var reader = new FileReader();
  reader.onload = function(e) {
    var text = e.target.result.replace(/^﻿/,'');
    var lines = text.split('
').map(function(l){return l.trim();}).filter(Boolean);
    if(lines.length < 2){document.getElementById('csv-resultado').innerHTML='<div class="alert ar">Sin datos.</div>';return;}
    var sep = lines[0].includes(';') ? ';' : ',';
    function pl(line) {
      var r=[],cur='',inQ=false;
      for(var i=0;i<line.length;i++){
        var c=line[i];
        if(c==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++;}else{inQ=!inQ;}}
        else if(c===sep&&!inQ){r.push(cur.trim());cur='';}
        else cur+=c;
      }
      r.push(cur.trim());
      return r;
    }
    var headers=pl(lines[0]).map(function(h){return h.toLowerCase().replace(/[^a-z0-9_]/g,'');});
    var g=function(vals,campo){var i=headers.indexOf(campo);return i>=0?(vals[i]||'').replace(/^"|"$/g,'').replace(/,/g,'.'):''};
    var agr=0,act=0,err=0;
    for(var i=1;i<lines.length;i++){
      var v=pl(lines[i]);
      if(v.length<3)continue;
      var nom=g(v,'nombre');if(!nom){err++;continue;}
      var cod=g(v,'codigo')||('IMP'+i);
      var costo=parseFloat(g(v,'costo'))||0;
      var p1=parseFloat(g(v,'precio_lista1'))||0;
      var p2=parseFloat(g(v,'precio_lista2'))||0;
      var p3=parseFloat(g(v,'precio_lista3'))||0;
      var pm=parseFloat(g(v,'precio_mayor'))||0;
      var provNom=g(v,'proveedor');var provid=null;
      if(provNom){var pe=DB.provs.find(function(p){return p.nom.toLowerCase()===provNom.toLowerCase();});if(pe)provid=pe.id;else{var np={id:nid('prov'),nom:provNom,cuit:'',tel:'',email:'',dir:'',rub:'Importado',not:''};DB.provs.push(np);provid=np.id;}}
      var nuevo={cod:cod,nom:nom,cat:g(v,'categoria')||'',uni:g(v,'unidad')||'Unidad',provid:provid,stk:parseFloat(g(v,'stock'))||0,stkmin:parseFloat(g(v,'stock_minimo'))||5,usastk:g(v,'control_stock')||'si',cos:costo,u1:0,u2:0,u3:0,um:0,p1:p1,p2:p2,p3:p3,pm:pm,cm:parseFloat(g(v,'cant_mayor'))||2};
      var ex=DB.arts.find(function(a){return a.cod===cod;});
      if(ex){if(modo==='actualizar'){var ix=DB.arts.indexOf(ex);DB.arts[ix]=Object.assign({},ex,nuevo,{id:ex.id});act++;}}
      else{nuevo.id=nid('art');DB.arts.push(nuevo);agr++;}
    }
    saveDB();
    document.getElementById('csv-resultado').innerHTML='<div class="alert av">Completado: '+agr+' nuevos, '+act+' actualizados'+(err?', '+err+' errores':'')+'</div>';
  };
  reader.readAsText(file,'UTF-8');
}

function renderConfig() {
  var cfg = DB.config || {};
  document.getElementById('cfg-nombre').value = cfg.nombre || '';
  document.getElementById('cfg-slogan').value = cfg.slogan || '';
  document.getElementById('cfg-dir').value = cfg.dir || '';
  document.getElementById('cfg-tel').value = cfg.tel || '';
  document.getElementById('cfg-email').value = cfg.email || '';
  document.getElementById('cfg-cuit').value = cfg.cuit || '';
  var prev = document.getElementById('cfg-logo-preview');
  if(cfg.logo) {
    prev.innerHTML = '<img src="'+cfg.logo+'" style="width:100%;height:100%;object-fit:contain;border-radius:10px">';
  } else {
    prev.innerHTML = '🌿';
  }
}

function guardarConfig() {
  if(!DB.config) DB.config = {};
  DB.config.nombre = document.getElementById('cfg-nombre').value.trim();
  DB.config.slogan = document.getElementById('cfg-slogan').value.trim();
  DB.config.dir = document.getElementById('cfg-dir').value.trim();
  DB.config.tel = document.getElementById('cfg-tel').value.trim();
  DB.config.email = document.getElementById('cfg-email').value.trim();
  DB.config.cuit = document.getElementById('cfg-cuit').value.trim();
  saveDB();
  aplicarConfig();
  toast('Configuración guardada', 'v');
}

function cargarLogo(input) {
  var file = input.files[0];
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    if(!DB.config) DB.config = {};
    DB.config.logo = e.target.result;
    saveDB();
    aplicarConfig();
    var prev = document.getElementById('cfg-logo-preview');
    prev.innerHTML = '<img src="'+e.target.result+'" style="width:100%;height:100%;object-fit:contain;border-radius:10px">';
    toast('Logo cargado', 'v');
  };
  reader.readAsDataURL(file);
}

function quitarLogo() {
  if(!DB.config) DB.config = {};
  DB.config.logo = null;
  saveDB();
  aplicarConfig();
  document.getElementById('cfg-logo-preview').innerHTML = '🌿';
  toast('Logo quitado', 'v');
}

function aplicarConfig() {
  var cfg = DB.config || {};
  var nombre = cfg.nombre || 'Almacén Natural';
  var slogan = cfg.slogan || 'Sistema de Gestión';
  var logo = cfg.logo;
  var logoEl = document.querySelector('.hlogo .nombre');
  var subEl = document.querySelector('.hlogo .sub');
  if(logoEl) logoEl.textContent = nombre;
  if(subEl) subEl.textContent = slogan;
  // Cambiar icono del header por logo si existe
  var iconEl = document.querySelector('.hlogo span[style*="font-size:26px"]');
  if(iconEl) {
    if(logo) {
      iconEl.innerHTML = '<img src="'+logo+'" style="width:38px;height:38px;object-fit:contain;border-radius:6px">';
    } else {
      iconEl.textContent = '🌿';
    }
  }
  // Actualizar titulo del browser
  document.title = nombre + ' — Sistema de Gestión';
}

// INIT
document.getElementById('fhdr').textContent=new Date().toLocaleDateString('es-AR',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
// Migrar datos viejos del localStorage si es necesario
if(!DB.bitacora) DB.bitacora = [];
if(!DB.ids) DB.ids = {art:1,prov:1,cli:1,usr:2,comp:1,venta:1,gasto:1,caja:1};
// Normalizar ventas viejas (campo clinom vs clienteNombre)
DB.ventas.forEach(function(v){
  if(!v.clinom && v.clienteNombre) v.clinom = v.clienteNombre;
  if(!v.clinom) v.clinom = 'Consumidor Final';
  if(!v.items) v.items = [];
});
// Normalizar articulos viejos
DB.arts.forEach(function(a){
  if(!a.usastk) a.usastk = 'si';
  if(a.u1===undefined) a.u1 = 30;
  if(a.u2===undefined) a.u2 = 25;
  if(a.u3===undefined) a.u3 = 20;
  if(a.um===undefined) a.um = 15;
  if(a.cm===undefined) a.cm = 2;
});
saveDB();
if(!DB.config) DB.config={};
aplicarConfig();
renderInicio();