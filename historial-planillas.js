const SUPABASE_URL = window.APP_CONFIG.SUPABASE_URL;
const SUPABASE_KEY = window.APP_CONFIG.SUPABASE_KEY;
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Estado ────────────────────────────────────────────────
let empleados = [];
let obrasLista = [];
let contratistasLista = [];
let empleadoActual = null;
let asistenciasEmpleado = [];
let mesSeleccionado = null; // "YYYY-MM" | null
let filtroEmpresa = "";
let filtroObra = "";
let filtroAnio = "";
let filtroMes = "";

// ── Constantes planilla ───────────────────────────────────
const MAPEO = {
  puesto: "A2", nombre: "A3", contratista: "C4", mesAnio: "G2",
  dataStartRow: 6, dataEndRow: 36,
  colDia: "A", colEntrada: "B", colSalida: "C", colUbicacion: "F", colEncargado: "G",
};
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS_INI = ["D","L","M","M","J","V","S"];
const DIAS_ES  = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

// ── Init ──────────────────────────────────────────────────
(async function init() {
  await Promise.all([cargarEmpleados(), cargarCatalogos()]);
})();

async function cargarEmpleados() {
  const { data } = await db.from("empleados").select("*").order("nombre");
  empleados = data || [];
  renderListaEmpleados();
}

async function cargarCatalogos() {
  const [{ data: obras }, { data: contr }] = await Promise.all([
    db.from("obras").select("nombre").order("nombre"),
    db.from("contratistas").select("nombre").order("nombre"),
  ]);
  obrasLista = obras || [];
  contratistasLista = contr || [];

  const selE = document.getElementById("f-empresa");
  const selO = document.getElementById("f-obra");
  contratistasLista.forEach(c => {
    selE.innerHTML += `<option value="${esc(c.nombre)}">${esc(c.nombre)}</option>`;
  });
  obrasLista.forEach(o => {
    selO.innerHTML += `<option value="${esc(o.nombre)}">${esc(o.nombre)}</option>`;
  });
}

// ── Lista de personas ─────────────────────────────────────
function aplicarFiltrosLista() {
  filtroEmpresa = document.getElementById("f-empresa").value;
  filtroObra    = document.getElementById("f-obra").value;
  renderListaEmpleados();
}

function renderListaEmpleados() {
  const buscar = document.getElementById("f-buscar").value.toLowerCase();
  const lista  = empleados.filter(e => {
    if (filtroEmpresa && e.contratista !== filtroEmpresa) return false;
    if (filtroObra    && e.obra        !== filtroObra)    return false;
    if (buscar && !e.nombre.toLowerCase().includes(buscar)) return false;
    return true;
  });

  document.getElementById("cnt-personas").textContent = lista.length;
  const cont = document.getElementById("lista-personas");

  if (!lista.length) {
    cont.innerHTML = '<p class="sin-resultados">Sin personas con el filtro aplicado.</p>';
    return;
  }

  cont.innerHTML = lista.map(e => `
    <div class="persona-card${empleadoActual?.id === e.id ? " activa" : ""}"
         onclick="seleccionarEmpleado('${e.id}')" data-id="${e.id}">
      <div class="persona-inicial">${esc(e.nombre.charAt(0).toUpperCase())}</div>
      <div class="persona-info">
        <span class="persona-nombre">${esc(e.nombre)}</span>
        <span class="persona-sub">${esc([...new Set([e.contratista, e.obra].filter(Boolean))].join(" · ") || "Sin datos")}</span>
      </div>
      <span style="font-size:15px;opacity:0.6">👤</span>
    </div>
  `).join("");
}

// ── Seleccionar persona ───────────────────────────────────
async function seleccionarEmpleado(id) {
  const emp = empleados.find(e => e.id === id);
  if (!emp) return;

  empleadoActual  = emp;
  mesSeleccionado = null;
  filtroAnio      = "";
  filtroMes       = "";
  asistenciasEmpleado = [];

  document.querySelectorAll(".persona-card").forEach(c => c.classList.remove("activa"));
  document.querySelector(`.persona-card[data-id="${id}"]`)?.classList.add("activa");

  document.getElementById("panel-historial").innerHTML = `
    <div class="loading-state">
      <span style="font-size:32px">⏳</span>
      <p>Cargando historial de ${esc(emp.nombre)}…</p>
    </div>`;

  // Intento 1: ilike con el nombre tal cual
  let { data, error } = await db
    .from("asistencias")
    .select("*")
    .ilike("empleado", emp.nombre)
    .order("hora", { ascending: true });

  // Intento 2: si no hay resultados, buscar sin acentos (cubre "Garcia" vs "García")
  if (!error && (!data || data.length === 0)) {
    const sinAcentos = emp.nombre
      .normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    if (sinAcentos.toLowerCase() !== emp.nombre.toLowerCase()) {
      ({ data, error } = await db
        .from("asistencias")
        .select("*")
        .ilike("empleado", sinAcentos)
        .order("hora", { ascending: true }));
    }
  }

  if (error) {
    document.getElementById("panel-historial").innerHTML =
      `<p style="padding:20px;color:var(--danger)">Error al cargar registros: ${esc(error.message)}</p>`;
    return;
  }

  asistenciasEmpleado = data || [];
  renderPanelHistorial();
}

// ── Panel historial ───────────────────────────────────────
function renderPanelHistorial() {
  const e = empleadoActual;
  const totalMeses = new Set(asistenciasEmpleado.map(r => r.hora.slice(0, 7))).size;
  const totalDias  = new Set(asistenciasEmpleado.map(r => r.hora.slice(0, 10))).size;

  const aniosDisp = [...new Set(asistenciasEmpleado.map(r => r.hora.slice(0, 4)))].sort().reverse();
  const anioOpts  = '<option value="">Todos los años</option>' +
    aniosDisp.map(a => `<option value="${a}"${filtroAnio === a ? " selected" : ""}>${a}</option>`).join("");
  const mesOpts = '<option value="">Todos los meses</option>' +
    MESES.map((m, i) => `<option value="${i+1}"${filtroMes === String(i+1) ? " selected" : ""}>${m}</option>`).join("");

  document.getElementById("panel-historial").innerHTML = `
    <div class="persona-header-panel">
      <div class="persona-avatar">${esc(e.nombre.charAt(0).toUpperCase())}</div>
      <div class="persona-datos">
        <h2>${esc(e.nombre)}</h2>
        <div class="persona-tags">
          ${e.contratista ? `<span class="tag tag-empresa">🏢 ${esc(e.contratista)}</span>` : ""}
          ${e.obra        ? `<span class="tag tag-obra">🏗 ${esc(e.obra)}</span>`             : ""}
          ${e.puesto      ? `<span class="tag tag-puesto">${esc(e.puesto)}</span>`             : ""}
        </div>
      </div>
      <div class="persona-stats">
        <div class="mini-stat"><span class="mini-num">${totalMeses}</span><span class="mini-label">Meses</span></div>
        <div class="mini-stat"><span class="mini-num">${totalDias}</span><span class="mini-label">Días</span></div>
        <div class="mini-stat"><span class="mini-num">${asistenciasEmpleado.length}</span><span class="mini-label">Registros</span></div>
      </div>
    </div>

    <div class="filtros-tiempo">
      <div class="filtros-tiempo-label">Filtrar período</div>
      <div class="filtros-tiempo-row">
        <div>
          <label>Mes</label>
          <select id="f-mes-hist" onchange="cambiarFiltroTiempo()">${mesOpts}</select>
        </div>
        <div>
          <label>Año</label>
          <select id="f-anio-hist" onchange="cambiarFiltroTiempo()">${anioOpts}</select>
        </div>
        <button class="btn-outline-gris" onclick="limpiarFiltroTiempo()">✕ Limpiar</button>
      </div>
    </div>

    ${asistenciasEmpleado.length === 0 ? `
    <div style="background:var(--danger-lt);border:1px solid #ef9a9a;border-radius:10px;padding:14px 18px;margin-bottom:16px;">
      <strong style="color:var(--danger);font-size:13px;">⚠ No se encontraron registros de asistencia para "${esc(e.nombre)}"</strong>
      <p style="font-size:12px;color:var(--text-muted);margin:6px 0 10px;">
        El empleado puede haberse registrado con un nombre distinto. Buscá como está guardado en asistencias:
      </p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <input id="buscar-nombre-alt" type="text" placeholder="Escribí el nombre exacto guardado en asistencias…"
               style="flex:1;min-width:220px;padding:7px 11px;border:1px solid var(--border);border-radius:7px;font-size:13px;background:var(--input-bg);color:var(--text)">
        <button class="btn btn-azul" style="padding:7px 14px;font-size:13px" onclick="buscarNombreAlternativo()">Buscar</button>
      </div>
      <p style="font-size:11px;color:var(--text-muted);margin-top:8px;">
        Tip: revisá en el panel admin cómo aparece el nombre en la columna "Empleado" de la tabla de registros.
      </p>
    </div>` : ""}

    <div class="seccion-titulo">Generar planilla</div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:4px 0 12px">
      <select id="gp-mes" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text)">
        ${MESES.map((m, i) => `<option value="${i+1}"${i+1 === new Date().getMonth()+1 ? " selected" : ""}>${m}</option>`).join("")}
      </select>
      <select id="gp-anio" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text)">
        ${[...Array(4)].map((_, i) => new Date().getFullYear() - i).map(y => `<option value="${y}">${y}</option>`).join("")}
      </select>
      <button class="btn btn-azul" style="padding:6px 14px" onclick="descargarPlanillaMes()">⬇ Descargar planilla</button>
      <span id="gp-estado" style="font-size:13px;color:var(--text-muted)"></span>
    </div>

    <div class="seccion-titulo">Resumen mensual</div>
    <div class="tabla-wrap">
      <table>
        <thead>
          <tr>
            <th>Período</th><th>Días trabajados</th><th>Ingresos</th><th>Salidas</th>
            <th style="text-align:center">Planilla</th><th></th>
          </tr>
        </thead>
        <tbody id="tbody-mensual"></tbody>
      </table>
    </div>

    <div class="seccion-titulo" id="titulo-diario">Asistencia diaria</div>
    <div class="tabla-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha</th><th>Día</th><th>Tipo</th><th>Hora</th>
            <th>Obra</th><th>Identificación</th><th>Foto</th>
          </tr>
        </thead>
        <tbody id="tbody-diario"></tbody>
      </table>
    </div>
  `;

  renderResumenMensual();
  renderAsistenciaDiaria();
}

// ── Filtros de tiempo ─────────────────────────────────────
function cambiarFiltroTiempo() {
  filtroMes       = document.getElementById("f-mes-hist").value;
  filtroAnio      = document.getElementById("f-anio-hist").value;
  mesSeleccionado = null;
  renderResumenMensual();
  renderAsistenciaDiaria();
}

function limpiarFiltroTiempo() {
  filtroMes = filtroAnio = "";
  mesSeleccionado = null;
  const selM = document.getElementById("f-mes-hist");
  const selA = document.getElementById("f-anio-hist");
  if (selM) selM.value = "";
  if (selA) selA.value = "";
  renderResumenMensual();
  renderAsistenciaDiaria();
}

// ── Resumen mensual ───────────────────────────────────────
function renderResumenMensual() {
  const tbody = document.getElementById("tbody-mensual");
  if (!tbody) return;

  const grupos = {};
  asistenciasEmpleado.forEach(r => {
    const key = r.hora.slice(0, 7);
    if (!grupos[key]) grupos[key] = { dias: new Set(), ingresos: 0, salidas: 0, tieneRegistros: true };
    grupos[key].dias.add(r.hora.slice(0, 10));
    r.tipo === "ingreso" ? grupos[key].ingresos++ : grupos[key].salidas++;
  });

  // Agregar meses con planillas generadas (sin registros de asistencia)
  const planillasGeneradas = JSON.parse(localStorage.getItem("planillas_generadas") || "[]");
  const empleadoNombre = empleadoActual?.nombre || "";
  
  console.log("Empleado actual:", empleadoNombre);
  console.log("Planillas generadas:", planillasGeneradas);
  
  planillasGeneradas
    .filter(p => p.empleado === empleadoNombre)
    .forEach(p => {
      console.log("Agregando mes:", p.mes);
      if (!(p.mes in grupos)) {
        grupos[p.mes] = { dias: new Set(), ingresos: 0, salidas: 0, tieneRegistros: false };
      }
    });

  // Filtrar planillas eliminadas
  const planillasEliminadas = JSON.parse(localStorage.getItem("planillas_eliminadas") || "[]");
  
  let claves = Object.keys(grupos).sort().reverse();
  if (filtroAnio) claves = claves.filter(k => k.startsWith(filtroAnio));
  if (filtroMes)  claves = claves.filter(k => k.endsWith(`-${String(filtroMes).padStart(2, "0")}`));
  
  // Excluir meses marcados como eliminados para este empleado
  claves = claves.filter(k => {
    return !planillasEliminadas.some(p => p.empleado === empleadoNombre && p.mes === k);
  });

  console.log("Claves finales:", claves);

  if (!claves.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted)">Sin registros para el período seleccionado</td></tr>`;
    return;
  }

  tbody.innerHTML = claves.map(key => {
    const [anio, mesNum] = key.split("-");
    const g = grupos[key];
    const activo = key === mesSeleccionado ? ' class="mes-activo"' : "";
    const mesLabel = `${MESES[parseInt(mesNum)-1]} ${anio}`;
    const diasText = g.tieneRegistros 
      ? `${g.dias.size} día${g.dias.size !== 1 ? "s" : ""}`
      : `<span style="color:var(--text-muted);font-size:12px">Planilla generada</span>`;
    return `
      <tr${activo} onclick="clickFilaMes('${key}')" style="cursor:pointer">
        <td class="nowrap"><strong>${mesLabel}</strong></td>
        <td>${diasText}</td>
        <td class="tipo-ingreso">▲ ${g.ingresos}</td>
        <td class="tipo-salida">▼ ${g.salidas}</td>
        <td style="text-align:center">
          <button class="btn-ojo"
            onclick="event.stopPropagation(); previsualizarPlanilla('${key}')"
            title="Previsualizar planilla de ${mesLabel}">
            👁 Ver planilla
          </button>
        </td>
        <td>
          <button class="btn-del"
            onclick="event.stopPropagation(); borrarMes('${key}', '${mesLabel}')"
            title="Eliminar todos los registros de ${mesLabel}">
            ✕
          </button>
        </td>
      </tr>`;
  }).join("");
}

function clickFilaMes(key) {
  mesSeleccionado = mesSeleccionado === key ? null : key;
  renderResumenMensual();
  renderAsistenciaDiaria();
  if (mesSeleccionado) {
    document.getElementById("titulo-diario")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

// ── Borrar mes ────────────────────────────────────────────
async function borrarMes(key, mesLabel) {
  if (!confirm(`¿Eliminar la planilla generada de ${mesLabel} de ${empleadoActual.nombre}?\n\nLos registros de asistencia se mantienen.`)) return;

  // Obtener el mes y año del key (formato: "YYYY-MM")
  const [anio, mes] = key.split("-");
  const mesNombre = MESES[parseInt(mes) - 1];
  const patronBusca = `Planilla_${empleadoActual.nombre.replace(/\s+/g,"_")}_${mesNombre}_${anio}.xlsx`;

  try {
    // Listar archivos en el bucket "planillas"
    const { data: archivos, error: listaError } = await db.storage
      .from("planillas")
      .list();

    if (listaError) throw listaError;

    // Encontrar y borrar archivos que coincidan
    const archivosBorrar = archivos.filter(f => f.name.includes(patronBusca));

    for (const archivo of archivosBorrar) {
      const { error: delError } = await db.storage
        .from("planillas")
        .remove([archivo.name]);

      if (delError) throw delError;
    }

    // Marcar la planilla como eliminada en localStorage
    const planillasEliminadas = JSON.parse(localStorage.getItem("planillas_eliminadas") || "[]");
    if (!planillasEliminadas.some(p => p.empleado === empleadoActual.nombre && p.mes === key)) {
      planillasEliminadas.push({ empleado: empleadoActual.nombre, mes: key });
      localStorage.setItem("planillas_eliminadas", JSON.stringify(planillasEliminadas));
    }

    // Remover de planillas generadas
    const planillasGeneradas = JSON.parse(localStorage.getItem("planillas_generadas") || "[]");
    const nuevasPlanillas = planillasGeneradas.filter(p => !(p.empleado === empleadoActual.nombre && p.mes === key));
    localStorage.setItem("planillas_generadas", JSON.stringify(nuevasPlanillas));

    alert("✓ Planilla eliminada del historial. Los registros de asistencia se mantienen.");
    renderPanelHistorial();
  } catch (e) {
    alert("Error al eliminar la planilla: " + e.message);
  }
}

// ── Asistencia diaria ─────────────────────────────────────
function renderAsistenciaDiaria() {
  const tbody  = document.getElementById("tbody-diario");
  const titulo = document.getElementById("titulo-diario");
  if (!tbody) return;

  let registros = [...asistenciasEmpleado];

  if (mesSeleccionado) {
    registros = registros.filter(r => r.hora.startsWith(mesSeleccionado));
    const [anio, mesNum] = mesSeleccionado.split("-");
    if (titulo) titulo.textContent = `Asistencia diaria — ${MESES[parseInt(mesNum)-1]} ${anio}`;
  } else {
    if (filtroAnio) registros = registros.filter(r => r.hora.startsWith(filtroAnio));
    if (filtroMes)  registros = registros.filter(r => r.hora.slice(5, 7) === String(filtroMes).padStart(2, "0"));
    if (titulo) titulo.textContent = "Asistencia diaria" + (filtroAnio || filtroMes ? " (filtrado)" : "");
  }

  registros = registros.slice().reverse();

  if (!registros.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted)">Sin registros para mostrar</td></tr>`;
    return;
  }

  tbody.innerHTML = registros.map(r => {
    const d      = new Date(r.hora);
    const icono  = r.tipo === "ingreso" ? "▲" : "▼";
    const clTipo = r.tipo === "ingreso" ? "tipo-ingreso" : "tipo-salida";
    const label  = r.tipo.charAt(0).toUpperCase() + r.tipo.slice(1);
    const diaEs  = DIAS_ES[d.getDay()];
    const fotoHtml = r.foto_url
      ? `<img class="foto-thumb" src="${r.foto_url}" onclick="verFoto('${r.foto_url}')" alt="foto">`
      : `<span style="color:var(--text-muted);font-size:12px">—</span>`;
    const idHtml = r.reconocido_facial
      ? `<span style="color:#2e7d32;font-weight:700;font-size:12px">👤 Facial</span>`
      : `<span style="color:#e65100;font-weight:700;font-size:12px">🖋️ Manual</span>`;

    return `
      <tr>
        <td class="nowrap">${d.toLocaleDateString("es-AR")}</td>
        <td class="nowrap" style="color:var(--text-muted)">${diaEs}</td>
        <td class="${clTipo}">${icono} ${label}</td>
        <td class="nowrap">${d.toLocaleTimeString("es-AR", { hour12: false })}</td>
        <td>${esc(r.lugar || "—")}</td>
        <td>${idHtml}</td>
        <td>${fotoHtml}</td>
      </tr>`;
  }).join("");
}

// ── Lightbox ──────────────────────────────────────────────
function verFoto(url) {
  document.getElementById("lightbox-img").src = url;
  document.getElementById("lightbox").style.display = "flex";
}

// ── Buscar registros con nombre alternativo ───────────────
async function buscarNombreAlternativo() {
  const input = document.getElementById("buscar-nombre-alt");
  if (!input) return;
  const nombreAlt = input.value.trim();
  if (!nombreAlt) return;

  input.disabled = true;
  const { data, error } = await db
    .from("asistencias")
    .select("*")
    .ilike("empleado", nombreAlt)
    .order("hora", { ascending: true });
  input.disabled = false;

  if (error) { alert("Error al buscar: " + error.message); return; }
  if (!data || data.length === 0) {
    alert(`No se encontraron registros con el nombre "${nombreAlt}".\nRevisá en admin.html cómo aparece exactamente en la columna Empleado.`);
    return;
  }

  asistenciasEmpleado = data;
  renderPanelHistorial();
}

// ── Descargar planilla (cualquier mes, sin preview) ───────
async function descargarPlanillaMes() {
  const mes    = parseInt(document.getElementById("gp-mes").value);
  const anio   = parseInt(document.getElementById("gp-anio").value);
  const emp    = empleadoActual;
  const estado = document.getElementById("gp-estado");
  if (!emp) return;

  estado.textContent = "Generando…";
  try {
    const desde = `${anio}-${String(mes).padStart(2,"0")}-01`;
    const hasta = new Date(anio, mes, 1).toISOString().slice(0, 10);
    const registrosMes = asistenciasEmpleado.filter(r => {
      const d = r.hora.slice(0, 10);
      return d >= desde && d < hasta;
    });

    const res = await fetch("public/planilla-horario.xlsx");
    if (!res.ok) throw new Error("No se pudo cargar la plantilla");
    const ab = await res.arrayBuffer();

    const cambios = construirCambios(emp.nombre, emp.puesto || "", emp.contratista || "", registrosMes, mes, anio);
    const blob    = await aplicarCambiosAPlantilla(ab, cambios);

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Planilla_${emp.nombre.replace(/\s+/g,"_")}_${MESES[mes-1]}_${anio}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);

    estado.textContent = registrosMes.length > 0
      ? `✓ ${registrosMes.length} registros incluidos`
      : "✓ Descargado (sin registros para ese mes)";
    setTimeout(() => { estado.textContent = ""; }, 3000);
  } catch (err) {
    estado.textContent = "⚠ " + err.message;
  }
}

// ── Previsualizar planilla ────────────────────────────────
async function previsualizarPlanilla(mesKey) {
  const [anio, mesNum] = mesKey.split("-");
  const mes    = parseInt(mesNum);
  const anioN  = parseInt(anio);
  const emp    = empleadoActual;

  const titulo = `${emp.nombre} — ${MESES[mes-1]} ${anio}`;
  document.getElementById("preview-titulo").textContent = titulo;

  const overlay   = document.getElementById("modal-preview");
  const statusEl  = document.getElementById("preview-status");
  const iframe    = document.getElementById("preview-frame");
  const btnDesc   = document.getElementById("btn-descargar-preview");

  overlay.style.display = "flex";
  statusEl.style.display = "block";
  statusEl.style.color   = "";
  statusEl.textContent   = "Generando planilla Excel…";
  iframe.src = "about:blank";
  btnDesc.style.display = "none";

  try {
    // Filtrar registros del mes desde el caché en memoria
    const desde = `${anio}-${String(mes).padStart(2,"0")}-01`;
    const hasta = new Date(anioN, mes, 1).toISOString().slice(0, 10);
    const registrosMes = asistenciasEmpleado.filter(r => {
      const d = r.hora.slice(0, 10);
      return d >= desde && d < hasta;
    });

    // Cargar plantilla base
    statusEl.textContent = "Cargando plantilla…";
    const res = await fetch("public/planilla-horario.xlsx");
    if (!res.ok) throw new Error("No se pudo cargar la plantilla Excel");
    const ab = await res.arrayBuffer();

    // Generar blob
    statusEl.textContent = "Generando Excel…";
    const cambios  = construirCambios(emp.nombre, emp.puesto || "", emp.contratista || "", registrosMes, mes, anioN);
    const blob     = await aplicarCambiosAPlantilla(ab, cambios);
    const nombreDescarga = `Planilla_${emp.nombre.replace(/\s+/g,"_")}_${MESES[mes-1]}_${anio}.xlsx`;

    // ── Descarga directa vía blob (siempre disponible, sin depender de Storage) ──
    const blobUrl         = URL.createObjectURL(blob);
    btnDesc.href          = blobUrl;
    btnDesc.download      = nombreDescarga;
    btnDesc.style.display = "inline-flex";

    // ── Intentar subir a Supabase para la vista previa en Office Online (opcional) ──
    statusEl.textContent = "Preparando vista previa…";
    const fileName = `planilla_${sanitizarNombre(emp.nombre)}_${anio}-${String(mes).padStart(2,"0")}.xlsx`;

    const { error: uploadErr } = await db.storage
      .from("planillas")
      .upload(fileName, blob, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });

    if (uploadErr) {
      // La descarga ya está disponible; solo avisamos que la preview no pudo cargarse
      statusEl.textContent = "Vista previa no disponible — usá el botón de descarga";
      statusEl.style.color = "var(--text-muted)";
      setTimeout(() => { statusEl.style.display = "none"; }, 4000);
      return;
    }

    // Obtener URL pública y abrir en Office Online
    const { data: { publicUrl } } = db.storage.from("planillas").getPublicUrl(fileName);
    statusEl.textContent = "Abriendo previsualización…";
    const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(publicUrl)}`;
    iframe.src = viewerUrl;

    const hideTimer = setTimeout(() => { statusEl.style.display = "none"; }, 6000);
    iframe.onload = () => { clearTimeout(hideTimer); statusEl.style.display = "none"; };

  } catch (err) {
    statusEl.textContent = `⚠ ${err.message}`;
    statusEl.style.color = "var(--danger)";
  }
}

function cerrarPreview() {
  document.getElementById("modal-preview").style.display = "none";
  document.getElementById("preview-frame").src = "about:blank";
  const s = document.getElementById("preview-status");
  s.style.display = "none";
  s.style.color   = "";
}

// ── Generar XLSX (lógica idéntica a admin.js) ─────────────
function construirCambios(nombre, puesto, contratista, registros, mes, anio) {
  const M = MAPEO;
  const cambios = {};

  cambios[M.puesto]      = `PUESTO: ${puesto.toUpperCase()}`;
  cambios[M.nombre]      = `NOMBRE Y APELLIDO: ${nombre.toUpperCase()}`;
  cambios[M.contratista] = contratista.toUpperCase();
  cambios[M.mesAnio]     = `${MESES[mes - 1]}-${String(anio).slice(2)}`;

  // Pre-inicializar todas las filas con "RIVERAS DEL SUQUIA" como encargado en negrita
  for (let r = M.dataStartRow; r <= M.dataEndRow; r++) {
    cambios[`${M.colEncargado}${r}`] = { v: "RIVERAS DEL SUQUIA", bold: true, size: 14 };
  }

  const byDate = {};
  registros.forEach(r => {
    const fecha = r.hora.slice(0, 10);
    if (!byDate[fecha]) byDate[fecha] = { ingresos: [], salidas: [] };
    r.tipo === "ingreso" ? byDate[fecha].ingresos.push(r) : byDate[fecha].salidas.push(r);
  });

  const diasDelMes = new Date(anio, mes, 0).getDate();
  let fila = M.dataStartRow;

  for (let d = 1; d <= diasDelMes && fila <= M.dataEndRow; d++) {
    const fechaKey = `${anio}-${String(mes).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const inicial  = DIAS_INI[new Date(anio, mes - 1, d).getDay()];
    const diaLabel = `${inicial} ${d}`;
    const { ingresos = [], salidas = [] } = byDate[fechaKey] || {};
    const maxF = Math.max(ingresos.length, salidas.length, 1);

    for (let i = 0; i < maxF && fila <= M.dataEndRow; i++) {
      const ing = ingresos[i];
      const sal = salidas[i];
      cambios[`${M.colDia}${fila}`]       = i === 0 ? diaLabel : "";
      cambios[`${M.colEntrada}${fila}`]   = { v: ing ? new Date(ing.hora).toLocaleTimeString("es-AR", { hour12: false }) : "", bold: true, size: 14 };
      cambios[`${M.colSalida}${fila}`]    = { v: sal ? new Date(sal.hora).toLocaleTimeString("es-AR", { hour12: false }) : "", bold: true, size: 14 };
      cambios[`${M.colUbicacion}${fila}`] = { v: (ing?.lugar || sal?.lugar || "").toUpperCase(), bold: true, size: 14 };
      cambios[`${M.colEncargado}${fila}`] = { v: "RIVERAS DEL SUQUIA", bold: true, size: 14 };
      fila++;
    }
  }

  for (let r = fila; r <= M.dataEndRow; r++) {
    cambios[`${M.colDia}${r}`]       = "";
    cambios[`${M.colEntrada}${r}`]   = { v: "", bold: true, size: 14 };
    cambios[`${M.colSalida}${r}`]    = { v: "", bold: true, size: 14 };
    cambios[`${M.colUbicacion}${r}`] = { v: "", bold: true, size: 14 };
    // El Encargado "RIVERAS DEL SUQUIA" ya está pre-asignado, se mantiene
  }

  // ── Resumen de horas (desde fila 40, aprox. B43 en la planilla) ──
  const RES_INI = 40;
  cambios[`A${RES_INI}`]   = `RESUMEN HORAS TRABAJADAS — ${MESES[mes-1].toUpperCase()} ${anio}`;
  cambios[`A${RES_INI+1}`] = "DIA";
  cambios[`B${RES_INI+1}`] = "ENTRADA";
  cambios[`C${RES_INI+1}`] = "SALIDA";
  cambios[`D${RES_INI+1}`] = "HORAS";

  let filaR    = RES_INI + 2;
  let totalMin = 0;

  Object.keys(byDate).sort().forEach(fechaKey => {
    const { ingresos, salidas } = byDate[fechaKey];
    const fecha    = new Date(fechaKey + "T12:00:00");
    const diaLabel = `${DIAS_INI[fecha.getDay()]} ${fecha.getDate()}`;
    let minDia     = 0;
    const pares    = Math.min(ingresos.length, salidas.length);
    for (let i = 0; i < pares; i++) {
      const t1 = new Date(ingresos[i].hora);
      const t2 = new Date(salidas[i].hora);
      if (t2 > t1) minDia += (t2 - t1) / 60000;
    }
    const primerIngreso = ingresos[0]
      ? new Date(ingresos[0].hora).toLocaleTimeString("es-AR", { hour12: false }) : "—";
    const ultimaSalida  = salidas[salidas.length - 1]
      ? new Date(salidas[salidas.length - 1].hora).toLocaleTimeString("es-AR", { hour12: false }) : "—";
    const horasDia = minDia > 0
      ? `${Math.floor(minDia / 60)}h ${String(Math.round(minDia % 60)).padStart(2, "0")}m`
      : (ingresos.length > 0 ? "Incompleto" : "—");
    cambios[`A${filaR}`] = diaLabel;
    cambios[`B${filaR}`] = primerIngreso;
    cambios[`C${filaR}`] = ultimaSalida;
    cambios[`D${filaR}`] = horasDia;
    totalMin += minDia;
    filaR++;
  });

  cambios[`A${filaR}`] = "TOTAL HORAS DEL MES:";
  cambios[`D${filaR}`] = `${Math.floor(totalMin / 60)}h ${String(Math.round(totalMin % 60)).padStart(2, "0")}m`;

  return cambios;
}

async function aplicarCambiosAPlantilla(ab, cambios) {
  const zip = await JSZip.loadAsync(ab);
  let sheetXml = await zip.file("xl/worksheets/sheet1.xml").async("string");
  sheetXml = modificarCeldasXml(sheetXml, cambios);
  zip.file("xl/worksheets/sheet1.xml", sheetXml);
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function modificarCeldasXml(xml, cambios) {
  const NS        = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const doc       = new DOMParser().parseFromString(xml, "application/xml");
  const sheetData = doc.getElementsByTagNameNS(NS, "sheetData")[0];
  const cells     = doc.getElementsByTagNameNS(NS, "c");

  // Modificar celdas existentes en la plantilla
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const ref  = cell.getAttribute("r");
    if (!ref || !(ref in cambios)) continue;

    const entrada = cambios[ref];
    const esObj   = entrada !== null && typeof entrada === "object";
    const valor   = esObj ? String(entrada.v ?? "") : String(entrada ?? "");

    while (cell.firstChild) cell.removeChild(cell.firstChild);
    cell.setAttribute("t", "inlineStr");

    const is = doc.createElementNS(NS, "is");
    if (esObj && (entrada.bold || entrada.size)) {
      const r   = doc.createElementNS(NS, "r");
      const rPr = doc.createElementNS(NS, "rPr");
      if (entrada.bold) rPr.appendChild(doc.createElementNS(NS, "b"));
      if (entrada.size) {
        const sz = doc.createElementNS(NS, "sz");
        sz.setAttribute("val", String(entrada.size));
        rPr.appendChild(sz);
      }
      r.appendChild(rPr);
      const t = doc.createElementNS(NS, "t");
      t.textContent = valor;
      r.appendChild(t);
      is.appendChild(r);
    } else {
      const t = doc.createElementNS(NS, "t");
      t.textContent = valor;
      is.appendChild(t);
    }
    cell.appendChild(is);
    delete cambios[ref];
  }

  // Insertar filas/celdas nuevas que no existen en la plantilla (resumen de horas)
  for (const ref in cambios) {
    const entrada = cambios[ref];
    const esObj   = entrada !== null && typeof entrada === "object";
    const valor   = esObj ? String(entrada.v ?? "") : String(entrada ?? "");

    const filaMatch = ref.match(/(\d+)$/);
    if (!filaMatch) continue;
    const filaNum = parseInt(filaMatch[1]);

    let row = null;
    const rows = doc.getElementsByTagNameNS(NS, "row");
    for (let i = 0; i < rows.length; i++) {
      if (parseInt(rows[i].getAttribute("r")) === filaNum) { row = rows[i]; break; }
    }
    if (!row) {
      row = doc.createElementNS(NS, "row");
      row.setAttribute("r", String(filaNum));
      sheetData.appendChild(row);
    }

    const cellEl = doc.createElementNS(NS, "c");
    cellEl.setAttribute("r", ref);
    cellEl.setAttribute("t", "inlineStr");

    const is = doc.createElementNS(NS, "is");
    if (esObj && (entrada.bold || entrada.size)) {
      const rEl  = doc.createElementNS(NS, "r");
      const rPr  = doc.createElementNS(NS, "rPr");
      if (entrada.bold) rPr.appendChild(doc.createElementNS(NS, "b"));
      if (entrada.size) {
        const sz = doc.createElementNS(NS, "sz");
        sz.setAttribute("val", String(entrada.size));
        rPr.appendChild(sz);
      }
      rEl.appendChild(rPr);
      const t = doc.createElementNS(NS, "t");
      t.textContent = valor;
      rEl.appendChild(t);
      is.appendChild(rEl);
    } else {
      const t = doc.createElementNS(NS, "t");
      t.textContent = valor;
      is.appendChild(t);
    }
    cellEl.appendChild(is);
    row.appendChild(cellEl);
  }

  return new XMLSerializer().serializeToString(doc);
}

// ── Helpers ───────────────────────────────────────────────
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sanitizarNombre(nombre) {
  return nombre
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "")
    .slice(0, 50);
}

// ── Sesión ────────────────────────────────────────────────
function cerrarSesion() {
  sessionStorage.removeItem("admin_auth");
  window.location.href = "login.html";
}
