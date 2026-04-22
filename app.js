const SUPABASE_URL = "https://nybbcnuhdoldqqixgugv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55YmJjbnVoZG9sZHFxaXhndWd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MzIzNTQsImV4cCI6MjA5MjQwODM1NH0.G-vLF24JimiiJZ827S6v4JY3e274iFfXcrr7Pxqq9wk";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let lat         = null;
let lng         = null;
let fotoFile    = null;
let stream      = null;
let facingMode  = "environment"; // "environment" = trasera, "user" = frontal

// ── Reloj ─────────────────────────────────────────────────
setInterval(() => {
  document.getElementById("hora").textContent =
    new Date().toLocaleTimeString("es-AR", { hour12: false });
}, 1000);
document.getElementById("hora").textContent =
  new Date().toLocaleTimeString("es-AR", { hour12: false });

// ── GPS ───────────────────────────────────────────────────
navigator.geolocation.getCurrentPosition(
  (pos) => {
    lat = pos.coords.latitude.toFixed(6);
    lng = pos.coords.longitude.toFixed(6);
    document.getElementById("ubicacion").textContent = `${lat}, ${lng}`;
  },
  () => {
    document.getElementById("ubicacion").textContent = "sin GPS";
  },
  { timeout: 10000 }
);

function esperarGPS() {
  return new Promise((resolve) => {
    if (lat !== null) { resolve(); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lat = pos.coords.latitude.toFixed(6);
        lng = pos.coords.longitude.toFixed(6);
        resolve();
      },
      () => resolve(),          // si falla, continúa igual sin GPS
      { timeout: 5000 }
    );
  });
}

// ── Obras ─────────────────────────────────────────────────
async function cargarObras() {
  const sel = document.getElementById("lugar");
  const { data, error } = await db.from("obras").select("nombre").order("nombre");
  sel.innerHTML = '<option value="">Seleccioná la obra...</option>';
  if (!error && data && data.length) {
    data.forEach(o => {
      const opt = document.createElement("option");
      opt.value = o.nombre;
      opt.textContent = o.nombre;
      sel.appendChild(opt);
    });
  } else if (!error) {
    sel.innerHTML = '<option value="">Sin obras configuradas</option>';
  }
}
cargarObras();

// ── Cámara ────────────────────────────────────────────────
async function iniciarStream() {
  if (stream) stream.getTracks().forEach(t => t.stop());

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode, width: { ideal: 1280 }, height: { ideal: 960 } },
    audio: false
  });
  const video = document.getElementById("camara-video");
  video.srcObject = stream;
  video.style.transform = facingMode === "user" ? "scaleX(-1)" : "";
}

async function abrirCamara() {
  const seguro = location.protocol === "https:" ||
                 location.hostname  === "localhost" ||
                 location.hostname  === "127.0.0.1";

  if (seguro && navigator.mediaDevices?.getUserMedia) {
    try {
      facingMode = "environment";
      await iniciarStream();
      document.getElementById("camara-modal").style.display = "flex";
      return;
    } catch {
      // permiso denegado u otro error → fallback
    }
  }

  // Fallback: input file con capture (abre cámara directa en Android)
  document.getElementById("foto-input").click();
}

async function flipCamara() {
  facingMode = facingMode === "environment" ? "user" : "environment";
  try {
    await iniciarStream();
  } catch {
    // si la cámara solicitada no existe, revertir
    facingMode = facingMode === "environment" ? "user" : "environment";
  }
}

// Fallback: cuando el usuario elige foto con el input
document.getElementById("foto-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  mostrarPreview(file);
});

function capturarFoto() {
  const video  = document.getElementById("camara-video");
  const canvas = document.getElementById("camara-canvas");

  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (facingMode === "user") {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0);

  canvas.toBlob((blob) => {
    mostrarPreview(new File([blob], `foto_${Date.now()}.jpg`, { type: "image/jpeg" }));
    cerrarCamara();
  }, "image/jpeg", 0.88);
}

function mostrarPreview(file) {
  fotoFile = file;
  const preview = document.getElementById("foto-preview");
  if (preview.src.startsWith("blob:")) URL.revokeObjectURL(preview.src);
  preview.src           = URL.createObjectURL(file);
  preview.style.display = "block";
  document.getElementById("foto-placeholder").style.display = "none";
  document.getElementById("foto-cambiar").style.display     = "block";
}

function cerrarCamara() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  document.getElementById("camara-modal").style.display = "none";
}

// ── Marcar ────────────────────────────────────────────────
async function marcar(tipo) {
  const empleado   = document.getElementById("empleado").value.trim();
  const lugar      = document.getElementById("lugar").value.trim();
  const btnIngreso = document.getElementById("btn-ingreso");
  const btnSalida  = document.getElementById("btn-salida");

  if (!empleado)  { mostrarMensaje("Ingresá tu nombre primero", "error"); return; }
  if (!lugar)     { mostrarMensaje("Seleccioná la obra", "error"); return; }
  if (!fotoFile)  { mostrarMensaje("Sacá una foto antes de registrar", "error"); return; }

  btnIngreso.disabled = true;
  btnSalida.disabled  = true;

  if (lat === null) {
    mostrarMensaje("Obteniendo GPS...", "");
    await esperarGPS();
  }

  // Subir foto si existe
  let fotoUrl = null;
  if (fotoFile) {
    mostrarMensaje("Subiendo foto...", "");
    const nombre = `${Date.now()}_${empleado.replace(/[^a-zA-Z0-9]/g, "_")}.jpg`;

    const { data: uploadData, error: uploadError } = await db.storage
      .from("fotos")
      .upload(nombre, fotoFile, { contentType: "image/jpeg", upsert: false });

    if (uploadError) {
      mostrarMensaje("Error al subir la foto ✗", "error");
      btnIngreso.disabled = false;
      btnSalida.disabled  = false;
      return;
    }

    const { data: { publicUrl } } = db.storage
      .from("fotos")
      .getPublicUrl(uploadData.path);

    fotoUrl = publicUrl;
  }

  mostrarMensaje("Guardando...", "");

  const { error } = await db.from("asistencias").insert([{
    empleado,
    tipo,
    hora:     new Date().toISOString(),
    lat:      lat !== null ? parseFloat(lat) : null,
    lng:      lng !== null ? parseFloat(lng) : null,
    lugar,
    foto_url: fotoUrl,
  }]);

  btnIngreso.disabled = false;
  btnSalida.disabled  = false;

  if (error) {
    mostrarMensaje("Error al guardar ✗", "error");
  } else {
    const hora = new Date().toLocaleTimeString("es-AR", { hour12: false });
    mostrarMensaje(
      `${tipo === "ingreso" ? "Ingreso" : "Salida"} registrado a las ${hora} ✓`,
      "ok"
    );
    resetFoto();
  }
}

function resetFoto() {
  fotoFile = null;
  const preview = document.getElementById("foto-preview");
  if (preview.src.startsWith("blob:")) URL.revokeObjectURL(preview.src);
  preview.src           = "";
  preview.style.display = "none";
  document.getElementById("foto-placeholder").style.display = "block";
  document.getElementById("foto-cambiar").style.display     = "none";
}

function mostrarMensaje(texto, clase) {
  const el = document.getElementById("mensaje");
  el.textContent = texto;
  el.className   = clase;
}
