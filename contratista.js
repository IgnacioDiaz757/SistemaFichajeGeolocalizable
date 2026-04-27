const SUPABASE_URL = "%%SUPABASE_URL%%";
const SUPABASE_KEY = "%%SUPABASE_KEY%%";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let obraData = null;
let todos    = [];

// ── Init ──────────────────────────────────────────────────

async function init() {
  const token = new URLSearchParams(window.location.search).get("obra");

  if (!token) {
    mostrarError("Link inválido. Pedile al administrador el link correcto.");
    return;
  }

  const { data, error } = await db
    .from("obras")
    .select("*")
    .eq("token", token)
    .single();

  if (error || !data) {
    mostrarError("Obra no encontrada o link expirado.");
    return;
  }

  obraData = data;
  document.title = `${obraData.nombre} — Asistencia`;
  document.getElementById("obra-titulo").textContent = obraData.nombre;
  document.getElementById("lista-titulo").textContent = `Registros — ${obraData.nombre}`;
  document.getElementById("contenido").style.display = "block";

  await cargarRegistros();
}

async function cargarRegistros() {
  document.getElementById("lista-empleados").innerHTML =
    '<p style="color:#888;padding:16px">Cargando...</p>';

  const { data, error } = await db
    .from("asistencias")
    .select("*")
    .eq("lugar", obraData.nombre)
    .order("hora", { ascending: false });

  if (error) { mostrarError("Error al cargar los registros."); return; }

  todos = data || [];
  aplicarFiltros();
}

// ── Filtros ───────────────────────────────────────────────

function getFiltrados() {
  const nombre = document.getElementById("f-nombre").value.toLowerCase().trim();
  const desde  = document.getElementById("f-desde").value;
  const hasta  = document.getElementById("f-hasta").value;

  return todos.filter(r => {
    if (nombre && !r.empleado.toLowerCase().includes(nombre)) return false;
    const t = new Date(r.hora);
    if (desde && t < new Date(desde))               return false;
    if (hasta && t > new Date(hasta + "T23:59:59")) return false;
    return true;
  });
}

function aplicarFiltros() {
  const datos = getFiltrados();
  renderResumen(datos);
  renderLista(datos);
}

function limpiarFiltros() {
  document.getElementById("f-nombre").value = "";
  document.getElementById("f-desde").value  = "";
  document.getElementById("f-hasta").value  = "";
  aplicarFiltros();
}

// ── Render ────────────────────────────────────────────────

function renderResumen(datos) {
  document.getElementById("cnt-total").textContent    = datos.length;
  document.getElementById("cnt-ingresos").textContent = datos.filter(r => r.tipo === "ingreso").length;
  document.getElementById("cnt-salidas").textContent  = datos.filter(r => r.tipo === "salida").length;
}

function renderLista(datos) {
  const contenedor = document.getElementById("lista-empleados");
  contenedor.innerHTML = "";

  if (!datos.length) {
    contenedor.innerHTML = '<p style="color:#999;padding:16px">Sin registros.</p>';
    return;
  }

  const mapaEmp = new Map();
  datos.forEach(r => {
    if (!mapaEmp.has(r.empleado)) mapaEmp.set(r.empleado, []);
    mapaEmp.get(r.empleado).push(r);
  });

  [...mapaEmp.keys()].sort().forEach(nombre => {
    const registros = mapaEmp.get(nombre);
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
        <div class="registro-fila">
          ${fotoHtml}
          <span class="tipo-${r.tipo}">${icono} ${label}</span>
          <span class="fecha">${d.toLocaleDateString("es-AR")} ${d.toLocaleTimeString("es-AR", { hour12: false })}</span>
          <a href="${mapsUrl}" target="_blank" rel="noopener" style="font-size:13px">📍 Ver mapa</a>
          ${badgeVerificacion(r)}
        </div>`;
    }).join("");

    bloque.innerHTML = `
      <div class="empleado-header">
        <span>${nombre}</span>
        <span class="badge">${registros.length} registro${registros.length !== 1 ? "s" : ""}</span>
      </div>
      ${filas}
    `;
    contenedor.appendChild(bloque);
  });
}

// ── GPS ───────────────────────────────────────────────────

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
  if (!obraData || obraData.lat == null || r.lat == null || r.lng == null) {
    return '<span class="v-none">Sin zona</span>';
  }
  const dist = Math.round(distanciaMetros(obraData.lat, obraData.lng, r.lat, r.lng));
  if (dist <= obraData.radio) {
    return `<span class="v-ok">✓ En zona (${dist}m)</span>`;
  }
  return `<span class="v-fail">✗ Fuera de zona (${dist}m)</span>`;
}

// ── Lightbox ──────────────────────────────────────────────

function verFoto(url) {
  document.getElementById("lightbox-img").src = url;
  document.getElementById("lightbox").style.display = "flex";
}

// ── Error ─────────────────────────────────────────────────

function mostrarError(msg) {
  document.getElementById("obra-titulo").textContent = "Error";
  document.getElementById("error-msg").textContent   = msg;
  document.getElementById("error-msg").style.display = "block";
}

// ── Start ─────────────────────────────────────────────────

init();
