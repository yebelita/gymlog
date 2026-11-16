// Copia a www/ solo los archivos de la app (los mismos que precachea sw.js en ASSETS), para que Capacitor los empaquete en el APK.
// No copia sw.js (en el APK no se registra), ni tests/, specs/, scripts/, node_modules/, android/ ni package.json.
// Uso: node scripts/sync-www.mjs [carpeta de salida, por defecto www]   (después: npx cap sync android)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Archivos de la app, relativos a la raíz: la lista ASSETS de sw.js sin './'. Fuente única para que web y APK no diverjan. */
export function appFiles(root = ROOT) {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const m = /const ASSETS = (\[[\s\S]*?\]);/.exec(sw);
  if (!m) throw new Error('No encuentro ASSETS en sw.js');
  return JSON.parse(m[1].replace(/'/g, '"')).filter(a => a !== './').map(a => a.replace(/^\.\//, ''));
}

/** Vacía `out` y copia en él los archivos de la app. Devuelve la lista copiada. */
export function syncWww(root = ROOT, out = path.join(root, 'www')) {
  const files = appFiles(root);
  for (const f of files) if (!fs.existsSync(path.join(root, f))) throw new Error(`Falta ${f} (está en ASSETS de sw.js)`);
  fs.rmSync(out, { recursive: true, force: true });
  for (const f of files) {
    const dest = path.join(out, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(root, f), dest);
  }
  return files;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const out = path.resolve(process.argv[2] || path.join(ROOT, 'www'));
  const files = syncWww(ROOT, out);
  console.log(`${files.length} archivos copiados a ${path.relative(process.cwd(), out) || '.'}`);
}
