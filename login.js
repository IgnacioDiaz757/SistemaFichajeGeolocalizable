const ADMIN_USER     = "%%ADMIN_USER%%";
const ADMIN_PASSWORD = "%%ADMIN_PASSWORD%%";

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
