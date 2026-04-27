const SUPABASE_URL = window.APP_CONFIG.SUPABASE_URL;
const SUPABASE_KEY = window.APP_CONFIG.SUPABASE_KEY;
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const MODEL_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights";

let stream               = null;
let descriptoresCapturados = [];
let modelsLoaded         = false;

// ── Modelos ───────────────────────────────────────────────

async function cargarModelos() {
  if (modelsLoaded) return;
  setEstado("Cargando modelos de reconocimiento facial (primera vez puede tardar)...");
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
  setEstado("");
}

// ── Empleados ─────────────────────────────────────────────

async function cargarEmpleados() {
  const { data, error } = await db
    .from("empleados")
    .select("id, nombre, created_at")
    .order("nombre");

  const lista = document.getElementById("lista-empleados");

  if (error || !data) {
    lista.innerHTML = '<p style="color:#c62828;font-size:13px">Error al cargar empleados.</p>';
    return;
  }
  if (!data.length) {
    lista.innerHTML = '<p style="color:#999;font-size:13px">Sin empleados registrados aún.</p>';
    return;
  }

  lista.innerHTML = data.map(e => `
    <div class="empleado-item">
      <span class="empleado-nombre">👤 ${e.nombre}</span>
      <button class="btn-del" onclick="eliminarEmpleado('${e.id}', '${e.nombre.replace(/'/g, "\\'")}')">✕ Eliminar</button>
    </div>
  `).join("");
}

async function eliminarEmpleado(id, nombre) {
  if (!confirm(`¿Eliminar el reconocimiento facial de "${nombre}"?\n\nEl empleado dejará de ser reconocido automáticamente.`)) return;
  const { error } = await db.from("empleados").delete().eq("id", id);
  if (error) { alert("Error al eliminar."); return; }
  cargarEmpleados();
}

// ── Cámara ────────────────────────────────────────────────

async function abrirCamara() {
  const nombre = document.getElementById("inp-nombre").value.trim();
  if (!nombre) { alert("Ingresá el nombre del empleado antes de abrir la cámara."); return; }

  // getUserMedia requiere HTTPS en móviles
  const esSeguro = location.protocol === "https:" ||
                   location.hostname  === "localhost" ||
                   location.hostname  === "127.0.0.1";
  if (!esSeguro) {
    setEstado("La cámara solo funciona con HTTPS. Accedé desde el link seguro de Vercel.", "error");
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    setEstado("Tu navegador no soporta acceso a la cámara. Usá Chrome o Safari actualizado.", "error");
    return;
  }

  setEstado("Preparando...");
  try {
    await cargarModelos();
  } catch {
    setEstado("Error al cargar los modelos. Verificá tu conexión a internet.", "error");
    return;
  }

  // Intentar cámara frontal → si falla, cualquier cámara disponible
  let streamObj = null;
  try {
    streamObj = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
  } catch {
    try {
      streamObj = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setEstado("Permiso denegado. Activá la cámara en Configuración > Permisos del navegador.", "error");
      } else if (err.name === "NotFoundError") {
        setEstado("No se encontró ninguna cámara en este dispositivo.", "error");
      } else if (err.name === "NotReadableError") {
        setEstado("La cámara está en uso por otra app. Cerrala e intentá de nuevo.", "error");
      } else {
        setEstado(`Error de cámara (${err.name}). Intentá recargar la página.`, "error");
      }
      return;
    }
  }

  stream = streamObj;
  const video = document.getElementById("reg-video");
  video.srcObject = stream;
  video.style.transform = "scaleX(-1)";
  descriptoresCapturados = [];
  actualizarProgreso();
  setIndicador("Mirá a la cámara y presioná el botón");
  setBtnCapturar(true);
  document.getElementById("camara-modal").style.display = "flex";
  setEstado("");
}

function cerrarCamara() {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  document.getElementById("camara-modal").style.display = "none";
  descriptoresCapturados = [];
  actualizarProgreso();
}

async function capturarFoto() {
  const video  = document.getElementById("reg-video");
  const canvas = document.getElementById("reg-canvas");
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0);

  setBtnCapturar(false);
  setIndicador("Detectando cara...");

  try {
    const detection = await faceapi
      .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (!detection) {
      setIndicador("No se detectó una cara. Acercate más y mirá de frente.");
      setBtnCapturar(true);
      return;
    }

    descriptoresCapturados.push(Array.from(detection.descriptor));
    actualizarProgreso();

    if (descriptoresCapturados.length >= 3) {
      setIndicador("¡Listo! Guardando...");
      await guardarEmpleado();
      cerrarCamara();
    } else {
      setIndicador(`Foto ${descriptoresCapturados.length}/3 ✓ — Girá levemente la cabeza y sacá otra.`);
      setBtnCapturar(true);
    }
  } catch {
    setIndicador("Error al procesar. Intentá de nuevo.");
    setBtnCapturar(true);
  }
}

function actualizarProgreso() {
  const n = descriptoresCapturados.length;
  for (let i = 0; i < 3; i++) {
    const dot = document.getElementById(`dot-${i}`);
    if (dot) dot.className = "dot" + (i < n ? " dot-ok" : "");
  }
}

// ── Guardar ───────────────────────────────────────────────

async function guardarEmpleado() {
  const nombre = document.getElementById("inp-nombre").value.trim();

  const { error } = await db.from("empleados").upsert(
    [{ nombre, descriptors: descriptoresCapturados }],
    { onConflict: "nombre" }
  );

  if (error) {
    setEstado("Error al guardar. Intentá de nuevo.", "error");
    return;
  }

  document.getElementById("inp-nombre").value = "";
  setEstado(`"${nombre}" registrado correctamente.`, "ok");
  setTimeout(() => setEstado(""), 4000);
  cargarEmpleados();
}

// ── Helpers ───────────────────────────────────────────────

function setEstado(msg, tipo = "") {
  const el = document.getElementById("estado");
  el.textContent = msg;
  el.className   = tipo;
}

function setIndicador(msg) {
  document.getElementById("indicador").textContent = msg;
}

function setBtnCapturar(enabled) {
  document.getElementById("btn-capturar").disabled = !enabled;
}

// ── Init ──────────────────────────────────────────────────

cargarEmpleados();
