// Genera src/body-paths.js a partir de los .swift de MuscleMap (Melih Colpan, MIT):
//   https://github.com/melihcolpan/MuscleMap  →  Sources/MuscleMap/Data/
// Uso: node scripts/build-body-paths.mjs <carpeta con MaleFrontPaths.swift, MaleBackPaths.swift,
//        FemaleFrontPaths.swift, FemaleBackPaths.swift y BodyPathData.swift>
// Solo dev: la app no ejecuta esto, solo carga el resultado. La salida es determinista.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = process.argv[2];
if (!dir) { console.error('Uso: node scripts/build-body-paths.mjs <carpeta con los .swift de MuscleMap>'); process.exit(1); }
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');

// Músculos que la app sabe colorear, y partes que solo se dibujan como silueta
const MUSCLES = ['trapezius', 'deltoids', 'chest', 'upper-back', 'serratus', 'biceps', 'triceps', 'forearm', 'abs', 'obliques', 'lower-back',
  'gluteal', 'quadriceps', 'hamstring', 'adductors', 'hip-flexors', 'calves', 'tibialis'];
const INERT = ['head', 'hair', 'neck', 'hands', 'feet', 'knees', 'ankles'];
// Subgrupos de MuscleMap: se superponen al músculo padre. Si el padre existe en la vista se descartan; si no, se fusionan en él.
const SUBS = { frontDeltoid: 'deltoids', rearDeltoid: 'deltoids', rotatorCuff: 'deltoids', innerQuad: 'quadriceps', outerQuad: 'quadriceps',
  upperAbs: 'abs', lowerAbs: 'abs', upperChest: 'chest', lowerChest: 'chest', upperTrapezius: 'trapezius', lowerTrapezius: 'trapezius', rhomboids: 'upper-back' };
const kebab = s => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase());

function parseViewBox(name) {
  const m = new RegExp(`static let ${name} = BodyViewBox\\(\\s*origin: CGPoint\\(x: (-?[\\d.]+), y: (-?[\\d.]+)\\),\\s*size: CGSize\\(width: ([\\d.]+), height: ([\\d.]+)\\)`).exec(read('BodyPathData.swift'));
  if (!m) throw new Error('No encuentro el viewBox ' + name);
  return m.slice(1, 5).join(' ');
}

function parseView(file) {
  const parts = {};
  const blocks = read(file).split('BodyPartPathData(').slice(1);
  for (const b of blocks) {
    const slug = /slug:\s*\.(\w+)/.exec(b)?.[1];
    if (!slug) throw new Error('Bloque sin slug en ' + file);
    const d = [];
    for (const key of ['common', 'left', 'right']) {
      const arr = new RegExp(`\\b${key}:\\s*\\[([^\\]]*)\\]`).exec(b);
      if (arr) for (const q of arr[1].matchAll(/"([^"]+)"/g)) d.push(q[1]);
    }
    if (!d.length) throw new Error(`Sin paths para ${slug} en ${file}`);
    (parts[slug] ||= []).push(...d);
  }
  const out = {};
  const put = (slug, d) => { (out[slug] ||= []).push(...d); };
  for (const [slug, d] of Object.entries(parts)) {
    const k = kebab(slug);
    if (MUSCLES.includes(k) || INERT.includes(k)) put(k, d);
  }
  for (const [slug, parent] of Object.entries(SUBS)) if (parts[slug] && !out[parent]) put(parent, parts[slug]);
  // orden estable: músculos en el orden de la app y luego las partes inertes
  const sorted = {};
  for (const k of [...MUSCLES, ...INERT]) if (out[k]) sorted[k] = out[k];
  return sorted;
}

const view = (file, box) => ({ vb: parseViewBox(box), p: parseView(file) });
const data = {
  male: { front: view('MaleFrontPaths.swift', 'maleFront'), back: view('MaleBackPaths.swift', 'maleBack') },
  female: { front: view('FemaleFrontPaths.swift', 'femaleFront'), back: view('FemaleBackPaths.swift', 'femaleBack') }
};

const header = `// Geometría del cuerpo: los trazos SVG de los mapas musculares. Generado, no editar a mano.
//
// Convertido de MuscleMap, de Melih Colpan (licencia MIT, ver NOTICE.md):
//   https://github.com/melihcolpan/MuscleMap  (Sources/MuscleMap/Data)
// con scripts/build-body-paths.mjs. Cuatro vistas (hombre/mujer × frente/espalda); cada una tiene un viewBox
// ("vb") y, por parte del cuerpo, la lista de trazos ("p"). Cabeza, pelo, cuello, manos, pies, rodillas y
// tobillos no son músculos: se dibujan como silueta y nunca se colorean. Los subgrupos de MuscleMap
// (pecho superior, cuádriceps interno…) se descartan porque se superponen al músculo completo.
`;
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'body-paths.js');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, header + 'var BODY_PATHS = ' + JSON.stringify(data) + ';\n');
const missing = [];
for (const g of Object.keys(data)) for (const v of ['front', 'back']) for (const m of MUSCLES) if (!data[g][v].p[m]) missing.push(`${g}/${v}/${m}`);
console.log(`src/body-paths.js escrito (${(fs.statSync(out).size / 1024).toFixed(1)} KB). Sin trazo en la vista: ${missing.join(', ') || 'ninguno'}`);
