import { APP_NOMBRE, ADMIN_EMAILS, ESTADOS, FLUJO, TIPOS, DIAS_ALERTA, COLORES_TECNICO, ROLES } from './config.js';
import { crearBackend } from './data.js';

const DIA = 864e5;
const $ = (sel, el = document) => el.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let api;
const S = {
  user: null,
  rol: null,
  equipos: [],
  tecnicos: [],
  usuarios: [],
  cargado: false,
  view: leerLocal('vista') || 'panel',
  f: { q: '', estado: '', tec: '', entregados: false },
  modal: null,
  arrastrando: false,
  unsubs: [],
};

// ---------- utilidades ----------
function leerLocal(k) { try { return localStorage.getItem('panel-' + k); } catch { return null; } }
function guardarLocal(k, v) { try { localStorage.setItem('panel-' + k, v); } catch {} }

const ESTADO = Object.fromEntries(ESTADOS.map(e => [e.id, e]));
const est = id => ESTADO[id] || ESTADO.ingresado;
const activo = eq => eq.estado !== 'entregado';
const tec = id => S.tecnicos.find(t => t.id === id);
const enPila = eq => activo(eq) && !tec(eq.tecnicoId);
const colaDe = tid => S.equipos.filter(e => activo(e) && (tid ? e.tecnicoId === tid : enPila(e))).sort(porPrioridad);
const porPrioridad = (a, b) => (a.prioridad ?? 0) - (b.prioridad ?? 0) || a.fechaIngreso - b.fechaIngreso;
const diasEnTaller = eq => Math.max(0, Math.floor(((eq.fechaEntrega || Date.now()) - eq.fechaIngreso) / DIA));
const nivelDemora = (eq, d = diasEnTaller(eq)) => !activo(eq) ? '' : d >= DIAS_ALERTA.peligro ? 'peligro' : d >= DIAS_ALERTA.aviso ? 'aviso' : '';
const progreso = eq => eq.estado === 'sin_reparacion' ? 1 : Math.max(0, FLUJO.indexOf(eq.estado)) / (FLUJO.length - 1);
const nombreEquipo = eq => [eq.marca, eq.modelo].filter(Boolean).join(' ') || eq.tipo || 'Equipo';
const nombreTec = id => tec(id)?.nombre || 'Pila (sin asignar)';
const iniciales = n => String(n || '?').trim().split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
const fmtFecha = ms => new Date(ms).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtFechaHora = ms => new Date(ms).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const plural = (n, s, p = s + 's') => `${n} ${n === 1 ? s : p}`;
const puedeEditar = () => S.rol === 'admin';
const puedeAsignar = () => S.rol === 'admin' || S.rol === 'supervisor';

function iconoTipo(tipo) {
  const t = String(tipo || '').toLowerCase();
  return (TIPOS.find(x => t.includes(x.nombre.toLowerCase())) || { icono: '🔧' }).icono;
}

function siguientePrioridad(tid) {
  const cola = colaDe(tid);
  return cola.length ? Math.max(...cola.map(e => e.prioridad ?? 0)) + 1 : 0;
}

function conHistorial(eq, accion, data) {
  return {
    ...data,
    historial: [...(eq.historial || []), { t: Date.now(), por: S.user.nombre, accion }],
    actualizado: Date.now(),
  };
}

function toast(msg, tipo = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'visible ' + tipo;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.className = ''; }, 3200);
}

function fallo(err) {
  console.error(err);
  toast(err?.code === 'permission-denied' ? 'No tenés permiso para esa acción' : 'Error: ' + (err?.message || err), 'error');
}

// Las escrituras se disparan sin bloquear la UI (Firestore aplica el cambio localmente al instante).
const ejecutar = p => Promise.resolve(p).catch(fallo);

// ---------- componentes ----------
function badge(estadoId, extra = '') {
  const e = est(estadoId);
  return `<span class="badge ${extra}" style="--c:${e.color}">${e.icono} ${esc(e.nombre)}</span>`;
}

function barraProgreso(eq) {
  const e = est(eq.estado);
  return `<div class="prog" style="--c:${e.color}" role="progressbar" aria-valuenow="${Math.round(progreso(eq) * 100)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.max(4, progreso(eq) * 100)}%"></span></div>`;
}

function chipDias(eq) {
  const d = diasEnTaller(eq);
  return `<span class="dias ${nivelDemora(eq, d)}" title="Días en el taller">${d} d</span>`;
}

function avatar(t, cls = '') {
  return `<span class="avatar ${cls}" style="--c:${t.color}">${esc(iniciales(t.nombre))}</span>`;
}

function tarjetaEquipo(eq, o = {}) {
  const t = tec(eq.tecnicoId);
  const sub = [eq.tipo, eq.cliente].filter(Boolean).map(esc).join(' · ');
  return `<li class="eq" data-id="${eq.id}">
    <div class="eq-fila">
      ${o.arrastrar ? '<span class="arrastre" title="Arrastrar para cambiar prioridad" aria-label="Arrastrar">⠿</span>' : ''}
      ${o.pos ? `<span class="pos">${o.pos}</span>` : ''}
      <button class="eq-main" data-act="ver" data-id="${eq.id}">
        <span class="eq-ico">${iconoTipo(eq.tipo)}</span>
        <span class="eq-txt">
          <b>${esc(nombreEquipo(eq))}</b>
          <small>${sub}</small>
          ${o.verTec ? `<small class="eq-tec">${t ? `${avatar(t, 'xs')} ${esc(t.nombre)}` : '📋 En pila'}</small>` : ''}
        </span>
        <span class="eq-meta">${badge(eq.estado)}${chipDias(eq)}</span>
      </button>
    </div>
    ${barraProgreso(eq)}
    ${o.asignar && puedeAsignar() ? `<label class="asignar">Asignar a ${selectTecnico(eq)}</label>` : ''}
  </li>`;
}

function selectTecnico(eq, act = 'asignar') {
  const actual = tec(eq.tecnicoId)?.id || '';
  return `<select data-act="${act}" data-id="${eq.id}">
    <option value="">📋 Pila (sin asignar)</option>
    ${S.tecnicos.map(t => `<option value="${t.id}" ${t.id === actual ? 'selected' : ''}>👤 ${esc(t.nombre)}</option>`).join('')}
  </select>`;
}

function barraApilada(eqs) {
  if (!eqs.length) return '<div class="apilada vacia"></div>';
  return `<div class="apilada">${ESTADOS.map(e => {
    const n = eqs.filter(x => x.estado === e.id).length;
    return n ? `<span style="flex:${n};--c:${e.color}" title="${esc(e.nombre)}: ${n}"></span>` : '';
  }).join('')}</div>`;
}

function dona(eqs) {
  const total = eqs.length;
  const estados = ESTADOS.filter(e => e.id !== 'entregado');
  let acum = 0;
  const arcos = estados.map(e => {
    const n = eqs.filter(x => x.estado === e.id).length;
    if (!n) return '';
    const pct = n / total * 100;
    const arco = `<circle r="15.915" cx="21" cy="21" fill="none" stroke="${e.color}" stroke-width="6"
      stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="${25 - acum}"><title>${esc(e.nombre)}: ${n}</title></circle>`;
    acum += pct;
    return arco;
  }).join('');
  const max = Math.max(1, ...estados.map(e => eqs.filter(x => x.estado === e.id).length));
  return `<div class="dona-wrap">
    <svg viewBox="0 0 42 42" class="dona" role="img" aria-label="Distribución por estado">
      <circle r="15.915" cx="21" cy="21" fill="none" stroke="var(--border)" stroke-width="6"></circle>
      ${arcos}
      <text x="21" y="21" class="dona-num">${total}</text>
      <text x="21" y="26.5" class="dona-lbl">en taller</text>
    </svg>
    <ul class="leyenda">${estados.map(e => {
      const n = eqs.filter(x => x.estado === e.id).length;
      return `<li><button data-act="ir" data-view="equipos" data-estado="${e.id}" class="${n ? '' : 'cero'}">
        <span class="punto" style="--c:${e.color}"></span>
        <span class="ley-nom">${e.icono} ${esc(e.nombre)}</span>
        <span class="ley-bar"><span style="width:${n / max * 100}%;--c:${e.color}"></span></span>
        <b>${n}</b>
      </button></li>`;
    }).join('')}</ul>
  </div>`;
}

function kpi(titulo, valor, icono, cls, view, estado = '') {
  return `<button class="kpi ${cls}" data-act="ir" data-view="${view}" data-estado="${estado}">
    <span class="kpi-ico">${icono}</span><b>${valor}</b><small>${titulo}</small>
  </button>`;
}

// ---------- vistas ----------
function vPanel() {
  const act = S.equipos.filter(activo);
  const pila = colaDe(null);
  const listos = act.filter(e => e.estado === 'listo');
  const demorados = act.filter(e => diasEnTaller(e) >= DIAS_ALERTA.peligro);
  const tarjeta = (cab, eqs) => `<article class="card tec">
      <header class="tec-cab">${cab}<span class="cnt">${eqs.length}</span></header>
      ${barraApilada(eqs)}
      <ul class="lista">${eqs.map(e => tarjetaEquipo(e)).join('') || '<li class="vacio">Sin equipos</li>'}</ul>
    </article>`;
  return `
    <section class="kpis">
      ${kpi('En taller', act.length, '🛠️', '', 'equipos')}
      ${kpi('En pila sin asignar', pila.length, '📋', pila.length ? 'aviso' : '', 'pila')}
      ${kpi('Listos para entregar', listos.length, '✅', listos.length ? 'ok' : '', 'equipos', 'listo')}
      ${kpi(`Demorados +${DIAS_ALERTA.peligro} días`, demorados.length, '⚠️', demorados.length ? 'peligro' : '', 'equipos', 'demorados')}
    </section>
    <section class="card">
      <h2>Estado de los equipos</h2>
      ${act.length ? dona(act) : '<p class="vacio">No hay equipos en el taller.</p>'}
    </section>
    <h2 class="seccion">Trabajo por técnico</h2>
    <div class="grilla">
      ${S.tecnicos.map(t => tarjeta(`${avatar(t)}<h3>${esc(t.nombre)}</h3>`, colaDe(t.id))).join('')}
      ${tarjeta('<span class="avatar" style="--c:#64748b">📋</span><h3>Pila sin asignar</h3>', pila)}
    </div>`;
}

function vPila() {
  const arrastrar = puedeAsignar();
  const cola = (tid, eqs) => `<ol class="lista cola ${arrastrar ? 'ordenable' : ''}" data-tec="${tid}">${eqs.map((e, i) => tarjetaEquipo(e, { arrastrar, pos: i + 1, asignar: true })).join('')}</ol>`;
  const pila = colaDe(null);
  return `
    <p class="ayuda">${arrastrar
      ? 'Arrastrá desde <b>⠿</b> para ordenar por prioridad (arriba = más urgente) o para pasar un equipo de la pila a un técnico. También podés usar “Asignar a”.'
      : 'Orden de prioridad del trabajo: arriba lo más urgente.'}</p>
    <div class="grilla colas">
      <section class="card cola-card destacada">
        <header class="tec-cab"><span class="avatar" style="--c:#64748b">📋</span><h3>Pila sin asignar</h3><span class="cnt">${pila.length}</span></header>
        ${cola('', pila)}
      </section>
      ${S.tecnicos.map(t => {
        const eqs = colaDe(t.id);
        return `<section class="card cola-card">
          <header class="tec-cab">${avatar(t)}<h3>${esc(t.nombre)}</h3><span class="cnt">${eqs.length}</span></header>
          ${cola(t.id, eqs)}
        </section>`;
      }).join('')}
    </div>`;
}

function filtrarEquipos() {
  const { q, estado, tec: ft, entregados } = S.f;
  const txt = q.trim().toLowerCase();
  return S.equipos
    .filter(e => entregados || estado === 'entregado' || activo(e))
    .filter(e => !estado || (estado === 'demorados' ? activo(e) && diasEnTaller(e) >= DIAS_ALERTA.peligro : e.estado === estado))
    .filter(e => !ft || (ft === 'pila' ? enPila(e) : e.tecnicoId === ft))
    .filter(e => !txt || [e.cliente, e.marca, e.modelo, e.serie, e.tipo, e.falla].some(v => String(v || '').toLowerCase().includes(txt)))
    .sort((a, b) => b.fechaIngreso - a.fechaIngreso);
}

function listaEquipos() {
  const eqs = filtrarEquipos();
  return eqs.map(e => tarjetaEquipo(e, { verTec: true })).join('') || '<li class="vacio">No hay equipos que coincidan.</li>';
}

function vEquipos() {
  const f = S.f;
  const base = S.equipos.filter(e => f.entregados || activo(e));
  const chip = (id, nombre, color, n) =>
    `<button class="chip ${f.estado === id ? 'activo' : ''}" style="--c:${color}" data-act="filtro-estado" data-estado="${id}">${nombre}${n != null ? ` <b>${n}</b>` : ''}</button>`;
  return `
    <section class="card barra-filtros">
      <input id="buscar" type="search" data-act="buscar" placeholder="🔎 Buscar cliente, marca, modelo, serie…" value="${esc(f.q)}" autocomplete="off">
      <div class="fila-filtros">
        <select data-act="filtro-tec">
          <option value="">Todos los técnicos</option>
          <option value="pila" ${f.tec === 'pila' ? 'selected' : ''}>📋 Pila sin asignar</option>
          ${S.tecnicos.map(t => `<option value="${t.id}" ${f.tec === t.id ? 'selected' : ''}>👤 ${esc(t.nombre)}</option>`).join('')}
        </select>
        <label class="check"><input type="checkbox" data-act="filtro-entregados" ${f.entregados ? 'checked' : ''}> Incluir entregados</label>
      </div>
      <div class="chips">
        ${chip('', 'Todos', 'var(--accent)')}
        ${chip('demorados', `⚠️ Demorados`, 'var(--peligro)')}
        ${ESTADOS.map(e => chip(e.id, `${e.icono} ${esc(e.nombre)}`, e.color, (e.id === 'entregado' ? S.equipos : base).filter(x => x.estado === e.id).length)).join('')}
      </div>
    </section>
    <ul class="lista" id="lista-equipos">${listaEquipos()}</ul>`;
}

function vAjustes() {
  const url = location.origin + location.pathname;
  return `
    <section class="card">
      <h2>👤 Técnicos</h2>
      <ul class="ajustes-lista">
        ${S.tecnicos.map(t => `<li>
          <input type="color" value="${esc(t.color)}" data-act="tec-color" data-id="${t.id}" aria-label="Color">
          <input value="${esc(t.nombre)}" data-act="tec-nombre" data-id="${t.id}" aria-label="Nombre">
          <span class="cnt" title="Equipos activos">${colaDe(t.id).length}</span>
          <button class="icono" data-act="tec-borrar" data-id="${t.id}" title="Eliminar técnico">🗑️</button>
        </li>`).join('')}
      </ul>
      <form class="fila-form" data-form="tec-nuevo">
        <input name="nombre" placeholder="Nombre del nuevo técnico" required>
        <button class="primario">Agregar</button>
      </form>
    </section>
    <section class="card">
      <h2>🔐 Usuarios con acceso</h2>
      <p class="ayuda">Agregá el Gmail de cada persona que tiene que ver el panel.<br>
        <b>Supervisor</b>: ve todo, asigna equipos a técnicos y ordena la pila. <b>Solo lectura</b>: solo mira.</p>
      <ul class="ajustes-lista">
        ${ADMIN_EMAILS.map(e => `<li><span class="email">${esc(e)}</span><span class="rol-fijo">Administrador (fijo)</span></li>`).join('')}
        ${S.usuarios.map(u => `<li>
          <span class="email">${esc(u.id)}</span>
          <select data-act="usr-rol" data-id="${esc(u.id)}">
            ${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${u.rol === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
          <button class="icono" data-act="usr-borrar" data-id="${esc(u.id)}" title="Quitar acceso">🗑️</button>
        </li>`).join('')}
      </ul>
      <form class="fila-form" data-form="usr-nuevo">
        <input name="email" type="email" placeholder="email@gmail.com" required>
        <select name="rol">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === 'supervisor' ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <button class="primario">Agregar</button>
      </form>
    </section>
    <section class="card">
      <h2>🔗 Compartir</h2>
      <p class="ayuda">Enviá este link. Al abrirlo, la persona ingresa con su cuenta de Google (debe estar en la lista de arriba).</p>
      <div class="fila-form"><input value="${esc(url)}" readonly><button class="primario" data-act="copiar-link">Copiar</button></div>
    </section>
    ${api.demo ? `<section class="card"><h2>🧪 Modo demo</h2><button data-act="demo-reiniciar">Restaurar datos de ejemplo</button></section>` : ''}`;
}

// ---------- render ----------
function render() {
  if (S.arrastrando || !S.rol) return;
  document.body.classList.remove('sin-sesion');
  const foco = document.activeElement?.id;
  const sel = foco && [document.activeElement.selectionStart, document.activeElement.selectionEnd];
  if (S.view === 'ajustes' && !puedeEditar()) S.view = 'panel';
  const vistas = { panel: vPanel, pila: vPila, equipos: vEquipos, ajustes: vAjustes };
  $('#main').innerHTML = S.cargado ? (vistas[S.view] || vPanel)() : '<p class="cargando">Cargando…</p>';
  document.querySelectorAll('#tabs [data-view]').forEach(b => b.classList.toggle('activo', b.dataset.view === S.view));
  $('#tab-ajustes').hidden = !puedeEditar();
  $('#fab').hidden = !puedeEditar();
  if (S.view === 'pila') activarArrastre();
  if (S.modal?.tipo === 'detalle') renderDetalle();
  if (foco && document.getElementById(foco)) {
    const el = document.getElementById(foco);
    el.focus();
    try { el.setSelectionRange(...sel); } catch {}
  }
}

function renderUsuario() {
  const u = S.user;
  $('#usuario').innerHTML = u && S.rol ? `
    <span class="rol">${ROLES[S.rol] || ''}</span>
    <button class="yo" data-act="logout" title="${esc(u.email)} — cerrar sesión">
      ${u.foto ? `<img src="${esc(u.foto)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar sm" style="--c:var(--accent)">${esc(iniciales(u.nombre))}</span>`}
    </button>` : '';
}

function pantalla(html) {
  document.body.classList.add('sin-sesion');
  $('#fab').hidden = true;
  $('#main').innerHTML = `<section class="card pantalla">${html}</section>`;
}

// ---------- arrastrar y soltar ----------
function activarArrastre() {
  if (!window.Sortable || !puedeAsignar()) return;
  document.querySelectorAll('.ordenable').forEach(el => window.Sortable.create(el, {
    group: 'colas',
    handle: '.arrastre',
    animation: 150,
    forceFallback: true,
    fallbackTolerance: 4,
    scrollSensitivity: 80,
    bubbleScroll: true,
    ghostClass: 'fantasma',
    chosenClass: 'elegido',
    onStart: () => { S.arrastrando = true; },
    onEnd: ev => { S.arrastrando = false; reordenar(ev); },
  }));
}

function reordenar(ev) {
  const movido = ev.item.dataset.id;
  const nuevoTec = ev.to.dataset.tec || null;
  const ops = [];
  [...ev.to.children].forEach((li, i) => {
    const eq = S.equipos.find(e => e.id === li.dataset.id);
    if (!eq) return;
    let data = {};
    if (eq.prioridad !== i) data.prioridad = i;
    if (eq.id === movido && (tec(eq.tecnicoId)?.id || null) !== nuevoTec) {
      data = conHistorial(eq, `Asignado a ${nombreTec(nuevoTec)}`, { ...data, tecnicoId: nuevoTec });
    }
    if (Object.keys(data).length) ops.push({ col: 'equipos', id: eq.id, data });
  });
  render();
  if (ops.length) ejecutar(api.batch(ops));
}

// ---------- acciones ----------
function asignar(id, tid) {
  const eq = S.equipos.find(e => e.id === id);
  tid = tid || null;
  if (!eq || (tec(eq.tecnicoId)?.id || null) === tid) return;
  ejecutar(api.update('equipos', id, conHistorial(eq, `Asignado a ${nombreTec(tid)}`, {
    tecnicoId: tid,
    prioridad: siguientePrioridad(tid),
  })));
  toast(`${nombreEquipo(eq)} → ${nombreTec(tid)}`, 'ok');
}

function cambiarEstado(id, estado) {
  const eq = S.equipos.find(e => e.id === id);
  if (!eq || eq.estado === estado) return;
  const data = { estado, fechaEntrega: estado === 'entregado' ? Date.now() : null };
  ejecutar(api.update('equipos', id, conHistorial(eq, `Estado: ${est(eq.estado).nombre} → ${est(estado).nombre}`, data)));
}

function eliminarEquipo(id) {
  const eq = S.equipos.find(e => e.id === id);
  if (!eq || !confirm(`¿Eliminar definitivamente "${nombreEquipo(eq)}" de ${eq.cliente}?`)) return;
  cerrarModal();
  ejecutar(api.remove('equipos', id));
}

function fechaDesdeInput(v, previa) {
  if (!v) return previa || Date.now();
  if (previa && v === aInputFecha(previa)) return previa;
  if (v === aInputFecha(Date.now())) return Date.now();
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d, 9).getTime();
}

function aInputFecha(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function guardarEquipo(form) {
  const f = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v).trim()]));
  const datos = {
    tipo: f.tipo, marca: f.marca, modelo: f.modelo, serie: f.serie,
    cliente: f.cliente, falla: f.falla, observaciones: f.observaciones,
  };
  const tid = f.tecnicoId || null;
  const eq = S.modal.id && S.equipos.find(e => e.id === S.modal.id);
  if (!eq) {
    const ahora = Date.now();
    const hist = [{ t: ahora, por: S.user.nombre, accion: 'Ingresado al taller' }];
    if (tid) hist.push({ t: ahora, por: S.user.nombre, accion: `Asignado a ${nombreTec(tid)}` });
    if (f.estado !== 'ingresado') hist.push({ t: ahora, por: S.user.nombre, accion: `Estado: ${est(f.estado).nombre}` });
    ejecutar(api.add('equipos', {
      ...datos,
      estado: f.estado,
      tecnicoId: tid,
      prioridad: siguientePrioridad(tid),
      fechaIngreso: fechaDesdeInput(f.fechaIngreso),
      fechaEntrega: f.estado === 'entregado' ? ahora : null,
      actualizado: ahora,
      historial: hist,
    }));
    toast('Equipo cargado', 'ok');
  } else {
    const cambios = [];
    const data = { ...datos, fechaIngreso: fechaDesdeInput(f.fechaIngreso, eq.fechaIngreso) };
    if (Object.keys(datos).some(k => (eq[k] || '') !== datos[k]) || data.fechaIngreso !== eq.fechaIngreso) cambios.push('Datos editados');
    if (f.estado !== eq.estado) {
      cambios.push(`Estado: ${est(eq.estado).nombre} → ${est(f.estado).nombre}`);
      data.estado = f.estado;
      data.fechaEntrega = f.estado === 'entregado' ? Date.now() : null;
    }
    if ((tec(eq.tecnicoId)?.id || null) !== tid) {
      cambios.push(`Asignado a ${nombreTec(tid)}`);
      data.tecnicoId = tid;
      data.prioridad = siguientePrioridad(tid);
    }
    if (cambios.length) {
      const hist = [...(eq.historial || []), ...cambios.map(accion => ({ t: Date.now(), por: S.user.nombre, accion }))];
      ejecutar(api.update('equipos', eq.id, { ...data, historial: hist, actualizado: Date.now() }));
      toast('Cambios guardados', 'ok');
    }
  }
  if (eq) abrirDetalle(eq.id); else cerrarModal();
}

// ---------- modal ----------
const modal = () => $('#modal');

function abrirModal(html, estado) {
  S.modal = estado;
  $('#modal-body').innerHTML = html;
  if (!modal().open) modal().showModal();
  modal().scrollTop = 0;
}

function cerrarModal() {
  S.modal = null;
  if (modal().open) modal().close();
}

function abrirDetalle(id) {
  S.modal = { tipo: 'detalle', id };
  renderDetalle();
  if (!modal().open) modal().showModal();
}

function pasos(eq) {
  if (eq.estado === 'sin_reparacion') {
    return `<div class="aviso-final">⛔ Equipo <b>sin reparación</b> — pendiente de devolución al cliente.</div>`;
  }
  const actual = FLUJO.indexOf(eq.estado);
  const color = est(eq.estado).color;
  return `<ol class="pasos" style="--c:${color}">${FLUJO.map((id, i) => `
    <li class="${i < actual ? 'hecho' : i === actual ? 'actual' : ''}" title="${esc(est(id).nombre)}">
      <span class="paso-punto">${i <= actual ? est(id).icono : ''}</span>
      <span class="paso-nom">${esc(est(id).nombre)}</span>
    </li>`).join('')}</ol>`;
}

function renderDetalle() {
  const eq = S.equipos.find(e => e.id === S.modal.id);
  if (!eq) { cerrarModal(); return; }
  const t = tec(eq.tecnicoId);
  const d = diasEnTaller(eq);
  const fila = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
  $('#modal-body').innerHTML = `
    <header class="m-cab">
      <span class="eq-ico grande">${iconoTipo(eq.tipo)}</span>
      <div><h2>${esc(nombreEquipo(eq))}</h2><p>${esc(eq.tipo)}${eq.serie ? ` · S/N <b>${esc(eq.serie)}</b>` : ''}</p></div>
      <button class="icono x" data-act="cerrar" aria-label="Cerrar">✕</button>
    </header>
    <div class="m-estado">${badge(eq.estado, 'grande')}
      <span class="dias ${nivelDemora(eq, d)}">${eq.estado === 'entregado' ? `Entregado a los ${plural(d, 'día')}` : `${plural(d, 'día')} en taller`}</span>
    </div>
    ${pasos(eq)}
    <dl class="datos">
      ${fila('Cliente', `<b>${esc(eq.cliente)}</b>`)}
      ${fila('Técnico', puedeAsignar() ? selectTecnico(eq) : t ? `${avatar(t, 'xs')} ${esc(t.nombre)}` : '📋 Pila (sin asignar)')}
      ${fila('Ingreso', fmtFecha(eq.fechaIngreso))}
      ${eq.fechaEntrega ? fila('Entrega', fmtFecha(eq.fechaEntrega)) : ''}
      ${fila('Falla', esc(eq.falla))}
      ${fila('Observ.', esc(eq.observaciones).replace(/\n/g, '<br>'))}
    </dl>
    ${puedeEditar() ? `
      <h3>Cambiar estado</h3>
      <div class="estados-grid">${ESTADOS.map(e => `
        <button class="est-btn ${e.id === eq.estado ? 'actual' : ''}" style="--c:${e.color}" data-act="estado" data-id="${eq.id}" data-estado="${e.id}">
          <span>${e.icono}</span>${esc(e.nombre)}
        </button>`).join('')}
      </div>` : ''}
    <details class="hist-wrap" ${puedeEditar() ? '' : 'open'}>
      <summary>Historial (${(eq.historial || []).length})</summary>
      <ol class="hist">${[...(eq.historial || [])].reverse().map(h => `
        <li><time>${fmtFechaHora(h.t)}</time><span>${esc(h.accion)}</span><small>${esc(h.por)}</small></li>`).join('')}
      </ol>
    </details>
    ${puedeEditar() ? `
      <footer class="m-pie">
        <button class="peligro" data-act="borrar" data-id="${eq.id}">🗑️ Eliminar</button>
        <button class="primario" data-act="editar" data-id="${eq.id}">✏️ Editar datos</button>
      </footer>` : ''}`;
}

function abrirForm(id) {
  const eq = id ? S.equipos.find(e => e.id === id) : null;
  const v = k => esc(eq?.[k] ?? '');
  const tid = tec(eq?.tecnicoId)?.id || '';
  abrirModal(`
    <form data-form="equipo" class="formulario">
      <header class="m-cab">
        <span class="eq-ico grande">${eq ? iconoTipo(eq.tipo) : '➕'}</span>
        <div><h2>${eq ? 'Editar equipo' : 'Nuevo equipo'}</h2></div>
        <button type="button" class="icono x" data-act="${eq ? 'ver' : 'cerrar'}" data-id="${eq?.id || ''}" aria-label="Cerrar">✕</button>
      </header>
      <div class="campos">
        <label>Tipo de equipo *<input name="tipo" list="lista-tipos" required value="${v('tipo')}" placeholder="Notebook, PC, Impresora…"></label>
        <datalist id="lista-tipos">${TIPOS.map(t => `<option value="${t.nombre}">`).join('')}</datalist>
        <label>Marca<input name="marca" value="${v('marca')}"></label>
        <label>Modelo<input name="modelo" value="${v('modelo')}"></label>
        <label>N° de serie<input name="serie" value="${v('serie')}"></label>
        <label class="ancho">Cliente *<input name="cliente" required value="${v('cliente')}"></label>
        <label class="ancho">Falla reportada<textarea name="falla" rows="2">${v('falla')}</textarea></label>
        <label class="ancho">Observaciones<textarea name="observaciones" rows="2">${v('observaciones')}</textarea></label>
        <label>Estado<select name="estado">${ESTADOS.map(e => `<option value="${e.id}" ${(eq?.estado || 'ingresado') === e.id ? 'selected' : ''}>${e.icono} ${e.nombre}</option>`).join('')}</select></label>
        <label>Técnico<select name="tecnicoId">
          <option value="">📋 Pila (sin asignar)</option>
          ${S.tecnicos.map(t => `<option value="${t.id}" ${t.id === tid ? 'selected' : ''}>👤 ${esc(t.nombre)}</option>`).join('')}
        </select></label>
        <label>Fecha de ingreso<input type="date" name="fechaIngreso" value="${aInputFecha(eq?.fechaIngreso || Date.now())}" required></label>
      </div>
      <footer class="m-pie">
        <button type="button" data-act="${eq ? 'ver' : 'cerrar'}" data-id="${eq?.id || ''}">Cancelar</button>
        <button class="primario">${eq ? 'Guardar cambios' : 'Cargar equipo'}</button>
      </footer>
    </form>`, { tipo: 'form', id });
  if (!eq) setTimeout(() => $('#modal [name=tipo]').focus(), 50);
}

// ---------- eventos ----------
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  const { act, id } = el.dataset;
  switch (act) {
    case 'tab':
    case 'ir':
      S.view = el.dataset.view;
      guardarLocal('vista', S.view);
      if (act === 'ir' && S.view === 'equipos') S.f = { ...S.f, q: '', tec: '', estado: el.dataset.estado || '' };
      cerrarModal();
      render();
      window.scrollTo(0, 0);
      break;
    case 'filtro-estado':
      S.f.estado = S.f.estado === el.dataset.estado ? '' : el.dataset.estado;
      render();
      break;
    case 'ver': abrirDetalle(id); break;
    case 'cerrar': cerrarModal(); break;
    case 'nuevo': abrirForm(); break;
    case 'editar': abrirForm(id); break;
    case 'borrar': eliminarEquipo(id); break;
    case 'estado':
      cambiarEstado(id, el.dataset.estado);
      toast(`Estado: ${est(el.dataset.estado).nombre}`, 'ok');
      break;
    case 'tec-borrar': {
      const t = tec(id);
      const eqs = colaDe(id);
      if (!t || !confirm(`¿Eliminar a ${t.nombre}?${eqs.length ? `\nSus ${eqs.length} equipos activos vuelven a la pila.` : ''}`)) return;
      ejecutar(api.batch([
        ...eqs.map(eq => ({ col: 'equipos', id: eq.id, data: conHistorial(eq, `Devuelto a la pila (se eliminó a ${t.nombre})`, { tecnicoId: null, prioridad: siguientePrioridad(null) }) })),
        { col: 'tecnicos', id, remove: true },
      ]));
      break;
    }
    case 'usr-borrar':
      if (confirm(`¿Quitar el acceso de ${id}?`)) ejecutar(api.remove('usuarios', id));
      break;
    case 'copiar-link':
      navigator.clipboard?.writeText(location.origin + location.pathname)
        .then(() => toast('Link copiado', 'ok'), () => toast('No se pudo copiar', 'error'));
      break;
    case 'login': ejecutar(api.login()); break;
    case 'logout': if (api.demo || confirm('¿Cerrar sesión?')) ejecutar(api.logout()); break;
    case 'demo-reiniciar': if (confirm('¿Borrar los cambios y volver a los datos de ejemplo?')) api.reiniciarDemo(); break;
  }
});

document.addEventListener('change', ev => {
  const el = ev.target;
  const { act, id } = el.dataset;
  switch (act) {
    case 'asignar': asignar(id, el.value); break;
    case 'filtro-tec': S.f.tec = el.value; render(); break;
    case 'filtro-entregados': S.f.entregados = el.checked; render(); break;
    case 'tec-nombre':
      if (el.value.trim()) ejecutar(api.update('tecnicos', id, { nombre: el.value.trim() }));
      break;
    case 'tec-color': ejecutar(api.update('tecnicos', id, { color: el.value })); break;
    case 'usr-rol': ejecutar(api.update('usuarios', id, { rol: el.value })); break;
    case 'demo-rol': api.setRolDemo(el.value); break;
  }
});

document.addEventListener('input', ev => {
  if (ev.target.dataset.act !== 'buscar') return;
  S.f.q = ev.target.value;
  $('#lista-equipos').innerHTML = listaEquipos();
});

document.addEventListener('submit', ev => {
  const form = ev.target;
  const tipo = form.dataset.form;
  if (!tipo) return;
  ev.preventDefault();
  const fd = new FormData(form);
  if (tipo === 'equipo') guardarEquipo(form);
  if (tipo === 'tec-nuevo') {
    ejecutar(api.add('tecnicos', {
      nombre: String(fd.get('nombre')).trim(),
      color: COLORES_TECNICO[S.tecnicos.length % COLORES_TECNICO.length],
      orden: Date.now(),
    }));
    form.reset();
  }
  if (tipo === 'usr-nuevo') {
    const email = String(fd.get('email')).trim().toLowerCase();
    ejecutar(api.set('usuarios', email, { rol: fd.get('rol'), agregado: Date.now() }));
    form.reset();
    toast(`Acceso otorgado a ${email}`, 'ok');
  }
});

modal().addEventListener('click', ev => { if (ev.target === modal()) cerrarModal(); });
modal().addEventListener('close', () => { S.modal = null; });

// ---------- inicio ----------
async function iniciar() {
  document.title = APP_NOMBRE;
  $('#app-nombre').textContent = APP_NOMBRE;
  try {
    api = await crearBackend();
  } catch (e) {
    console.error(e);
    pantalla('<h2>No se pudo conectar</h2><p>Revisá tu conexión a internet y recargá la página.</p>');
    return;
  }
  if (api.demo) {
    const b = $('#demo');
    b.hidden = false;
    b.innerHTML = `<span>🧪 <b>Modo demo</b>: datos de prueba guardados en este navegador.</span> Ver como:
      <select data-act="demo-rol">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>`;
  }

  api.onUser(async u => {
    S.unsubs.forEach(f => f());
    S.unsubs = [];
    Object.assign(S, { user: u, rol: null, cargado: false, equipos: [], tecnicos: [], usuarios: [] });
    cerrarModal();
    renderUsuario();
    if (!u) {
      pantalla(`<div class="logo-grande">🔧</div><h2>${esc(APP_NOMBRE)}</h2>
        <p>Ingresá con tu cuenta de Google para ver el estado de los equipos.</p>
        <button class="primario google" data-act="login">Ingresar con Google</button>`);
      return;
    }
    pantalla('<p class="cargando">Verificando acceso…</p>');
    try { S.rol = await api.getRol(u.email); } catch (e) { console.error(e); }
    if (!S.rol) {
      pantalla(`<div class="logo-grande">🔒</div><h2>Sin acceso</h2>
        <p>La cuenta <b>${esc(u.email)}</b> no tiene permiso para ver este panel.<br>Pedile al administrador que la agregue.</p>
        <button data-act="logout">Usar otra cuenta</button>`);
      return;
    }
    if (api.demo) $('#demo select').value = S.rol;
    renderUsuario();
    const onError = fallo;
    const recibidos = new Set();
    const listo = col => { recibidos.add(col); S.cargado = recibidos.size >= 2; };
    S.unsubs.push(api.watch('equipos', d => {
      S.equipos = d;
      listo('equipos');
      render();
    }, onError));
    S.unsubs.push(api.watch('tecnicos', d => {
      S.tecnicos = d.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre));
      listo('tecnicos');
      render();
    }, onError));
    if (S.rol === 'admin') {
      S.unsubs.push(api.watch('usuarios', d => {
        S.usuarios = d.filter(x => !ADMIN_EMAILS.map(e => e.toLowerCase()).includes(x.id));
        if (S.view === 'ajustes' && !document.activeElement?.closest?.('#main form')) render();
      }, onError));
    }
    render();
  });

  // Los "días en taller" avanzan solos aunque nadie toque nada.
  setInterval(render, 30 * 60e3);
}

iniciar();
