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
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#999">Sin registros</td></tr>';
    return;
  }

  datos.forEach(r => {
    const d       = new Date(r.hora);
    const icono   = r.tipo === "ingreso" ? "▲" : "▼";
    const label   = r.tipo.charAt(0).toUpperCase() + r.tipo.slice(1);
    const mapsUrl = `https://www.google.com/maps?q=${r.lat},${r.lng}`;

    const tr = document.createElement("tr");
    tr.id = `row-${r.id}`;
    tr.innerHTML = `
      <td class="nowrap">${r.empleado}</td>
      <td class="tipo-${r.tipo}">${icono} ${label}</td>
      <td class="nowrap">${d.toLocaleDateString("es-AR")}</td>
      <td class="nowrap">${d.toLocaleTimeString("es-AR", { hour12: false })}</td>
      <td>${r.lugar || "—"}</td>
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

      return `
        <div class="registro-fila" id="fila-${r.id}">
          ${fotoHtml}
          <span class="empleado-nombre">${r.empleado}</span>
          <span class="tipo-${r.tipo}">${icono} ${label}</span>
          <span class="fecha">${d.toLocaleDateString("es-AR")} ${d.toLocaleTimeString("es-AR", { hour12: false })}</span>
          <span class="dir"><a href="${mapsUrl}" target="_blank" rel="noopener">📍 Ver mapa</a></span>
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
