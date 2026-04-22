const SUPABASE_URL = "https://nybbcnuhdoldqqixgugv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55YmJjbnVoZG9sZHFxaXhndWd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MzIzNTQsImV4cCI6MjA5MjQwODM1NH0.G-vLF24JimiiJZ827S6v4JY3e274iFfXcrr7Pxqq9wk";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let todos = [];
let zona  = JSON.parse(localStorage.getItem("zona_obra")) || null;

// ── Zona de obra ──────────────────────────────────────────

function actualizarLabelZona() {
  const el = document.getElementById("zona-label");
  if (zona) {
    el.textContent = `${zona.nombre} — radio ${zona.radio}m`;
    el.className = "zona-activa";
    document.getElementById("z-nombre").value = zona.nombre;
    document.getElementById("z-lat").value    = zona.lat;
    document.getElementById("z-lng").value    = zona.lng;
    document.getElementById("z-radio").value  = zona.radio;
  } else {
    el.textContent = "Sin zona configurada";
    el.className = "zona-inactiva";
  }
}

function guardarZona() {
  const nombre = document.getElementById("z-nombre").value.trim();
  const lat    = parseFloat(document.getElementById("z-lat").value);
  const lng    = parseFloat(document.getElementById("z-lng").value);
  const radio  = parseFloat(document.getElementById("z-radio").value) || 200;

  if (!nombre || isNaN(lat) || isNaN(lng)) {
    alert("Completá nombre, latitud y longitud.");
    return;
  }

  zona = { nombre, lat, lng, radio };
  localStorage.setItem("zona_obra", JSON.stringify(zona));
  actualizarLabelZona();
  document.getElementById("zona-details").removeAttribute("open");
  aplicarFiltros();
}

function borrarZona() {
  zona = null;
  localStorage.removeItem("zona_obra");
  actualizarLabelZona();
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

function badgeVerificacion(lat, lng) {
  if (!zona || lat == null || lng == null) {
    return '<span class="v-none">Sin zona</span>';
  }
  const dist = Math.round(distanciaMetros(zona.lat, zona.lng, lat, lng));
  if (dist <= zona.radio) {
    return `<span class="v-ok">✓ En zona (${dist}m)</span>`;
  }
  return `<span class="v-fail">✗ Fuera de zona (${dist}m)</span>`;
}

// ── Datos ─────────────────────────────────────────────────

async function cargarDatos() {
  setEstado("Cargando...");

  const { data, error } = await db
    .from("asistencias")
    .select("*")
    .order("hora", { ascending: false });

  if (error) { setEstado("Error al cargar los datos."); return; }

  todos = data || [];
  aplicarFiltros();
}

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
  renderTabla(datos);
  renderListaEmpleados(datos);
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
      <td class="nowrap">${d.toLocaleTimeString("es-AR")}</td>
      <td>${r.lugar || "—"}</td>
      <td>${badgeVerificacion(r.lat, r.lng)}</td>
      <td class="nowrap"><a href="${mapsUrl}" target="_blank" rel="noopener">📍 Ver mapa</a></td>
      <td><button class="btn-del" onclick="eliminar(${r.id})">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderListaEmpleados(datos) {
  const contenedor = document.getElementById("lista-empleados");
  contenedor.innerHTML = "";
  if (!datos.length) return;

  const mapaEmp = new Map();
  datos.forEach(r => {
    if (!mapaEmp.has(r.empleado)) mapaEmp.set(r.empleado, []);
    mapaEmp.get(r.empleado).push(r);
  });

  mapaEmp.forEach((registros, nombre) => {
    const bloque = document.createElement("div");
    bloque.className = "empleado-bloque";

    const filas = registros.map(r => {
      const d       = new Date(r.hora);
      const icono   = r.tipo === "ingreso" ? "▲" : "▼";
      const label   = r.tipo.charAt(0).toUpperCase() + r.tipo.slice(1);
      const mapsUrl = `https://www.google.com/maps?q=${r.lat},${r.lng}`;
      const dir     = r.lugar || `${r.lat}, ${r.lng}`;
      const fotoHtml = r.foto_url
        ? `<img class="foto-thumb" src="${r.foto_url}" onclick="verFoto('${r.foto_url}')" alt="foto">`
        : `<div class="foto-none">📷</div>`;

      return `
        <div class="registro-fila" id="fila-${r.id}">
          ${fotoHtml}
          <span class="tipo-${r.tipo}">${icono} ${label}</span>
          <span class="fecha">${d.toLocaleDateString("es-AR")} ${d.toLocaleTimeString("es-AR")}</span>
          <span class="dir"><a href="${mapsUrl}" target="_blank" rel="noopener">📍 ${dir}</a></span>
          ${badgeVerificacion(r.lat, r.lng)}
          <button class="btn-del" onclick="eliminar(${r.id})">✕</button>
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

// ── Lightbox ──────────────────────────────────────────────

function verFoto(url) {
  document.getElementById("lightbox-img").src = url;
  document.getElementById("lightbox").style.display = "flex";
}

// ── Exportar CSV ──────────────────────────────────────────

function exportarCSV() {
  const datos = getFiltrados();
  const cab   = "Empleado,Tipo,Fecha,Hora,Lugar,Verificacion,Latitud,Longitud\n";
  const filas = datos.map(r => {
    const d     = new Date(r.hora);
    const lugar = (r.lugar || "").replace(/"/g, '""');
    let verif   = "Sin zona";
    if (zona && r.lat != null) {
      const dist = Math.round(distanciaMetros(zona.lat, zona.lng, r.lat, r.lng));
      verif = dist <= zona.radio ? `En zona (${dist}m)` : `Fuera de zona (${dist}m)`;
    }
    return `"${r.empleado}","${r.tipo}","${d.toLocaleDateString("es-AR")}","${d.toLocaleTimeString("es-AR")}","${lugar}","${verif}",${r.lat},${r.lng}`;
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

async function eliminar(id) {
  if (!confirm("¿Eliminar este registro?")) return;

  const { error } = await db.from("asistencias").delete().eq("id", id);

  if (error) {
    alert("Error al eliminar.");
    return;
  }

  todos = todos.filter(r => r.id !== id);

  // Quitar las filas del DOM sin re-renderizar todo
  document.getElementById(`row-${id}`)?.remove();
  document.getElementById(`fila-${id}`)?.remove();

  // Si el bloque del empleado quedó vacío, quitarlo
  document.querySelectorAll(".empleado-bloque").forEach(bloque => {
    if (!bloque.querySelectorAll(".registro-fila").length) bloque.remove();
  });

  renderResumen(getFiltrados());
}

function setEstado(msg) {
  document.getElementById("tbody").innerHTML =
    `<tr><td colspan="8" style="text-align:center;padding:20px;color:#888">${msg}</td></tr>`;
}

// ── Init ──────────────────────────────────────────────────

actualizarLabelZona();
cargarDatos();
