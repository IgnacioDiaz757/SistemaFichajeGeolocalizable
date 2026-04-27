// Build para Vercel: copia los archivos a dist/ y genera config.js con las variables de entorno.
// Localmente, config.js ya existe con las credenciales reales (gitignoreado).

const fs   = require("fs");
const path = require("path");

const SUPABASE_URL   = process.env.SUPABASE_URL   || "";
const SUPABASE_KEY   = process.env.SUPABASE_KEY   || "";
const ADMIN_USER     = process.env.ADMIN_USER     || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERROR: Las variables SUPABASE_URL y SUPABASE_KEY son obligatorias en Vercel.");
  process.exit(1);
}
if (!ADMIN_PASSWORD) {
  console.error("ERROR: La variable ADMIN_PASSWORD es obligatoria en Vercel.");
  process.exit(1);
}

const DIST    = path.join(__dirname, "dist");
const EXCLUIR = new Set([".env", ".git", "node_modules", "dist", "build.js",
                          "package.json", "package-lock.json", ".env.example",
                          ".gitignore", "config.js"]);

function copiarDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    if (EXCLUIR.has(entry)) continue;
    const srcPath  = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copiarDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copiarDir(__dirname, DIST);

// Generar config.js con los valores reales de las variables de entorno
const configContent =
`window.APP_CONFIG = {
  SUPABASE_URL:   "${SUPABASE_URL}",
  SUPABASE_KEY:   "${SUPABASE_KEY}",
  ADMIN_USER:     "${ADMIN_USER}",
  ADMIN_PASSWORD: "${ADMIN_PASSWORD}"
};
`;

fs.writeFileSync(path.join(DIST, "config.js"), configContent, "utf-8");
console.log("Build completado → dist/");
