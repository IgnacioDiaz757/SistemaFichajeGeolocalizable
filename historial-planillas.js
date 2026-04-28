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
  empleados = (data || []).filter(e => Array.isArray(e.descriptors) && e.descriptors.length > 0);
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
        <span class="persona-sub">${esc([e.contratista, e.obra].filter(Boolean).join(" · ") || "Sin datos")}</span>
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

  const { data, error } = await db
    .from("asistencias")
    .select("*")
    .eq("empleado", emp.nombre)
    .order("hora", { ascending: true });

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
    if (!grupos[key]) grupos[key] = { dias: new Set(), ingresos: 0, salidas: 0 };
    grupos[key].dias.add(r.hora.slice(0, 10));
    r.tipo === "ingreso" ? grupos[key].ingresos++ : grupos[key].salidas++;
  });

  let claves = Object.keys(grupos).sort().reverse();
  if (filtroAnio) claves = claves.filter(k => k.startsWith(filtroAnio));
  if (filtroMes)  claves = claves.filter(k => k.endsWith(`-${String(filtroMes).padStart(2, "0")}`));

  if (!claves.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted)">Sin registros para el período seleccionado</td></tr>`;
    return;
  }

  tbody.innerHTML = claves.map(key => {
    const [anio, mesNum] = key.split("-");
    const g = grupos[key];
    const activo = key === mesSeleccionado ? ' class="mes-activo"' : "";
    const mesLabel = `${MESES[parseInt(mesNum)-1]} ${anio}`;
    return `
      <tr${activo} onclick="clickFilaMes('${key}')" style="cursor:pointer">
        <td class="nowrap"><strong>${mesLabel}</strong></td>
        <td>${g.dias.size} día${g.dias.size !== 1 ? "s" : ""}</td>
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
  const ids = asistenciasEmpleado
    .filter(r => r.hora.startsWith(key))
    .map(r => r.id);

  if (!ids.length) return;

  if (!confirm(`¿Eliminar los ${ids.length} registro${ids.length !== 1 ? "s" : ""} de ${mesLabel} de ${empleadoActual.nombre}?\n\nEsta acción no se puede deshacer.`)) return;

  const { error } = await db.from("asistencias").delete().in("id", ids);

  if (error) {
    alert("Error al eliminar: " + error.message);
    return;
  }

  // Actualizar caché local
  asistenciasEmpleado = asistenciasEmpleado.filter(r => !r.hora.startsWith(key));
  if (mesSeleccionado === key) mesSeleccionado = null;

  renderPanelHistorial();
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
    const cambios = construirCambios(emp.nombre, emp.puesto || "", emp.contratista || "", registrosMes, mes, anioN);
    const blob    = await aplicarCambiosAPlantilla(ab, cambios);

    // Subir a Supabase Storage bucket 'planillas'
    statusEl.textContent = "Subiendo archivo…";
    const fileName = `planilla_${sanitizarNombre(emp.nombre)}_${anio}-${String(mes).padStart(2,"0")}.xlsx`;

    const { error: uploadErr } = await db.storage
      .from("planillas")
      .upload(fileName, blob, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });

    if (uploadErr) {
      if (uploadErr.message?.includes("Bucket not found") || uploadErr.message?.includes("bucket")) {
        throw new Error('El bucket "planillas" no existe en Supabase Storage. Crealo como bucket público desde el panel de Supabase.');
      }
      throw new Error("Error al subir: " + uploadErr.message);
    }

    // Obtener URL pública
    const { data: { publicUrl } } = db.storage.from("planillas").getPublicUrl(fileName);

    // Activar botón de descarga directa
    btnDesc.href          = publicUrl;
    btnDesc.download      = `Planilla_${emp.nombre.replace(/\s+/g,"_")}_${MESES[mes-1]}_${anio}.xlsx`;
    btnDesc.style.display = "inline-flex";

    // Abrir en Office Online
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
      cambios[`${M.colEncargado}${fila}`] = "";
      fila++;
    }
  }

  for (let r = fila; r <= M.dataEndRow; r++) {
    cambios[`${M.colDia}${r}`]       = "";
    cambios[`${M.colEntrada}${r}`]   = { v: "", bold: true, size: 14 };
    cambios[`${M.colSalida}${r}`]    = { v: "", bold: true, size: 14 };
    cambios[`${M.colUbicacion}${r}`] = { v: "", bold: true, size: 14 };
    cambios[`${M.colEncargado}${r}`] = "";
  }

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
  const NS   = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const doc  = new DOMParser().parseFromString(xml, "application/xml");
  const cells = doc.getElementsByTagNameNS(NS, "c");

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
