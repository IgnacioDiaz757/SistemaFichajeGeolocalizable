// ── Credenciales ──────────────────────────────────────────
// Para cambiar la contraseña, modificá ADMIN_PASSWORD aquí
// o configurá la variable de entorno ADMIN_PASSWORD en Vercel
const ADMIN_USER     = "admin";
const ADMIN_PASSWORD = typeof __ADMIN_PASSWORD__ !== "undefined"
  ? __ADMIN_PASSWORD__
  : "123456";

// ─────────────────────────────────────────────────────────

function login(e) {
  e.preventDefault();

  const usuario  = document.getElementById("usuario").value.trim();
  const password = document.getElementById("password").value;
  const errorEl  = document.getElementById("error");

  if (usuario === ADMIN_USER && password === ADMIN_PASSWORD) {
    sessionStorage.setItem("admin_auth", "ok");
    window.location.href = "admin.html";
  } else {
    errorEl.textContent = "Usuario o contraseña incorrectos";
    document.getElementById("password").value = "";
    document.getElementById("password").focus();
  }
}
