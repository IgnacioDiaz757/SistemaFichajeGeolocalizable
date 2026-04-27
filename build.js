// Script de build: reemplaza placeholders con variables de entorno
// Se ejecuta en Vercel antes del deploy. Nunca corre en el navegador.

const fs   = require("fs");
const path = require("path");

const SUPABASE_URL   = process.env.SUPABASE_URL   || "";
const SUPABASE_KEY   = process.env.SUPABASE_KEY   || "";
const ADMIN_USER     = process.env.ADMIN_USER     || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERROR: Las variables SUPABASE_URL y SUPABASE_KEY son obligatorias.");
  process.exit(1);
}
if (!ADMIN_PASSWORD) {
  console.error("ERROR: La variable ADMIN_PASSWORD es obligatoria.");
  process.exit(1);
}

const replacements = {
  "%%SUPABASE_URL%%":   SUPABASE_URL,
  "%%SUPABASE_KEY%%":   SUPABASE_KEY,
  "%%ADMIN_USER%%":     ADMIN_USER,
  "%%ADMIN_PASSWORD%%": ADMIN_PASSWORD,
};

const DIST   = path.join(__dirname, "dist");
const EXCLUIR = new Set([".env", ".git", "node_modules", "dist", "build.js", "package.json", "package-lock.json", ".env.example", ".gitignore"]);
const JS_HTML = new Set([".js", ".html"]);

function copiarDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src)) {
    if (EXCLUIR.has(entry)) continue;

    const srcPath  = path.join(src, entry);
    const destPath = path.join(dest, entry);

    if (fs.statSync(srcPath).isDirectory()) {
      copiarDir(srcPath, destPath);
      continue;
    }

    if (JS_HTML.has(path.extname(entry))) {
      let content = fs.readFileSync(srcPath, "utf-8");
      for (const [placeholder, value] of Object.entries(replacements)) {
        content = content.split(placeholder).join(value);
      }
      fs.writeFileSync(destPath, content, "utf-8");
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copiarDir(__dirname, DIST);
console.log("Build completado → dist/");
