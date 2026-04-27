const SUPABASE_URL = window.APP_CONFIG.SUPABASE_URL;
const SUPABASE_KEY = window.APP_CONFIG.SUPABASE_KEY;

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let obras = [];
let paginaActual = 1;
const POR_PAGINA  = 50;
let totalRegistros = 0;

// ── Gestión de obras ──────────────────────────────────────

async function cargarObras() {
  const { data, error } = await db.from("obras").select("*").order("nombre");
  if (!error) obras = data || [];
  renderGestionObras();
}

function renderGestionObras() {
  const contenedor = document.getElementById("obras-lista");
  if (!obras.length) {
    contenedor.innerHTML = '<p style="color:#999;font-size:13px;padding:12px 16px">Sin obras configuradas. Agregá una con el botón.</p>';
    return;
  }
  const base = `${window.location.origin}${window.location.pathname.replace("admin.html", "")}`;
  contenedor.innerHTML = obras.map(o => {
    const link = `${base}contratista.html?obra=${o.token || ""}`;
    return `
    <div class="obra-item">
      <div class="obra-info">
        <span class="obra-nombre">${o.nombre}</span>
        <span class="obra-coords">${o.lat != null ? `${o.lat}, ${o.lng} — radio ${o.radio}m` : "Sin coordenadas GPS"}</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-azul" style="font-size:12px;padding:5px 10px" onclick="copiarLink('${link}')">🔗 Copiar link</button>
        <button class="btn-del" onclick="eliminarObra('${o.id}')">✕</button>
      </div>
    </div>`;
  }).join("");
}

function copiarLink(url) {
  navigator.clipboard.writeText(url).then(() => {
    alert("Link copiado al portapapeles.");
  }).catch(() => {
    prompt("Copiá este link:", url);
  });
}

function toggleNuevaObra() {
  const form = document.getElementById("nueva-obra-form");
  form.style.display = form.style.display === "none" ? "flex" : "none";
}

async function agregarObra() {
  const nombre = document.getElementById("z-nombre").value.trim();
  const latVal = document.getElementById("z-lat").value;
  const lngVal = document.getElementById("z-lng").value;
  const lat    = latVal ? parseFloat(latVal) : null;
  const lng    = lngVal ? parseFloat(lngVal) : null;
  const radio  = parseInt(document.getElementById("z-radio").value) || 200;

  if (!nombre) { alert("Ingresá el nombre de la obra."); return; }

  const { data, error } = await db.from("obras").insert([{ nombre, lat, lng, radio }]).select();
  if (error) { alert("Error al guardar la obra."); return; }

  obras.push(data[0]);
  renderGestionObras();
  document.getElementById("z-nombre").value = "";
  document.getElementById("z-lat").value    = "";
  document.getElementById("z-lng").value    = "";
  document.getElementById("z-radio").value  = "200";
  document.getElementById("nueva-obra-form").style.display = "none";
  aplicarFiltros();
}

async function eliminarObra(id) {
  if (!confirm("¿Eliminar esta obra?")) return;
  const { error } = await db.from("obras").delete().eq("id", id);
  if (error) { alert("Error al eliminar."); return; }
  obras = obras.filter(o => o.id !== id);
  renderGestionObras();
  aplicarFiltros();
}

function usarMiUbicacion() {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      document.getElementById("z-lat").value = pos.coords.latitude.toFixed(6);
      document.getElementById("z-lng").value = pos.coords.longitude.toFixed(6);
    },
    () => alert("No se pudo obtener la ubicación.")
  );
}

// ── Verificación GPS ──────────────────────────────────────

function distanciaMetros(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLng  = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function badgeVerificacion(r) {
  const obra = obras.find(o => o.nombre === r.lugar);
  if (!obra || obra.lat == null || r.lat == null || r.lng == null) {
    return '<span class="v-none">Sin zona</span>';
  }
  const dist = Math.round(distanciaMetros(obra.lat, obra.lng, r.lat, r.lng));
  if (dist <= obra.radio) {
    return `<span class="v-ok">✓ En zona (${dist}m)</span>`;
  }
  return `<span class="v-fail">✗ Fuera de zona (${dist}m)</span>`;
}

// ── Filtros ───────────────────────────────────────────────

function getFiltros() {
  return {
    nombre: document.getElementById("f-nombre").value.trim(),
    desde:  document.getElementById("f-desde").value,
    hasta:  document.getElementById("f-hasta").value,
  };
}

function aplicarFiltrosQuery(query, { nombre, desde, hasta }) {
  if (nombre) query = query.ilike("empleado", `%${nombre}%`);
  if (desde)  query = query.gte("hora", desde + "T00:00:00");
  if (hasta)  query = query.lte("hora", hasta + "T23:59:59");
  return query;
}

// ── Datos con paginación en servidor ─────────────────────

async function cargarDatos() {
  setEstado("Cargando...");
  await cargarObras();

  const filtros  = getFiltros();
  const desdeIdx = (paginaActual - 1) * POR_PAGINA;
  const hastaIdx = desdeIdx + POR_PAGINA - 1;

  // Página actual
  const qDatos = aplicarFiltrosQuery(
    db.from("asistencias").select("*", { count: "exact" })
      .order("hora", { ascending: false })
      .range(desdeIdx, hastaIdx),
    filtros
  );

  // Conteos para resumen (paralelo)
  const qIngresos = aplicarFiltrosQuery(
    db.from("asistencias").select("id", { count: "exact", head: true }).eq("tipo", "ingreso"),
    filtros
  );
  const qSalidas = aplicarFiltrosQuery(
    db.from("asistencias").select("id", { count: "exact", head: true }).eq("tipo", "salida"),
    filtros
  );

  const [
    { data, error, count },
    { count: countI },
    { count: countS },
  ] = await Promise.all([qDatos, qIngresos, qSalidas]);

  if (error) { setEstado("Error al cargar los datos."); return; }

  totalRegistros = count || 0;
  const datos    = data  || [];

  renderResumen(totalRegistros, countI || 0, countS || 0);
  renderTabla(datos);
  renderListaPorObra(datos);
  renderPaginacion();
}

function aplicarFiltros() {
  paginaActual = 1;
  cargarDatos();
}

function limpiarFiltros() {
  document.getElementById("f-nombre").value = "";
  document.getElementById("f-desde").value  = "";
  document.getElementById("f-hasta").value  = "";
  aplicarFiltros();
}

// ── Render ────────────────────────────────────────────────

function renderResumen(total, ingresos, salidas) {
  document.getElementById("cnt-total").textContent    = total;
  document.getElementById("cnt-ingresos").textContent = ingresos;
  document.getElementById("cnt-salidas").textContent  = salidas;
}

function renderPaginacion() {
  const el          = document.getElementById("paginacion");
  const totalPaginas = Math.ceil(totalRegistros / POR_PAGINA);

  if (totalPaginas <= 1) { el.innerHTML = ""; return; }

  const inicio = (paginaActual - 1) * POR_PAGINA + 1;
  const fin    = Math.min(paginaActual * POR_PAGINA, totalRegistros);

  el.innerHTML = `
    <button class="btn btn-gris pag-btn" onclick="irPagina(${paginaActual - 1})" ${paginaActual === 1 ? "disabled" : ""}>← Anterior</button>
    <span class="pag-info">Página <strong>${paginaActual}</strong> de <strong>${totalPaginas}</strong> &nbsp;·&nbsp; Mostrando ${inicio}–${fin} de ${totalRegistros}</span>
    <button class="btn btn-gris pag-btn" onclick="irPagina(${paginaActual + 1})" ${paginaActual === totalPaginas ? "disabled" : ""}>Siguiente →</button>
  `;
}

function irPagina(n) {
  const totalPaginas = Math.ceil(totalRegistros / POR_PAGINA);
  if (n < 1 || n > totalPaginas) return;
  paginaActual = n;
  window.scrollTo({ top: 0, behavior: "smooth" });
  cargarDatos();
}

function renderTabla(datos) {
  const tbody = document.getElementById("tbody");
  tbody.innerHTML = "";

  if (!datos.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:#999">Sin registros</td></tr>';
    return;
  }

  datos.forEach(r => {
    const d       = new Date(r.hora);
    const icono   = r.tipo === "ingreso" ? "▲" : "▼";
    const label   = r.tipo.charAt(0).toUpperCase() + r.tipo.slice(1);
    const mapsUrl = `https://www.google.com/maps?q=${r.lat},${r.lng}`;
    const reconocimiento = r.reconocido_facial 
      ? '<span title="Reconocido por facial" style="color:#2e7d32;font-weight:bold">👤 Facial</span>'
      : '<span title="Datos completados manualmente" style="color:#ff6f00;font-weight:bold">🖋️ Manual</span>';

    const tr = document.createElement("tr");
    tr.id = `row-${r.id}`;
    tr.innerHTML = `
      <td class="nowrap">${r.empleado}</td>
      <td class="tipo-${r.tipo}">${icono} ${label}</td>
      <td class="nowrap">${d.toLocaleDateString("es-AR")}</td>
      <td class="nowrap">${d.toLocaleTimeString("es-AR", { hour12: false })}</td>
      <td>${r.lugar || "—"}</td>
      <td>${reconocimiento}</td>
      <td>${badgeVerificacion(r)}</td>
      <td class="nowrap"><a href="${mapsUrl}" target="_blank" rel="noopener">📍 Ver mapa</a></td>
      <td><button class="btn-del" onclick="eliminar(${r.id})">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderListaPorObra(datos) {
  const contenedor = document.getElementById("lista-empleados");
  contenedor.innerHTML = "";
  if (!datos.length) return;

  const mapaObra = new Map();
  datos.forEach(r => {
    const key = r.lugar || "Sin obra asignada";
    if (!mapaObra.has(key)) mapaObra.set(key, []);
    mapaObra.get(key).push(r);
  });

  [...mapaObra.keys()].sort().forEach(obraNombre => {
    const registros = mapaObra.get(obraNombre);
    const bloque    = document.createElement("div");
    bloque.className = "empleado-bloque";

    const filas = registros.map(r => {
      const d       = new Date(r.hora);
      const icono   = r.tipo === "ingreso" ? "▲" : "▼";
      const label   = r.tipo.charAt(0).toUpperCase() + r.tipo.slice(1);
      const mapsUrl = `https://www.google.com/maps?q=${r.lat},${r.lng}`;
      const fotoHtml = r.foto_url
        ? `<img class="foto-thumb" src="${r.foto_url}" onclick="verFoto('${r.foto_url}')" alt="foto">`
        : `<div class="foto-none">📷</div>`;
      const reconocimiento = r.reconocido_facial 
        ? '<span title="Reconocido por facial" style="color:#2e7d32;font-weight:bold">👤</span>'
        : '<span title="Datos completados manualmente" style="color:#ff6f00;font-weight:bold">🖋️</span>';

      return `
        <div class="registro-fila" id="fila-${r.id}">
          ${fotoHtml}
          <span class="empleado-nombre">${r.empleado}</span>
          <span class="tipo-${r.tipo}">${icono} ${label}</span>
          <span class="fecha">${d.toLocaleDateString("es-AR")} ${d.toLocaleTimeString("es-AR", { hour12: false })}</span>
          <span class="dir"><a href="${mapsUrl}" target="_blank" rel="noopener">📍 Ver mapa</a></span>
          ${reconocimiento}
          ${badgeVerificacion(r)}
          <button class="btn-del" onclick="eliminar(${r.id})">✕</button>
        </div>`;
    }).join("");

    bloque.innerHTML = `
      <div class="empleado-header">
        <span>🏗 ${obraNombre}</span>
        <span class="badge">${registros.length} registro${registros.length !== 1 ? "s" : ""}</span>
      </div>
      ${filas}
    `;
    contenedor.appendChild(bloque);
  });
}

// ── Lightbox ──────────────────────────────────────────────

function verFoto(url) {
  document.getElementById("lightbox-img").src = url;
  document.getElementById("lightbox").style.display = "flex";
}

// ── Exportar CSV (sin paginación, trae todos los filtrados) ──

async function exportarCSV() {
  const filtros = getFiltros();
  const { data, error } = await aplicarFiltrosQuery(
    db.from("asistencias").select("*").order("hora", { ascending: false }),
    filtros
  );

  if (error) { alert("Error al exportar."); return; }

  const datos = data || [];
  const cab   = "Empleado,Obra,Tipo,Fecha,Hora,Verificacion,Latitud,Longitud\n";
  const filas = datos.map(r => {
    const d     = new Date(r.hora);
    const lugar = (r.lugar || "").replace(/"/g, '""');
    const obra  = obras.find(o => o.nombre === r.lugar);
    let verif   = "Sin zona";
    if (obra && obra.lat != null && r.lat != null) {
      const dist = Math.round(distanciaMetros(obra.lat, obra.lng, r.lat, r.lng));
      verif = dist <= obra.radio ? `En zona (${dist}m)` : `Fuera de zona (${dist}m)`;
    }
    return `"${r.empleado}","${lugar}","${r.tipo}","${d.toLocaleDateString("es-AR")}","${d.toLocaleTimeString("es-AR", { hour12: false })}","${verif}",${r.lat},${r.lng}`;
  }).join("\n");

  const blob = new Blob(["﻿" + cab + filas], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `asistencia_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Eliminar registro ─────────────────────────────────────

async function eliminar(id) {
  if (!confirm("¿Eliminar este registro?")) return;

  const { error } = await db.from("asistencias").delete().eq("id", id);
  if (error) { alert("Error al eliminar."); return; }

  // Si era el único en la página, retroceder una página
  const totalPaginas = Math.ceil((totalRegistros - 1) / POR_PAGINA);
  if (paginaActual > totalPaginas && paginaActual > 1) paginaActual--;

  cargarDatos();
}

function setEstado(msg) {
  document.getElementById("tbody").innerHTML =
    `<tr><td colspan="8" style="text-align:center;padding:20px;color:#888">${msg}</td></tr>`;
}

// ── Planilla de Horario ───────────────────────────────────

function abrirModalPlanilla() {
  const modal = document.getElementById("modal-planilla");
  modal.style.display = "flex";
  document.getElementById("pl-estado").textContent = "";

  // Año: desde 2024 hasta el año actual
  const anioSel = document.getElementById("pl-anio");
  const hoy = new Date();
  anioSel.innerHTML = "";
  for (let y = hoy.getFullYear(); y >= 2024; y--) {
    const opt = document.createElement("option");
    opt.value = y; opt.textContent = y;
    anioSel.appendChild(opt);
  }

  // Mes actual por defecto
  document.getElementById("pl-mes").value = hoy.getMonth() + 1;

  // Cargar empleados
  cargarEmpleadosPlanilla();
}

function cerrarModalPlanilla() {
  document.getElementById("modal-planilla").style.display = "none";
}

async function cargarEmpleadosPlanilla() {
  const { data } = await db.from("empleados").select("nombre, puesto, contratista").order("nombre");
  const sel = document.getElementById("pl-empleado");
  sel.innerHTML = '<option value="">— Seleccioná un asociado —</option>';
  (data || []).forEach(e => {
    const opt = document.createElement("option");
    opt.value       = e.nombre;
    opt.textContent = e.nombre;
    opt.dataset.puesto      = e.puesto      || "";
    opt.dataset.contratista = e.contratista || "";
    sel.appendChild(opt);
  });
}

// ── Mapeo de celdas de la plantilla ──────────────────────
const MAPEO_PLANILLA = {
  puesto:       "A2",   // valor del puesto
  nombre:       "A3",   // nombre y apellido
  contratista:  "C4",   // contratista asignado al registrar la cara
  mesAnio:      "G2",   // mes-año (ej: "Junio-26")
  dataStartRow: 6,      // primera fila de datos
  dataEndRow:   36,     // última fila de datos (31 filas)
  colDia:       "A",    // A6:A36
  colEntrada:   "B",    // B6:B36
  colSalida:    "C",    // C6:C36
  colUbicacion: "F",    // F6:F36
  colEncargado: "G",    // G6:G36
};

const MESES_ES_PL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                     "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS_ES_PL  = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

async function generarPlanilla() {
  const sel       = document.getElementById("pl-empleado");
  const nombreEmp = sel.value;
  const mes       = parseInt(document.getElementById("pl-mes").value);
  const anio      = parseInt(document.getElementById("pl-anio").value);
  const estado    = document.getElementById("pl-estado");

  if (!nombreEmp) { estado.textContent = "Seleccioná un asociado."; return; }

  const opt         = sel.options[sel.selectedIndex];
  const puesto      = opt.dataset.puesto      || "";
  const contratista = opt.dataset.contratista || "";

  estado.textContent = "Consultando registros...";

  const desde = new Date(anio, mes - 1, 1).toISOString();
  const hasta  = new Date(anio, mes, 1).toISOString();

  const { data, error } = await db
    .from("asistencias")
    .select("tipo, hora, lugar")
    .eq("empleado", nombreEmp)
    .gte("hora", desde)
    .lt("hora", hasta)
    .order("hora", { ascending: true });

  if (error) { estado.textContent = "Error al obtener datos."; return; }

  estado.textContent = "Cargando plantilla...";
  try {
    const res = await fetch("public/planilla-horario.xlsx");
    if (!res.ok) throw new Error("No se pudo cargar la plantilla");
    const ab = await res.arrayBuffer();

    estado.textContent = "Generando Excel...";

    const cambios = construirCambios(nombreEmp, puesto, contratista, data, mes, anio);
    const blob    = await aplicarCambiosAPlantilla(ab, cambios);

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Planilla_${nombreEmp.replace(/\s+/g,"_")}_${MESES_ES_PL[mes-1]}_${anio}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);

    estado.textContent = "¡Planilla descargada!";
    setTimeout(() => { estado.textContent = ""; }, 3000);
  } catch (e) {
    estado.textContent = "Error: " + e.message;
  }
}

// Construye el mapa celda → valor con todos los datos del mes
function construirCambios(nombre, puesto, contratista, registros, mes, anio) {
  const M = MAPEO_PLANILLA;
  const cambios = {};

  cambios[M.puesto]      = puesto;
  cambios[M.nombre]      = nombre;
  cambios[M.contratista] = contratista;
  cambios[M.mesAnio]     = `${MESES_ES_PL[mes - 1]}-${String(anio).slice(2)}`;

  // Agrupar registros por fecha
  const byDate = {};
  registros.forEach(r => {
    const fecha = r.hora.slice(0, 10);
    if (!byDate[fecha]) byDate[fecha] = { ingresos: [], salidas: [] };
    if (r.tipo === "ingreso") byDate[fecha].ingresos.push(r);
    else                      byDate[fecha].salidas.push(r);
  });

  // Recorrer TODOS los días del mes en orden, con o sin registros
  const diasDelMes = new Date(anio, mes, 0).getDate(); // 28/29/30/31
  let fila = M.dataStartRow;

  for (let d = 1; d <= diasDelMes && fila <= M.dataEndRow; d++) {
    const fechaKey  = `${anio}-${String(mes).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const diaSemana = DIAS_ES_PL[new Date(anio, mes - 1, d).getDay()];
    const diaLabel  = `${diaSemana} ${String(d).padStart(2,"0")}/${String(mes).padStart(2,"0")}`;
    const { ingresos = [], salidas = [] } = byDate[fechaKey] || {};
    const maxF = Math.max(ingresos.length, salidas.length, 1);

    for (let i = 0; i < maxF && fila <= M.dataEndRow; i++) {
      const ing = ingresos[i];
      const sal = salidas[i];
      cambios[`${M.colDia}${fila}`]       = i === 0 ? diaLabel : "";
      cambios[`${M.colEntrada}${fila}`]   = ing ? new Date(ing.hora).toLocaleTimeString("es-AR", { hour12: false }) : "";
      cambios[`${M.colSalida}${fila}`]    = sal ? new Date(sal.hora).toLocaleTimeString("es-AR", { hour12: false }) : "";
      cambios[`${M.colUbicacion}${fila}`] = ing?.lugar || sal?.lugar || "";
      cambios[`${M.colEncargado}${fila}`] = "";
      fila++;
    }
  }

  return cambios;
}

// Carga el XLSX como ZIP, modifica el XML de la hoja y devuelve un Blob
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

// Modifica celdas directamente en el XML preservando todos los estilos originales
function modificarCeldasXml(xml, cambios) {
  const NS  = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const cells = doc.getElementsByTagNameNS(NS, "c");

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const ref  = cell.getAttribute("r");
    if (!ref || !(ref in cambios)) continue;

    const valor = String(cambios[ref] ?? "");

    // Vaciar contenido actual (mantiene atributos como s= de estilo intactos)
    while (cell.firstChild) cell.removeChild(cell.firstChild);

    // Escribir como inline string — preserva el atributo s= (estilo/borde/color)
    cell.setAttribute("t", "inlineStr");
    const is = doc.createElementNS(NS, "is");
    const t  = doc.createElementNS(NS, "t");
    t.textContent = valor;
    is.appendChild(t);
    cell.appendChild(is);
  }

  return new XMLSerializer().serializeToString(doc);
}

// ── Sesión ────────────────────────────────────────────────

function cerrarSesion() {
  sessionStorage.removeItem("admin_auth");
  window.location.href = "login.html";
}

// ── Init ──────────────────────────────────────────────────

// Debounce en búsqueda por nombre (evita re-query por cada letra)
let _debounce;
document.getElementById("f-nombre").addEventListener("input", () => {
  clearTimeout(_debounce);
  _debounce = setTimeout(aplicarFiltros, 400);
});

cargarDatos();

// ── Refresco automático ──────────────────────────────────
setInterval(cargarDatos, 5000); // Refrescar cada 5 segundos
