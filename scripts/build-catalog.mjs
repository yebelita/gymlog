// Genera src/exercise-catalog.js a partir del dataset de ejercicios (MIT, Hasan Emir Yıldırım),
// aplicando scripts/catalog-overrides.json (correcciones) y scripts/catalog-extras.json (ejercicios propios).
// Uso: node scripts/build-catalog.mjs <ruta a exercises.json> [--out <archivo>]
// Solo dev: la app no ejecuta esto, solo carga el resultado. La salida es determinista.
//
// Del dataset solo se usa el nombre, `target` (músculo principal) y `secondary_muscles`. Se ignoran `muscle_group`
// (ruidoso), instrucciones, imágenes y vídeos (los medios tienen términos de uso distintos y no se distribuyen).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MUSCLES = ['trapezius', 'deltoids', 'chest', 'upper-back', 'serratus', 'biceps', 'triceps', 'forearm', 'abs', 'obliques', 'lower-back',
  'gluteal', 'quadriceps', 'hamstring', 'adductors', 'hip-flexors', 'calves', 'tibialis'];

// Nombres de músculo del dataset → los 18 músculos del mapa. Lo que no está aquí no se puede dibujar y se descarta.
const ALIAS = {
  // principales (target)
  abs: 'abs', pectorals: 'chest', biceps: 'biceps', glutes: 'gluteal', delts: 'deltoids', triceps: 'triceps', 'upper back': 'upper-back', lats: 'upper-back',
  calves: 'calves', quads: 'quadriceps', forearms: 'forearm', hamstrings: 'hamstring', spine: 'lower-back', traps: 'trapezius', adductors: 'adductors',
  'serratus anterior': 'serratus', abductors: 'gluteal', 'levator scapulae': 'trapezius',
  // secundarios (secondary_muscles)
  'hip flexors': 'hip-flexors', 'lower back': 'lower-back', obliques: 'obliques', rhomboids: 'upper-back', back: 'upper-back', 'latissimus dorsi': 'upper-back',
  shoulders: 'deltoids', deltoids: 'deltoids', 'rear deltoids': 'deltoids', 'rotator cuff': 'deltoids', core: 'abs', abdominals: 'abs', 'lower abs': 'abs',
  chest: 'chest', 'upper chest': 'chest', trapezius: 'trapezius', brachialis: 'biceps', 'inner thighs': 'adductors', groin: 'adductors', soleus: 'calves',
  shins: 'tibialis', 'wrist flexors': 'forearm', 'wrist extensors': 'forearm', 'grip muscles': 'forearm', quadriceps: 'quadriceps'
};
// Tipo de ejercicio sugerido al crearlo desde el catálogo: 'reps' (peso corporal) o 'tiempo' (isométricos). Sin sugerencia: ''.
const MODES = ['reps', 'tiempo'];
const TIME_RE = /plank|isometric|wall sit|\bhold\b/; // no «hang»: coge «hang clean», que es de repeticiones
const checkMode = (m, where) => { if (m && !MODES.includes(m)) throw new Error(`${where}: modo inválido «${m}» (reps o tiempo)`); };
const slugOf = n => ALIAS[String(n || '').trim().toLowerCase()] || null;
const uniq = a => [...new Set(a)];
const checkSlugs = (list, where) => { for (const m of list || []) if (!MUSCLES.includes(m)) throw new Error(`${where}: músculo inválido «${m}»`); };

/**
 * @param {{ dataset: object[], overrides?: object, extras?: object[] }} o
 * @returns {{ entries: any[][], dropped: string[], stats: object }}
 *   entries: [id, nombre, principales, secundarios, (nombre en español), (alias), (tipo sugerido)]
 */
export function buildCatalog({ dataset, overrides = {}, extras = [] }) {
  const rules = overrides.rules || [], byId = overrides.ids || {};
  const ids = new Set(dataset.map(x => String(x.id)));
  for (const [id, o] of Object.entries(byId)) {
    if (!ids.has(id)) throw new Error(`overrides: el id ${id} no existe en el dataset`);
    checkSlugs(o.p, `overrides ${id}.p`); checkSlugs(o.s, `overrides ${id}.s`); checkMode(o.mode, `overrides ${id}`);
  }
  rules.forEach((r, i) => { checkSlugs(r.p, `regla ${i}.p`); checkSlugs(r.s, `regla ${i}.s`); checkSlugs(r.whenTarget, `regla ${i}.whenTarget`); checkMode(r.mode, `regla ${i}`); });

  const entries = [], dropped = [];
  for (const x of [...dataset].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const id = String(x.id), name = String(x.name || '').trim();
    let p = uniq([slugOf(x.target)].filter(Boolean));
    let s = uniq((x.secondary_muscles || []).map(slugOf).filter(Boolean)).filter(m => !p.includes(m));
    let alias = [], drop = false;
    let mode = TIME_RE.test(name.toLowerCase()) ? 'tiempo' : String(x.equipment || '').toLowerCase() === 'body weight' ? 'reps' : '';
    // reglas por nombre: la primera que coincide gana
    const lname = name.toLowerCase();
    const rule = rules.find(r => lname.includes(String(r.name).toLowerCase()) && (!r.whenTarget || r.whenTarget.some(m => p.includes(m))));
    if (rule) {
      if (rule.drop) drop = true;
      if (rule.p) p = uniq(rule.p);
      s = rule.s ? uniq(rule.s) : s;
      s = s.filter(m => !p.includes(m));
      if (rule.alias) alias = [...alias, ...rule.alias];
      if (rule.mode) mode = rule.mode;
    }
    const o = byId[id];
    if (o) {
      if (o.drop) drop = true;
      if (o.p) p = uniq(o.p);
      if (o.s) s = uniq(o.s);
      s = s.filter(m => !p.includes(m));
      if (o.alias) alias = [...alias, ...o.alias];
      if (o.mode) mode = o.mode;
    }
    // sin músculo principal dibujable (p. ej. cardio) no sirve para el mapa
    if (drop || !p.length || !name) { dropped.push(id); continue; }
    entries.push([id, name, p, s, '', uniq(alias), mode]);
  }

  const seen = new Set(ids);
  for (const e of extras) {
    if (!/^x\d+$/.test(String(e.id))) throw new Error(`extras: el id «${e.id}» debe ser x01, x02…`);
    if (seen.has(String(e.id))) throw new Error(`extras: el id ${e.id} está repetido o choca con el dataset`);
    seen.add(String(e.id));
    checkSlugs(e.p, `extra ${e.id}.p`); checkSlugs(e.s, `extra ${e.id}.s`);
    if (!e.n || !(e.p || []).length) throw new Error(`extras: ${e.id} necesita nombre y músculo principal`);
    checkMode(e.mode, `extra ${e.id}`);
    entries.push([String(e.id), e.n, e.p, (e.s || []).filter(m => !e.p.includes(m)), e.es || '', uniq(e.alias || []), e.mode || '']);
  }
  // los de 4 elementos no llevan es/alias: se recortan los vacíos del final para ahorrar bytes
  const out = entries.map(e => { const a = [...e]; while (a.length > 4 && (a[a.length - 1] === '' || (Array.isArray(a[a.length - 1]) && !a[a.length - 1].length))) a.pop(); return a; });
  return { entries: out, dropped, stats: { dataset: dataset.length, kept: out.length - extras.length, dropped: dropped.length, extras: extras.length } };
}

const HEADER = `// Catálogo de ejercicios con sus músculos, para buscar y copiar a un ejercicio. Generado, no editar a mano.
//
// Datos del dataset «exercises-dataset» de Hasan Emir Yıldırım (licencia MIT, ver NOTICE.md): solo nombre, músculo
// principal y secundarios (no se usan imágenes ni vídeos). Con las correcciones de scripts/catalog-overrides.json y los
// ejercicios propios de scripts/catalog-extras.json (ids x01, x02…), todo mezclado por scripts/build-catalog.mjs.
// Cada entrada: [id, nombre, principales, secundarios, nombre en español (opcional), alias de búsqueda (opcional),
// tipo sugerido 'reps' | 'tiempo' (opcional)]; los vacíos del final se recortan.
`;

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const out = outIdx >= 0 ? args.splice(outIdx, 2)[1] : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'exercise-catalog.js');
  if (!args[0]) { console.error('Uso: node scripts/build-catalog.mjs <ruta a exercises.json> [--out <archivo>]'); process.exit(1); }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
  const { entries, stats } = buildCatalog({ dataset: read(args[0]), overrides: read(path.join(here, 'catalog-overrides.json')), extras: read(path.join(here, 'catalog-extras.json')) });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, HEADER + 'var EX_CATALOG = [\n' + entries.map(e => JSON.stringify(e)).join(',\n') + '\n];\n');
  console.log(`${path.relative(process.cwd(), out)} escrito (${(fs.statSync(out).size / 1024).toFixed(1)} KB): ${stats.kept} del dataset de ${stats.dataset} (${stats.dropped} descartados) + ${stats.extras} propios`);
}
