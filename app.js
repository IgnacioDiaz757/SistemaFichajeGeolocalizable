// ── Tema ──────────────────────────────────────────────────
function toggleTema() {
  const html   = document.documentElement;
  const isDark = html.getAttribute("data-theme") === "dark";
  html.setAttribute("data-theme", isDark ? "light" : "dark");
  localStorage.setItem("theme", isDark ? "light" : "dark");
  actualizarIconTema();
}

function actualizarIconTema() {
  const btn = document.getElementById("btn-tema");
  if (!btn) return;
  btn.textContent = document.documentElement.getAttribute("data-theme") === "dark" ? "☀️" : "🌙";
}

actualizarIconTema();

const SUPABASE_URL = window.APP_CONFIG.SUPABASE_URL;
const SUPABASE_KEY = window.APP_CONFIG.SUPABASE_KEY;

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Reconocimiento facial ─────────────────────────────────
const MODEL_URL   = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights";
let faceMatcher   = null;
let reconocReady  = false;
let modelsLoaded  = false;
let empleadosInfo = new Map(); // nombre → { obra, contratista }

async function prepararReconocimiento() {
  if (typeof faceapi === "undefined") {
    console.warn("Face-API no cargado");
    return;
  }
  try {
    if (!modelsLoaded) {
      console.log("Cargando modelos de reconocimiento facial...");
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      modelsLoaded = true;
      console.log("✓ Modelos cargados");
    }
    
    const { data, error } = await db.from("empleados").select("nombre, descriptors, obra, contratista");
    
    if (error) {
      console.warn("Error cargando empleados:", error.message);
      return;
    }
    
    if (!data || !data.length) {
      console.warn("No hay empleados registrados en el sistema");
      return;
    }
    
    console.log(`Preparando reconocimiento para ${data.length} empleados`);
    empleadosInfo.clear();
    const labeled = data.map(emp => {
      empleadosInfo.set(emp.nombre, { obra: emp.obra || "", contratista: emp.contratista || "" });
      return new faceapi.LabeledFaceDescriptors(
        emp.nombre,
        emp.descriptors.map(d => new Float32Array(d))
      );
    });
    faceMatcher  = new faceapi.FaceMatcher(labeled, 0.5);
    reconocReady = true;
    console.log("✓ Reconocimiento facial listo");
  } catch (err) {
    console.error("Error en prepararReconocimiento:", err);
  }
}

// ── Scanner UI ────────────────────────────────────────────
let _scannerTimer = null;

function mostrarScanner() {
  clearTimeout(_scannerTimer);
  document.getElementById("scanner-overlay").style.display = "block";
  document.getElementById("scanner-result").style.display  = "none";
  _scannerTimer = setTimeout(ocultarScanner, 10000);
}

function ocultarScanner() {
  clearTimeout(_scannerTimer);
  document.getElementById("scanner-overlay").style.display = "none";
  document.getElementById("scanner-result").style.display  = "none";
  desbloquearCampos();
}

function mostrarResultadoScanner(nombre) {
  clearTimeout(_scannerTimer);
  reconocidoPorFacial = true; // Fue reconocido por facial
  document.getElementById("scanner-overlay").style.display    = "none";
  document.getElementById("scanner-nombre-result").textContent = nombre;
  document.getElementById("scanner-icono").textContent         = "✓";
  document.querySelector(".scanner-label").textContent         = "Bienvenido";
  const result = document.getElementById("scanner-result");
  result.classList.remove("scanner-result-error");
  result.style.display = "flex";
  bloquearCampos(); // nombre y obra quedan fijos
}

function mostrarErrorScanner() {
  clearTimeout(_scannerTimer);
  reconocidoPorFacial = false; // No fue reconocido
  document.getElementById("scanner-overlay").style.display    = "none";
  document.getElementById("scanner-nombre-result").textContent = "Cara no registrada\nCompletá los campos de abajo";
  document.getElementById("scanner-icono").textContent         = "✕";
  document.querySelector(".scanner-label").textContent         = "No reconocido";
  const result = document.getElementById("scanner-result");
  result.classList.add("scanner-result-error");
  result.style.display = "flex";
  desbloquearCampos(); // Los campos quedan editables para completarlos manualmente
  // Se oculta solo después de 5s
  _scannerTimer = setTimeout(() => {
    result.style.display = "none";
    result.classList.remove("scanner-result-error");
  }, 5000);
}

function bloquearCampos() {
  document.getElementById("empleado").disabled = true;
  document.getElementById("lugar").disabled    = true;
}

function desbloquearCampos() {
  document.getElementById("empleado").disabled = false;
  document.getElementById("lugar").disabled    = false;
}

async function reconocerEnFoto(imgElement) {
  // Esperar a que estén listos los modelos (máx 8s)
  if (!modelsLoaded) {
    let esperas = 0;
    while (!modelsLoaded && esperas < 16) {
      await new Promise(r => setTimeout(r, 500));
      esperas++;
    }
  }

  if (!reconocReady || !faceMatcher) {
    console.warn("Reconocimiento no disponible");
    mostrarErrorScanner();
    return;
  }

  try {
    const det = await faceapi
      .detectSingleFace(imgElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (!det) {
      console.warn("No se detectó cara en la foto");
      mostrarErrorScanner();
      return;
    }

    const match = faceMatcher.findBestMatch(det.descriptor);
    if (match.label !== "unknown") {
      document.getElementById("empleado").value = match.label;
      // Auto-completar obra asignada
      const info = empleadosInfo.get(match.label);
      if (info?.obra) {
        const sel = document.getElementById("lugar");
        for (let i = 0; i < sel.options.length; i++) {
          if (sel.options[i].value === info.obra) { sel.selectedIndex = i; break; }
        }
      }
      mostrarResultadoScanner(match.label);
    } else {
      console.warn("Cara no está registrada en el sistema");
      mostrarErrorScanner();
    }
  } catch (err) {
    console.error("Error en reconocimiento facial:", err);
    mostrarErrorScanner();
  }
}

// Aprende la cara del empleado desde la foto de asistencia (fire & forget)
async function guardarCaraParaReconocimiento(nombreEmpleado, file) {
  if (typeof faceapi === "undefined" || !file) return;
  try {
    if (!modelsLoaded) return; // modelos no listos, no vale la pena esperar
    const img    = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.src = blobUrl;
    await new Promise(r => { img.onload = r; });
    const det = await faceapi
      .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();
    URL.revokeObjectURL(blobUrl);
    if (!det) return;

    const nuevoDescriptor = Array.from(det.descriptor);

    // Mantener hasta 5 descriptores por empleado para mejor precisión
    const { data: existente } = await db
      .from("empleados")
      .select("descriptors")
      .eq("nombre", nombreEmpleado)
      .maybeSingle();

    if (existente) {
      // Solo actualizar descriptores — obra y contratista los gestiona el admin
      const descriptors = [...existente.descriptors, nuevoDescriptor].slice(-5);
      await db.from("empleados").update({ descriptors }).eq("nombre", nombreEmpleado);
    } else {
      // Primer registro: guardar también la obra actual seleccionada
      const obraActual = document.getElementById("lugar").value || null;
      await db.from("empleados").insert([{
        nombre: nombreEmpleado,
        descriptors: [nuevoDescriptor],
        obra: obraActual,
      }]);
    }

    // Refrescar el matcher con los nuevos datos (modelos ya cargados, solo re-query)
    prepararReconocimiento();
  } catch { /* silencioso — la asistencia ya fue registrada */ }
}

// Carga modelos en segundo plano al iniciar la página
prepararReconocimiento();

// Reintentar cada 5s si falló
setInterval(() => {
  if (!reconocReady) {
    prepararReconocimiento();
  }
}, 5000);

let lat         = null;
let lng         = null;
let fotoFile    = null;
let stream      = null;
let facingMode  = "environment"; // "environment" = trasera, "user" = frontal
let reconocidoPorFacial = false; // Rastrear si fue reconocido por facial

// ── Reloj ─────────────────────────────────────────────────
setInterval(() => {
  document.getElementById("hora").textContent =
    new Date().toLocaleTimeString("es-AR", { hour12: false });
}, 1000);
document.getElementById("hora").textContent =
  new Date().toLocaleTimeString("es-AR", { hour12: false });

// ── GPS ───────────────────────────────────────────────────
async function iniciarPermisosGPS() {
  // Si el navegador soporta la API de permisos, consultamos antes de pedir
  if (navigator.permissions) {
    try {
      const result = await navigator.permissions.query({ name: "geolocation" });
      if (result.state === "granted") {
        // Ya tenía permiso: obtener silenciosamente sin mostrar modal
        obtenerUbicacionSilenciosa();
        return;
      }
      if (result.state === "denied") {
        // Permiso denegado de antes: mostrar modal informando
        mostrarModalGPS("denegado");
        return;
      }
    } catch { /* algunos browsers no soportan permissions API */ }
  }
  // Estado "prompt" o no hay API de permisos: mostrar modal
  mostrarModalGPS();
}

function mostrarModalGPS(estado) {
  const modal = document.getElementById("modal-gps");
  if (!modal) return;
  modal.classList.add("visible");

  if (estado === "denegado") {
    document.getElementById("gps-vista-pedir").style.display    = "none";
    document.getElementById("gps-vista-denegado").style.display = "block";
  }
}

function cerrarModalGPS() {
  const modal = document.getElementById("modal-gps");
  if (modal) modal.classList.remove("visible");
}

function obtenerUbicacionSilenciosa() {
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
}

function solicitarUbicacion() {
  const btnEl    = document.getElementById("btn-permitir-gps");
  const estadoEl = document.getElementById("gps-estado");

  btnEl.disabled       = true;
  btnEl.textContent    = "Obteniendo ubicación…";
  estadoEl.textContent = "";
  estadoEl.className   = "gps-estado";

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      lat = pos.coords.latitude.toFixed(6);
      lng = pos.coords.longitude.toFixed(6);
      document.getElementById("ubicacion").textContent = `${lat}, ${lng}`;
      estadoEl.textContent = "✓ Ubicación obtenida";
      estadoEl.className   = "gps-estado ok";
      setTimeout(cerrarModalGPS, 800);
    },
    (err) => {
      btnEl.disabled    = false;
      btnEl.textContent = "📍 Intentar de nuevo";
      if (err.code === 1) {
        // Permiso denegado: cambiar a vista con instrucciones
        document.getElementById("gps-vista-pedir").style.display    = "none";
        document.getElementById("gps-vista-denegado").style.display = "block";
      } else {
        btnEl.disabled    = false;
        btnEl.textContent = "📍 Intentar de nuevo";
        estadoEl.textContent = "No se pudo obtener la ubicación. Intentá de nuevo.";
        estadoEl.className   = "gps-estado error";
      }
    },
    { timeout: 12000, enableHighAccuracy: true }
  );
}

function omitirGPS() {
  document.getElementById("ubicacion").textContent = "sin GPS";
  cerrarModalGPS();
}

// Iniciar al cargar la página
iniciarPermisosGPS();

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
  ocultarScanner();      // limpia resultado anterior
  desbloquearCampos();   // desbloquea si venía de un reconocimiento
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

  // Al cargar la imagen: mostrar scanner siempre y luego reconocer
  preview.onload = () => {
    mostrarScanner(); // Mostrar escáner siempre, sin condición
    if (reconocReady) {
      reconocerEnFoto(preview);
    } else {
      // Si los modelos no están listos, mostrar error después de 3s
      setTimeout(mostrarErrorScanner, 3000);
      console.warn("Modelos de reconocimiento facial no listos");
    }
    preview.onload = null;
  };
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
    reconocido_facial: reconocidoPorFacial,
  }]);

  btnIngreso.disabled = false;
  btnSalida.disabled  = false;

  if (error) {
    console.error("Error al guardar asistencia:", error);
    mostrarMensaje("Error al guardar ✗ — " + (error.message || error.code || "ver consola"), "error");
  } else {
    const hora = new Date().toLocaleTimeString("es-AR", { hour12: false });
    mostrarMensaje(
      `${tipo === "ingreso" ? "Ingreso" : "Salida"} registrado a las ${hora} ✓`,
      "ok"
    );
    // Aprender la cara en segundo plano usando esta misma foto de asistencia
    guardarCaraParaReconocimiento(empleado, fotoFile);
    resetFoto();
  }
}

function resetFoto() {
  fotoFile = null;
  reconocidoPorFacial = false;
  ocultarScanner();
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
