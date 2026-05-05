const SUPABASE_URL = window.APP_CONFIG.SUPABASE_URL;
const SUPABASE_KEY = window.APP_CONFIG.SUPABASE_KEY;

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let obras = [];
let contratistas = [];
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
        <span class="obra-coords">${o.encargado ? `Encargado: ${o.encargado}` : "Sin encargado asignado"}</span>
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
  const nombre     = document.getElementById("z-nombre").value.trim();
  const encargado  = document.getElementById("z-encargado").value.trim();
  const latVal     = document.getElementById("z-lat").value;
  const lngVal     = document.getElementById("z-lng").value;
  const lat        = latVal ? parseFloat(latVal) : null;
  const lng        = lngVal ? parseFloat(lngVal) : null;
  const radio      = parseInt(document.getElementById("z-radio").value) || 200;

  if (!nombre) { alert("Ingresá el nombre de la obra."); return; }

  const { data, error } = await db.from("obras").insert([{ nombre, encargado: encargado || null, lat, lng, radio }]).select();
  if (error) { alert("Error al guardar la obra."); return; }

  obras.push(data[0]);
  renderGestionObras();
  document.getElementById("z-nombre").value    = "";
  document.getElementById("z-encargado").value = "";
  document.getElementById("z-lat").value       = "";
  document.getElementById("z-lng").value       = "";
  document.getElementById("z-radio").value     = "200";
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

// ── Gestión de contratistas ───────────────────────────────

async function cargarContratistas() {
  const { data, error } = await db.from("contratistas").select("*").order("nombre");
  if (!error) contratistas = data || [];
  renderGestionContratistas();
}

function renderGestionContratistas() {
  const contenedor = document.getElementById("contratistas-lista");
  if (!contratistas.length) {
    contenedor.innerHTML = '<p style="color:#999;font-size:13px;padding:12px 16px">Sin contratistas configurados. Agregá uno con el botón.</p>';
    return;
  }
  contenedor.innerHTML = contratistas.map(c => `
    <div class="obra-item">
      <span class="obra-nombre">🏢 ${c.nombre}</span>
      <button class="btn-del" onclick="eliminarContratista('${c.id}', '${c.nombre.replace(/'/g, "\\'")}')">✕</button>
    </div>`).join("");
}

function toggleNuevoContratista() {
  const form = document.getElementById("nuevo-contratista-form");
  form.style.display = form.style.display === "none" ? "flex" : "none";
}

async function agregarContratista() {
  const nombre = document.getElementById("ct-nombre").value.trim();
  if (!nombre) { alert("Ingresá el nombre del contratista."); return; }
  const { data, error } = await db.from("contratistas").insert([{ nombre }]).select();
  if (error) { alert("Error al guardar: " + error.message); return; }
  contratistas.push(data[0]);
  contratistas.sort((a, b) => a.nombre.localeCompare(b.nombre));
  renderGestionContratistas();
  document.getElementById("ct-nombre").value = "";
  document.getElementById("nuevo-contratista-form").style.display = "none";
}

async function eliminarContratista(id, nombre) {
  if (!confirm(`¿Eliminar el contratista "${nombre}"?`)) return;
  const { error } = await db.from("contratistas").delete().eq("id", id);
  if (error) { alert("Error al eliminar."); return; }
  contratistas = contratistas.filter(c => c.id !== id);
  renderGestionContratistas();
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
    return `<span class="v-none">${r.lugar || 'Sin zona'}</span>`;
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
  await Promise.all([cargarObras(), cargarContratistas()]);

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
      ? '<span title="Reconocido por facial" style="color:#2e7d32;font-weight:bold"><i data-lucide="user"></i> Facial</span>'
      : '<span title="Datos completados manualmente" style="color:#ff6f00;font-weight:bold"><i data-lucide="pen"></i> Manual</span>';

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
      <td class="nowrap"><a href="${mapsUrl}" target="_blank" rel="noopener"><i data-lucide="map-pin"></i> Ver mapa</a></td>
      <td><button class="btn-del" onclick="eliminar(${r.id})">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
  lucide.createIcons();
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

let _empleadosPlanilla = [];

async function cargarEmpleadosPlanilla() {
  const { data } = await db.from("empleados").select("nombre, puesto, contratista, obra").order("nombre");
  _empleadosPlanilla = data || [];

  // Llenar selector de contratistas con valores únicos
  const selC = document.getElementById("pl-contratista");
  selC.innerHTML = '<option value="">— Todos los contratistas —</option>';
  const contratistas = [...new Set(_empleadosPlanilla.map(e => e.contratista).filter(Boolean))].sort();
  contratistas.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    selC.appendChild(opt);
  });

  filtrarEmpleadosPlanilla();
}

function filtrarEmpleadosPlanilla() {
  const contratista = document.getElementById("pl-contratista").value;
  const sel = document.getElementById("pl-empleado");
  sel.innerHTML = '<option value="">— Seleccioná un asociado —</option>';
  const lista = contratista
    ? _empleadosPlanilla.filter(e => e.contratista === contratista)
    : _empleadosPlanilla;
  lista.forEach(e => {
    const opt = document.createElement("option");
    opt.value       = e.nombre;
    opt.textContent = e.nombre;
    opt.dataset.puesto      = e.puesto      || "";
    opt.dataset.contratista = e.contratista || "";
    const obraEmp = obras.find(o => o.nombre === e.obra);
    opt.dataset.encargado   = obraEmp?.encargado || "";
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
  colNombre:    "D",    // D6:D36
  colUbicacion: "F",    // F6:F36
  colEncargado: "G",    // G6:G36
};

const MESES_ES_PL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                     "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS_ES_PL  = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const INICIALES_DIA = ["D","L","M","M","J","V","S"]; // D=Dom L=Lun M=Mar/Mié J=Jue V=Vie S=Sáb

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
  const encargado   = opt.dataset.encargado   || "";

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

    const cambios = construirCambios(nombreEmp, puesto, contratista, encargado, data, mes, anio);
    const blob    = await aplicarCambiosAPlantilla(ab, cambios);

    // Descargar localmente (siempre)
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Planilla_${nombreEmp.replace(/\s+/g,"_")}_${MESES_ES_PL[mes-1]}_${anio}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    estado.textContent = "✓ Descargada";

    // Guardar en historial (JSON metadata + Storage)
    try {
      const sanitizado = nombreEmp.normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+/g,"_").replace(/[^a-zA-Z0-9_\-]/g,"").slice(0,50);
      const fn = `planilla_${sanitizado}_${anio}-${String(mes).padStart(2,"0")}.xlsx`;
      await db.storage.from("planillas").upload(fn, blob, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });
      // Actualizar JSON de metadatos del empleado
      const metaFn = `meta_${sanitizado}.json`;
      const mesKey = `${anio}-${String(mes).padStart(2,"0")}`;
      let meses = [];
      try {
        const { data: { publicUrl } } = db.storage.from("planillas").getPublicUrl(metaFn);
        const r = await fetch(`${publicUrl}?t=${Date.now()}`);
        if (r.ok) meses = await r.json();
      } catch { /* primera vez, empieza vacío */ }
      if (!meses.includes(mesKey)) meses.push(mesKey);
      const metaBlob = new Blob([JSON.stringify(meses)], { type: "application/json" });
      await db.storage.from("planillas").upload(metaFn, metaBlob, { upsert: true });
      estado.textContent = "✓ Descargada y guardada en historial";
    } catch { /* silencioso — historial es opcional */ }

    setTimeout(() => { estado.textContent = ""; }, 3000);
  } catch (e) {
    estado.textContent = "Error: " + e.message;
  }
}

// Construye el mapa celda → valor con todos los datos del mes
function construirCambios(nombre, puesto, contratista, encargado, registros, mes, anio) {
  const M = MAPEO_PLANILLA;
  const cambios = {};

  cambios[M.puesto]      = `PUESTO: ${puesto.toUpperCase()}`;
  cambios[M.nombre]      = `NOMBRE Y APELLIDO: ${nombre.toUpperCase()}`;
  cambios[M.contratista] = contratista.toUpperCase();
  cambios[M.mesAnio]     = `${MESES_ES_PL[mes - 1]}-${String(anio).slice(2)}`;

  for (let r = M.dataStartRow; r <= M.dataEndRow; r++) {
    cambios[`${M.colEncargado}${r}`] = { v: encargado.toUpperCase() || "SIN ENCARGADO", smallStyle: true };
  }

  // Agrupar registros por fecha
  const byDate = {};
  registros.forEach(r => {
    const fecha = r.hora.slice(0, 10);
    if (!byDate[fecha]) byDate[fecha] = { ingresos: [], salidas: [] };
    if (r.tipo === "ingreso") byDate[fecha].ingresos.push(r);
    else                      byDate[fecha].salidas.push(r);
  });

  // Recorrer TODOS los días del mes en orden, con o sin registros
  const diasDelMes = new Date(anio, mes, 0).getDate(); // 28/29/30/31 según el mes y año
  let fila = M.dataStartRow;

  for (let d = 1; d <= diasDelMes && fila <= M.dataEndRow; d++) {
    const fechaKey  = `${anio}-${String(mes).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const diaSemana = new Date(anio, mes - 1, d).getDay();
    const inicial   = INICIALES_DIA[diaSemana];
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
      cambios[`${M.colNombre}${fila}`]    = { v: i === 0 ? nombre.toUpperCase() : "", bold: true, size: 10 };
      cambios[`${M.colUbicacion}${fila}`] = { v: (ing?.lugar || sal?.lugar || "").toUpperCase(), bold: true, size: 10 };
      fila++;
    }
  }

  // Limpiar filas sobrantes: borra el placeholder de días que no existen en el mes
  // Ej: abril tiene 30 días → borra la fila del día 31
  for (let r = fila; r <= M.dataEndRow; r++) {
    cambios[`${M.colDia}${r}`]       = "";
    cambios[`${M.colEntrada}${r}`]   = { v: "", bold: true, size: 14 };
    cambios[`${M.colSalida}${r}`]    = { v: "", bold: true, size: 14 };
    cambios[`${M.colNombre}${r}`]    = { v: "", bold: true, size: 10 };
    cambios[`${M.colUbicacion}${r}`] = { v: "", bold: true, size: 10 };
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
  cambios[`A${RES_INI}`]   = `RESUMEN HORAS TRABAJADAS — ${MESES_ES_PL[mes-1].toUpperCase()} ${anio}`;
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

// Carga el XLSX como ZIP, modifica el XML de la hoja y devuelve un Blob
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

  const fontsEl    = doc.getElementsByTagNameNS(NS, "fonts")[0];
  const newFontIdx = parseInt(fontsEl.getAttribute("count"));
  const font = doc.createElementNS(NS, "font");
  font.appendChild(doc.createElementNS(NS, "b"));
  const sz = doc.createElementNS(NS, "sz");   sz.setAttribute("val", "10");      font.appendChild(sz);
  const nm = doc.createElementNS(NS, "name"); nm.setAttribute("val", "Calibri"); font.appendChild(nm);
  const fm = doc.createElementNS(NS, "family"); fm.setAttribute("val", "2");     font.appendChild(fm);
  fontsEl.appendChild(font);
  fontsEl.setAttribute("count", String(newFontIdx + 1));

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
    xf.setAttribute("fillId",   "3"); // mismo gris que encabezados
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
  const NS   = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const doc  = new DOMParser().parseFromString(xml, "application/xml");
  const sheetData = doc.getElementsByTagNameNS(NS, "sheetData")[0];
  const cells = doc.getElementsByTagNameNS(NS, "c");

  // Primero, modificar celdas existentes
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const ref  = cell.getAttribute("r");
    if (!ref || !(ref in cambios)) continue;

    const entrada  = cambios[ref];
    const esObj    = entrada !== null && typeof entrada === "object";
    const valor    = esObj ? String(entrada.v ?? "") : String(entrada ?? "");

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

  // Segundo, crear celdas que no existen
  for (const ref in cambios) {
    const entrada  = cambios[ref];
    const esObj    = entrada !== null && typeof entrada === "object";
    const valor    = esObj ? String(entrada.v ?? "") : String(entrada ?? "");

    // Extraer fila del ref (ej: "G6" → fila 6)
    const filaMatch = ref.match(/(\d+)$/);
    if (!filaMatch) continue;
    const fila = parseInt(filaMatch[1]);

    // Buscar o crear la fila
    let row = null;
    const rows = doc.getElementsByTagNameNS(NS, "row");
    for (let i = 0; i < rows.length; i++) {
      if (parseInt(rows[i].getAttribute("r")) === fila) {
        row = rows[i];
        break;
      }
    }
    if (!row) {
      row = doc.createElementNS(NS, "row");
      row.setAttribute("r", String(fila));
      sheetData.appendChild(row);
    }

    // Crear la celda
    const cell = doc.createElementNS(NS, "c");
    cell.setAttribute("r", ref);
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
    row.appendChild(cell);
  }

  return new XMLSerializer().serializeToString(doc);
}

// ── Planilla de ejemplo ───────────────────────────────────

async function generarPlanillaEjemplo() {
  const mes    = parseInt(document.getElementById("pl-mes").value);
  const anio   = parseInt(document.getElementById("pl-anio").value);
  const estado = document.getElementById("pl-estado");

  estado.textContent = "Generando planilla de ejemplo…";

  // Horarios variados para que el modelo se vea realista
  const tablaHorarios = [
    { e: [7, 20], s: [17,  0] },
    { e: [7, 30], s: [17, 30] },
    { e: [7, 15], s: [16, 45] },
    { e: [7, 45], s: [17, 15] },
    { e: [7, 25], s: [17,  0] },
    { e: [7, 30], s: [16, 30] },
  ];

  const registros = [];
  const diasDelMes = new Date(anio, mes, 0).getDate();

  for (let d = 1; d <= diasDelMes; d++) {
    const diaSemana = new Date(anio, mes - 1, d).getDay();
    if (diaSemana === 0) continue; // sin domingos

    const h = tablaHorarios[(d - 1) % tablaHorarios.length];
    registros.push({
      tipo:  "ingreso",
      hora:  new Date(anio, mes - 1, d, h.e[0], h.e[1], 0).toISOString(),
      lugar: "RIVERAS DEL SUQUIA",
    });
    registros.push({
      tipo:  "salida",
      hora:  new Date(anio, mes - 1, d, h.s[0], h.s[1], 0).toISOString(),
      lugar: "RIVERAS DEL SUQUIA",
    });
  }

  try {
    const res = await fetch("public/planilla-horario.xlsx");
    if (!res.ok) throw new Error("No se pudo cargar la plantilla");
    const ab = await res.arrayBuffer();

    const cambios = construirCambios(
      "EMPLEADO EJEMPLO", "OPERARIO", "RIVERAS DEL SUQUIA",
      "", registros, mes, anio
    );
    const blob = await aplicarCambiosAPlantilla(ab, cambios);

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Planilla_EJEMPLO_${MESES_ES_PL[mes - 1]}_${anio}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);

    estado.textContent = "✓ Ejemplo descargado";
    setTimeout(() => { estado.textContent = ""; }, 3000);
  } catch (e) {
    estado.textContent = "Error: " + e.message;
  }
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
