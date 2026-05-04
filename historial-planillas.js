const SUPABASE_URL = window.APP_CONFIG.SUPABASE_URL;
const SUPABASE_KEY = window.APP_CONFIG.SUPABASE_KEY;
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Estado ────────────────────────────────────────────────
let empleados = [];
let obrasLista = [];
let contratistasLista = [];
let empleadoActual = null;
let asistenciasEmpleado = [];
let planillasStorage = []; // meses "YYYY-MM" con planilla en Storage
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
    db.from("obras").select("nombre, encargado").order("nombre"),
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

  // Leer historial de planillas desde archivo JSON en Storage
  planillasStorage = await cargarMetaEmpleado(emp.nombre);

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
      <button class="btn btn-azul" style="padding:6px 14px" onclick="descargarPlanillaMes()">💾 Guardar en historial</button>
      <span id="gp-estado" style="font-size:13px;color:var(--text-muted)"></span>
    </div>

    <div class="seccion-titulo">Resumen mensual</div>
    <div class="tabla-wrap">
      <table>
        <thead>
          <tr>
            <th>Período</th><th>Días trabajados</th><th>Ingresos</th><th>Salidas</th><th style="text-align:center">Descargar</th><th style="text-align:center">Ver</th><th></th>
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

  // Solo mostrar meses que tienen planilla generada en Storage
  let claves = [...planillasStorage].sort().reverse();
  if (filtroAnio) claves = claves.filter(k => k.startsWith(filtroAnio));
  if (filtroMes)  claves = claves.filter(k => k.endsWith(`-${String(filtroMes).padStart(2, "0")}`));

  if (!claves.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted)">Sin planillas generadas para el período seleccionado</td></tr>`;
    return;
  }

  // Calcular estadísticas de asistencia para cada mes
  const stats = {};
  asistenciasEmpleado.forEach(r => {
    const key = r.hora.slice(0, 7);
    if (!stats[key]) stats[key] = { dias: new Set(), ingresos: 0, salidas: 0 };
    stats[key].dias.add(r.hora.slice(0, 10));
    r.tipo === "ingreso" ? stats[key].ingresos++ : stats[key].salidas++;
  });

  tbody.innerHTML = claves.map(key => {
    const [anio, mesNum] = key.split("-");
    const s = stats[key];
    const activo = key === mesSeleccionado ? ' class="mes-activo"' : "";
    const mesLabel = `${MESES[parseInt(mesNum)-1]} ${anio}`;
    const diasText = s
      ? `${s.dias.size} día${s.dias.size !== 1 ? "s" : ""}`
      : `<span style="color:var(--text-muted);font-size:12px">Sin asistencias</span>`;
    return `
      <tr${activo} onclick="clickFilaMes('${key}')" style="cursor:pointer">
        <td class="nowrap"><strong>${mesLabel}</strong></td>
        <td>${diasText}</td>
        <td class="tipo-ingreso">▲ ${s ? s.ingresos : 0}</td>
        <td class="tipo-salida">▼ ${s ? s.salidas : 0}</td>
        <td style="text-align:center">
          <button class="btn-ojo"
            onclick="event.stopPropagation(); descargarDesdeHistorial('${key}')"
            title="Descargar planilla de ${mesLabel}">
            ⬇ Descargar
          </button>
        </td>
        <td style="text-align:center">
          <button class="btn-ojo"
            onclick="event.stopPropagation(); previsualizarPlanilla('${key}')"
            title="Previsualizar planilla de ${mesLabel}">
            👁 Ver
          </button>
        </td>
        <td>
          <button class="btn-del"
            onclick="event.stopPropagation(); borrarMes('${key}', '${mesLabel}')"
            title="Eliminar planilla de ${mesLabel}">
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
  if (!confirm(`¿Eliminar la planilla de ${mesLabel} de ${empleadoActual.nombre}?`)) return;

  const [anio, mesNum] = key.split("-");
  const fileName = `planilla_${sanitizarNombre(empleadoActual.nombre)}_${key}.xlsx`;

  try {
    // Actualizar el JSON de metadatos quitando este mes
    const mesesActualizados = planillasStorage.filter(m => m !== key);
    const metaErr = await guardarMetaEmpleado(empleadoActual.nombre, mesesActualizados);
    if (metaErr) throw new Error(metaErr.message);

    // Intentar eliminar el archivo Excel de Storage (secundario)
    db.storage.from("planillas").remove([fileName]);

    planillasStorage = mesesActualizados;
    if (mesSeleccionado === key) mesSeleccionado = null;

    renderResumenMensual();
    renderAsistenciaDiaria();
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

// ── Guardar planilla en historial (sin descarga local) ────
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

    const obraEmp1  = obrasLista.find(o => o.nombre === emp.obra);
    const cambios = construirCambios(emp.nombre, emp.puesto || "", emp.contratista || "", obraEmp1?.encargado || "", registrosMes, mes, anio);
    const blob    = await aplicarCambiosAPlantilla(ab, cambios);

    // Subir a Storage para poder descargar/previsualizar desde el historial
    const fileName = `planilla_${sanitizarNombre(emp.nombre)}_${anio}-${String(mes).padStart(2,"0")}.xlsx`;
    await db.storage.from("planillas").upload(fileName, blob, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: true,
    });

    // Actualizar JSON de metadatos
    const mesKey2 = `${anio}-${String(mes).padStart(2, "0")}`;
    const mesesActualizados = planillasStorage.includes(mesKey2)
      ? planillasStorage
      : [...planillasStorage, mesKey2];
    const metaErr = await guardarMetaEmpleado(emp.nombre, mesesActualizados);
    if (metaErr) {
      estado.textContent = `⚠ Error al guardar en historial: ${metaErr.message}`;
      setTimeout(() => { estado.textContent = ""; }, 6000);
      return;
    }

    planillasStorage = mesesActualizados;
    renderResumenMensual();

    estado.textContent = "✓ Guardada en historial";
    setTimeout(() => { estado.textContent = ""; }, 3000);
  } catch (err) {
    estado.textContent = "⚠ " + err.message;
  }
}

// ── Descargar planilla desde el historial ─────────────────
async function descargarDesdeHistorial(key) {
  const [anio, mesNum] = key.split("-");
  const mes   = parseInt(mesNum);
  const anioN = parseInt(anio);
  const emp   = empleadoActual;

  const desde = `${key}-01`;
  const hasta = new Date(anioN, mes, 1).toISOString().slice(0, 10);
  const registrosMes = asistenciasEmpleado.filter(r => {
    const d = r.hora.slice(0, 10);
    return d >= desde && d < hasta;
  });

  try {
    const res = await fetch("public/planilla-horario.xlsx");
    if (!res.ok) throw new Error("No se pudo cargar la plantilla");
    const ab = await res.arrayBuffer();

    const obraEmp2  = obrasLista.find(o => o.nombre === emp.obra);
    const cambios = construirCambios(emp.nombre, emp.puesto || "", emp.contratista || "", obraEmp2?.encargado || "", registrosMes, mes, anioN);
    const blob = await aplicarCambiosAPlantilla(ab, cambios);

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Planilla_${emp.nombre.replace(/\s+/g,"_")}_${MESES[mes-1]}_${anio}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert("⚠ Error al descargar: " + err.message);
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
    const obraEmp3  = obrasLista.find(o => o.nombre === emp.obra);
    const cambios  = construirCambios(emp.nombre, emp.puesto || "", emp.contratista || "", obraEmp3?.encargado || "", registrosMes, mes, anioN);
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

    // Actualizar JSON de metadatos si no estaba ya registrado
    if (!planillasStorage.includes(mesKey)) {
      const mesesActualizados = [...planillasStorage, mesKey];
      const metaErr2 = await guardarMetaEmpleado(emp.nombre, mesesActualizados);
      if (!metaErr2) {
        planillasStorage = mesesActualizados;
        renderResumenMensual();
      }
    }

    if (uploadErr) {
      // La descarga ya está disponible; solo avisamos que la preview no pudo cargarse
      statusEl.textContent = "Vista previa no disponible — usá el botón de descarga";
      statusEl.style.color = "var(--text-muted)";
      setTimeout(() => { statusEl.style.display = "none"; }, 4000);
      return;
    }

    // Obtener URL firmada (única por cada llamada) para evitar caché de Office Online
    const { data: signedData, error: signedErr } = await db.storage
      .from("planillas")
      .createSignedUrl(fileName, 3600);
    if (signedErr) {
      statusEl.textContent = "Vista previa no disponible — usá el botón de descarga";
      statusEl.style.color = "var(--text-muted)";
      setTimeout(() => { statusEl.style.display = "none"; }, 4000);
      return;
    }
    statusEl.textContent = "Abriendo previsualización…";
    const publicUrl = signedData.signedUrl;
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
function construirCambios(nombre, puesto, contratista, encargado, registros, mes, anio) {
  const M = MAPEO;
  const cambios = {};

  cambios[M.puesto]      = `PUESTO: ${puesto.toUpperCase()}`;
  cambios[M.nombre]      = `NOMBRE Y APELLIDO: ${nombre.toUpperCase()}`;
  cambios[M.contratista] = contratista.toUpperCase();
  cambios[M.mesAnio]     = `${MESES[mes - 1]}-${String(anio).slice(2)}`;

  for (let r = M.dataStartRow; r <= M.dataEndRow; r++) {
    cambios[`${M.colEncargado}${r}`] = { v: encargado.toUpperCase() || "SIN ENCARGADO", bold: true, size: 14 };
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
    const fechaKey  = `${anio}-${String(mes).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const diaSemana = new Date(anio, mes - 1, d).getDay();
    const inicial   = DIAS_INI[diaSemana];
    const diaLabel  = `${inicial} ${d}`;

    if (diaSemana === 0) {
      cambios[`A${fila}`] = { v: diaLabel, sundayCol: "A" };
      cambios[`B${fila}`] = { v: "", sundayCol: "BCFG" };
      cambios[`C${fila}`] = { v: "", sundayCol: "BCFG" };
      cambios[`D${fila}`] = { v: "", sundayCol: "D" };
      cambios[`E${fila}`] = { v: "", sundayCol: "E" };
      cambios[`F${fila}`] = { v: "", sundayCol: "BCFG" };
      cambios[`G${fila}`] = { v: "", sundayCol: "BCFG" };
      fila++;
      continue;
    }

    const { ingresos = [], salidas = [] } = byDate[fechaKey] || {};
    const ausente = ingresos.length === 0 && salidas.length === 0;

    if (ausente) {
      cambios[`A${fila}`] = { v: diaLabel, sundayCol: "A" };
      cambios[`B${fila}`] = { v: "", sundayCol: "BCFG" };
      cambios[`C${fila}`] = { v: "", sundayCol: "BCFG" };
      cambios[`D${fila}`] = { v: "", sundayCol: "D" };
      cambios[`E${fila}`] = { v: "", sundayCol: "E" };
      cambios[`F${fila}`] = { v: "", sundayCol: "BCFG" };
      cambios[`G${fila}`] = { v: "", sundayCol: "BCFG" };
      fila++;
      continue;
    }

    const maxF = Math.max(ingresos.length, salidas.length, 1);

    for (let i = 0; i < maxF && fila <= M.dataEndRow; i++) {
      const ing = ingresos[i];
      const sal = salidas[i];
      cambios[`${M.colDia}${fila}`]       = i === 0 ? diaLabel : "";
      cambios[`${M.colEntrada}${fila}`]   = { v: ing ? new Date(ing.hora).toLocaleTimeString("es-AR", { hour12: false }) : "", bold: true, size: 14 };
      cambios[`${M.colSalida}${fila}`]    = { v: sal ? new Date(sal.hora).toLocaleTimeString("es-AR", { hour12: false }) : "", bold: true, size: 14 };
      cambios[`${M.colUbicacion}${fila}`] = { v: (ing?.lugar || sal?.lugar || "").toUpperCase(), bold: true, size: 14 };
      fila++;
    }
  }

  for (let r = fila; r <= M.dataEndRow; r++) {
    cambios[`${M.colDia}${r}`]       = "";
    cambios[`${M.colEntrada}${r}`]   = { v: "", bold: true, size: 14 };
    cambios[`${M.colSalida}${r}`]    = { v: "", bold: true, size: 14 };
    cambios[`${M.colUbicacion}${r}`] = { v: "", bold: true, size: 14 };
  }

  // ── Resumen de horas — solo total mensual ──
  const RES_INI = 40;
  let totalMin = 0;
  Object.keys(byDate).forEach(fechaKey => {
    const { ingresos, salidas } = byDate[fechaKey];
    const pares = Math.min(ingresos.length, salidas.length);
    for (let i = 0; i < pares; i++) {
      const t1 = new Date(ingresos[i].hora);
      const t2 = new Date(salidas[i].hora);
      if (t2 > t1) totalMin += (t2 - t1) / 60000;
    }
  });
  const totalStr = `${Math.floor(totalMin / 60)}h ${String(Math.round(totalMin % 60)).padStart(2, "0")}m`;
  cambios[`A${RES_INI}`]   = `RESUMEN HORAS TRABAJADAS — ${MESES[mes-1].toUpperCase()} ${anio}`;
  cambios[`A${RES_INI+1}`] = "TOTAL HORAS DEL MES:";
  cambios[`B${RES_INI+1}`] = totalStr;

  // ── Firma / Conformidad ──────────────────────────────
  const FIRMA_ROW = RES_INI + 3; // fila 43 (deja fila 42 de separación)
  cambios[`D${FIRMA_ROW}`]     = { v: "__________________", bold: true, size: 12 };
  cambios[`D${FIRMA_ROW + 1}`] = { v: "NOMBRE Y APELLIDO", bold: true, size: 12 };
  cambios[`G${FIRMA_ROW}`]     = { v: "_______________", bold: true, size: 12 };
  cambios[`G${FIRMA_ROW + 1}`] = { v: "ACEPTO CONFORME", bold: true, size: 12 };

  return cambios;
}

async function aplicarCambiosAPlantilla(ab, cambios) {
  const zip = await JSZip.loadAsync(ab);

  let stylesXml = await zip.file("xl/styles.xml").async("string");
  const { xml: stylesXml2, idx: smallStyleIdx } = agregarEstiloLetraChica(stylesXml);
  const { xml: newStylesXml, sundayStyles }      = agregarEstilosDomingo(stylesXml2);
  zip.file("xl/styles.xml", newStylesXml);

  let sheetXml = await zip.file("xl/worksheets/sheet1.xml").async("string");
  sheetXml = modificarCeldasXml(sheetXml, cambios, smallStyleIdx, sundayStyles);
  zip.file("xl/worksheets/sheet1.xml", sheetXml);
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function agregarEstiloLetraChica(stylesXml) {
  const NS  = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const doc = new DOMParser().parseFromString(stylesXml, "application/xml");

  // Agregar fuente: bold, 8pt, Calibri
  const fontsEl    = doc.getElementsByTagNameNS(NS, "fonts")[0];
  const newFontIdx = parseInt(fontsEl.getAttribute("count"));
  const font = doc.createElementNS(NS, "font");
  font.appendChild(doc.createElementNS(NS, "b"));
  const sz = doc.createElementNS(NS, "sz");   sz.setAttribute("val", "10");      font.appendChild(sz);
  const nm = doc.createElementNS(NS, "name"); nm.setAttribute("val", "Calibri"); font.appendChild(nm);
  const fm = doc.createElementNS(NS, "family"); fm.setAttribute("val", "2");     font.appendChild(fm);
  fontsEl.appendChild(font);
  fontsEl.setAttribute("count", String(newFontIdx + 1));

  // Agregar xf: mismos bordes que s=2 pero con la nueva fuente
  const cellXfsEl = doc.getElementsByTagNameNS(NS, "cellXfs")[0];
  const newXfIdx  = parseInt(cellXfsEl.getAttribute("count"));
  const xf = doc.createElementNS(NS, "xf");
  xf.setAttribute("numFmtId", "0");
  xf.setAttribute("fontId",   String(newFontIdx));
  xf.setAttribute("fillId",   "0");
  xf.setAttribute("borderId", "1");
  xf.setAttribute("xfId",     "0");
  xf.setAttribute("applyFont",      "1");
  xf.setAttribute("applyFill",      "1");
  xf.setAttribute("applyBorder",    "1");
  xf.setAttribute("applyAlignment", "1");
  const align = doc.createElementNS(NS, "alignment");
  align.setAttribute("horizontal", "center");
  align.setAttribute("vertical",   "center");
  align.setAttribute("wrapText",    "1");
  xf.appendChild(align);
  cellXfsEl.appendChild(xf);
  cellXfsEl.setAttribute("count", String(newXfIdx + 1));

  return { xml: new XMLSerializer().serializeToString(doc), idx: newXfIdx };
}

function agregarEstilosDomingo(stylesXml) {
  const NS  = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const doc = new DOMParser().parseFromString(stylesXml, "application/xml");

  const cellXfsEl = doc.getElementsByTagNameNS(NS, "cellXfs")[0];
  const baseIdx   = parseInt(cellXfsEl.getAttribute("count"));

  function makeXf(fontId, borderId, alignV) {
    const xf = doc.createElementNS(NS, "xf");
    xf.setAttribute("numFmtId", "0");
    xf.setAttribute("fontId",   String(fontId));
    xf.setAttribute("fillId",   "3");
    xf.setAttribute("borderId", String(borderId));
    xf.setAttribute("xfId",     "0");
    xf.setAttribute("applyFont",      "1");
    xf.setAttribute("applyFill",      "1");
    xf.setAttribute("applyBorder",    "1");
    xf.setAttribute("applyAlignment", "1");
    const align = doc.createElementNS(NS, "alignment");
    align.setAttribute("horizontal", "left");
    align.setAttribute("vertical",   alignV);
    align.setAttribute("wrapText",    "1");
    xf.appendChild(align);
    cellXfsEl.appendChild(xf);
  }

  makeXf(2, 1, "top");    // col A    (baseIdx + 0)
  makeXf(0, 1, "center"); // col B,C,F,G (baseIdx + 1)
  makeXf(0, 2, "center"); // col D    (baseIdx + 2)
  makeXf(0, 4, "center"); // col E    (baseIdx + 3)

  cellXfsEl.setAttribute("count", String(baseIdx + 4));

  return {
    xml: new XMLSerializer().serializeToString(doc),
    sundayStyles: { A: baseIdx, BCFG: baseIdx + 1, D: baseIdx + 2, E: baseIdx + 3 },
  };
}

function modificarCeldasXml(xml, cambios, smallStyleIdx, sundayStyles) {
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

    if (esObj && entrada.sundayCol && sundayStyles) {
      cell.setAttribute("s", String(sundayStyles[entrada.sundayCol] ?? sundayStyles.BCFG));
      const t = doc.createElementNS(NS, "t");
      t.textContent = valor;
      is.appendChild(t);
    } else if (esObj && entrada.smallStyle && smallStyleIdx != null) {
      cell.setAttribute("s", String(smallStyleIdx));
      const t = doc.createElementNS(NS, "t");
      t.textContent = valor;
      is.appendChild(t);
    } else if (esObj && (entrada.bold || entrada.size)) {
      const r   = doc.createElementNS(NS, "r");
      const rPr = doc.createElementNS(NS, "rPr");
      if (entrada.bold) rPr.appendChild(doc.createElementNS(NS, "b"));
      if (entrada.size) {
        const sz = doc.createElementNS(NS, "sz");
        sz.setAttribute("val", String(entrada.size));
        rPr.appendChild(sz);
        const szCs = doc.createElementNS(NS, "szCs");
        szCs.setAttribute("val", String(entrada.size));
        rPr.appendChild(szCs);
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
    if (esObj && entrada.sundayCol && sundayStyles) {
      cellEl.setAttribute("s", String(sundayStyles[entrada.sundayCol] ?? sundayStyles.BCFG));
      const t = doc.createElementNS(NS, "t");
      t.textContent = valor;
      is.appendChild(t);
    } else if (esObj && entrada.smallStyle && smallStyleIdx != null) {
      cellEl.setAttribute("s", String(smallStyleIdx));
      const t = doc.createElementNS(NS, "t");
      t.textContent = valor;
      is.appendChild(t);
    } else if (esObj && (entrada.bold || entrada.size)) {
      const rEl  = doc.createElementNS(NS, "r");
      const rPr  = doc.createElementNS(NS, "rPr");
      if (entrada.bold) rPr.appendChild(doc.createElementNS(NS, "b"));
      if (entrada.size) {
        const sz = doc.createElementNS(NS, "sz");
        sz.setAttribute("val", String(entrada.size));
        rPr.appendChild(sz);
        const szCs = doc.createElementNS(NS, "szCs");
        szCs.setAttribute("val", String(entrada.size));
        rPr.appendChild(szCs);
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

// ── Metadata de planillas en Storage (JSON por empleado) ─
function metaFileName(nombreEmpleado) {
  return `meta_${sanitizarNombre(nombreEmpleado)}.json`;
}

async function cargarMetaEmpleado(nombreEmpleado) {
  try {
    const { data: { publicUrl } } = db.storage.from("planillas").getPublicUrl(metaFileName(nombreEmpleado));
    const res = await fetch(`${publicUrl}?t=${Date.now()}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function guardarMetaEmpleado(nombreEmpleado, meses) {
  const blob = new Blob([JSON.stringify(meses)], { type: "application/json" });
  const { error } = await db.storage.from("planillas")
    .upload(metaFileName(nombreEmpleado), blob, { upsert: true });
  return error;
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
