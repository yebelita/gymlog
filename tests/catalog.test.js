// Spec 003 (Fase B): catálogo de ejercicios (script de generación, correcciones, ejercicios propios) y buscador
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const assert = require('./helpers/assert');
const { loadApp, ROOT } = require('./helpers/app');

const build = async o => (await import('../scripts/build-catalog.mjs')).buildCatalog(o);
const SLUGS = ['trapezius', 'deltoids', 'chest', 'upper-back', 'serratus', 'biceps', 'triceps', 'forearm', 'abs', 'obliques', 'lower-back',
  'gluteal', 'quadriceps', 'hamstring', 'adductors', 'hip-flexors', 'calves', 'tibialis'];
const DS = () => [
  { id: '0002', name: 'zeta squat', target: 'glutes', secondary_muscles: ['quadriceps', 'hamstrings', 'ankles', 'cardiovascular system'] },
  { id: '0001', name: 'alpha curl', target: 'biceps', secondary_muscles: ['forearms', 'biceps', 'wrists'], muscle_group: 'forearms', instructions: { en: 'x' }, gif_url: 'x.gif' },
  { id: '0003', name: 'run', target: 'cardiovascular system', secondary_muscles: ['calves'] },
  { id: '0004', name: 'bench press', target: 'pectorals', secondary_muscles: ['triceps', 'shoulders'] }
];
const realCatalog = () => { const c = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src', 'exercise-catalog.js'), 'utf8') + ';this.C = EX_CATALOG', c); return c.C; };
const search = (app, q) => JSON.parse(app.eval(`JSON.stringify(catSearch(${JSON.stringify(q)}).map(i => CAT[i]))`));

/* ---------- script de generación ---------- */

test('CA-27: el catálogo solo tiene entradas con músculo principal dibujable, slugs válidos y es determinista', async () => {
  const a = await build({ dataset: DS() }), b = await build({ dataset: DS().reverse() });
  assert.deepEqual(a.entries, b.entries, 'el orden de entrada no cambia la salida');
  assert.deepEqual(a.entries.map(e => e[0]), ['0001', '0002', '0004'], 'ordenado por id; el cardio sin músculo principal se descarta');
  assert.deepEqual(a.dropped, ['0003']);
  assert.deepEqual(a.entries[0], ['0001', 'alpha curl', ['biceps'], ['forearm']], 'sin duplicar el principal y descartando lo no dibujable (muñecas)');
  assert.deepEqual(a.entries[1], ['0002', 'zeta squat', ['gluteal'], ['quadriceps', 'hamstring']], 'ankles y cardio se descartan');
  assert.deepEqual(a.entries[2], ['0004', 'bench press', ['chest'], ['triceps', 'deltoids']]);
  for (const e of a.entries) for (const m of [...e[2], ...e[3]]) assert.ok(SLUGS.includes(m), m);
  assert.ok(a.entries.every(e => e.length === 4), 'solo se guardan nombre y músculos del dataset (no instrucciones ni medios)');
});

test('CA-27b: las correcciones (reglas por nombre, por id, alias y exclusión) se aplican y se validan', async () => {
  const overrides = {
    rules: [{ name: 'squat', whenTarget: ['gluteal'], p: ['quadriceps', 'gluteal'], alias: ['sentadilla'] }],
    ids: { '0004': { p: ['chest'], s: ['triceps'], alias: ['banca'] }, '0001': { drop: true } }
  };
  const r = await build({ dataset: DS(), overrides });
  const e = id => r.entries.find(x => x[0] === id);
  assert.deepEqual(e('0002'), ['0002', 'zeta squat', ['quadriceps', 'gluteal'], ['hamstring'], '', ['sentadilla']], 'la regla aplica y el principal sale de los secundarios');
  assert.deepEqual(e('0004'), ['0004', 'bench press', ['chest'], ['triceps'], '', ['banca']]);
  assert.equal(e('0001'), undefined, 'drop excluye la entrada');
  const noMatch = await build({ dataset: DS(), overrides: { rules: [{ name: 'squat', whenTarget: ['quadriceps'], p: ['calves'] }] } });
  assert.deepEqual(noMatch.entries.find(x => x[0] === '0002')[2], ['gluteal'], 'whenTarget limita la regla');
  await assert.rejects(build({ dataset: DS(), overrides: { ids: { 9999: { p: ['chest'] } } } }), /no existe/);
  await assert.rejects(build({ dataset: DS(), overrides: { ids: { '0001': { p: ['bicep'] } } } }), /inválido/);
  await assert.rejects(build({ dataset: DS(), overrides: { rules: [{ name: 'x', p: ['nope'] }] } }), /inválido/);
});

test('CA-27c: los ejercicios propios entran con nombre en español y alias, y sus ids no pueden chocar', async () => {
  const x = { id: 'x01', n: 'cable donkey kickback', es: 'patada de glúteo en polea', alias: ['patada de gluteo'], p: ['gluteal'], s: ['hamstring', 'gluteal'] };
  const r = await build({ dataset: DS(), extras: [x] });
  assert.deepEqual(r.entries.at(-1), ['x01', 'cable donkey kickback', ['gluteal'], ['hamstring'], 'patada de glúteo en polea', ['patada de gluteo']]);
  await assert.rejects(build({ dataset: DS(), extras: [{ ...x, id: '0001' }] }), /x01, x02/);
  await assert.rejects(build({ dataset: DS(), extras: [x, x] }), /repetido/);
  await assert.rejects(build({ dataset: DS(), extras: [{ ...x, p: ['nope'] }] }), /inválido/);
  await assert.rejects(build({ dataset: [{ id: 'x01', name: 'a', target: 'abs' }], extras: [x] }), /repetido|choca/);
});

test('CA-27d: el catálogo generado es válido, pesa menos de 120 KB y lleva las correcciones y los propios', async () => {
  const C = realCatalog();
  assert.ok(fs.statSync(path.join(ROOT, 'src', 'exercise-catalog.js')).size < 120 * 1024);
  assert.ok(C.length > 1000 && C.length < 1400, `entradas: ${C.length}`);
  assert.equal(new Set(C.map(e => e[0])).size, C.length, 'ids únicos');
  for (const e of C) { assert.ok(e[2].length > 0, e[0]); for (const m of [...e[2], ...e[3]]) assert.ok(SLUGS.includes(m), `${e[0]} ${m}`); }
  const by = id => C.find(e => e[0] === id);
  assert.deepEqual(by('0743').slice(2, 4), [['quadriceps'], ['gluteal', 'hamstring', 'calves']], 'hack squat corregido');
  assert.deepEqual(by('0743')[5].sort(), ['hack', 'maquina hack']);
  assert.ok(by('0043')[2].includes('quadriceps'), 'la sentadilla con barra tiene cuádriceps como principal');
  for (const id of ['x01', 'x02', 'x03', 'x04']) assert.ok(by(id)[4], `${id} tiene nombre en español`);
});

/* ---------- buscador ---------- */

test('CA-28: la búsqueda devuelve ≤ 20 resultados, sin importar acentos ni mayúsculas; «sentadilla» encuentra squat', async () => {
  const app = await loadApp();
  const names = r => r.map(e => e[0]).join();
  const sq = search(app, 'sentadilla');
  assert.ok(sq.length > 0 && sq.length <= 20);
  assert.ok(sq.some(e => /squat/.test(e[1])));
  assert.equal(names(search(app, 'SENTADILLA')), names(sq));
  assert.equal(names(search(app, 'jalón')), names(search(app, 'jalon')));
  assert.ok(search(app, 'jalón al pecho').some(e => /pulldown/.test(e[1])));
  assert.deepEqual(search(app, 'zzzzqqq'), []);
  assert.deepEqual(search(app, '   '), []);
  app.close();
});

test('CA-28b: los ejercicios propios se encuentran por su nombre en español', async () => {
  const app = await loadApp();
  assert.equal(search(app, 'patada de glúteo')[0][0], 'x02');
  assert.equal(search(app, 'hip thrust con barra')[0][0], 'x01');
  assert.ok(search(app, 'face pull').some(e => e[0] === 'x03'));
  assert.ok(search(app, 'sentadilla búlgara').some(e => e[0] === 'x04'));
  assert.ok(!search(app, 'patada de glúteo').some(e => /triceps/.test(e[1])), 'no se cuelan los kickback de tríceps');
  app.close();
});

test('CA-28c: cada ejercicio de la rutina por defecto se puede encontrar en el catálogo', async () => {
  const app = await loadApp();
  const names = [...new Set(app.S.routine.flatMap(d => d.exercises.map(e => e.name)))];
  const sinResultado = names.filter(n => search(app, n).length === 0);
  // cardio y movilidad no tienen músculos y el catálogo los excluye a propósito
  assert.deepEqual(sinResultado, ['Caminata inclinada', 'Movilidad'], 'sin resultado en el buscador');
  assert.ok(search(app, 'Peso muerto rumano con barra').some(e => /romanian deadlift/.test(e[1])));
  assert.ok(search(app, 'Hip thrust (pausa de 1 s arriba)').some(e => e[0] === 'x01'), 'ignora lo que va entre paréntesis');
  app.close();
});

test('CA-29: elegir un resultado rellena los chips pero no guarda hasta pulsar Guardar', async () => {
  const app = await loadApp();
  app.eval(`muscleSheet('Ejercicio raro')`); await app.flush();
  const q = v => { const i = app.$('#msearch'); i.value = v; i.dispatchEvent(new app.win.Event('input', { bubbles: true })); };
  q('patada de gluteo');
  const rows = [...app.doc.querySelectorAll('#mres [data-a="muscleCat"]')];
  assert.ok(rows.length >= 1 && rows.length <= 20);
  assert.match(rows[0].textContent, /patada de glúteo en polea/);
  assert.match(rows[0].textContent, /Glúteos/);
  app.click(rows[0]);
  const st = m => app.$(`.sheet [data-m="${m}"]`).dataset.st;
  assert.deepEqual([st('gluteal'), st('hamstring'), st('chest')], ['1', '2', '0']);
  assert.deepEqual(app.S.exMuscles, {}, 'todavía no se ha guardado');
  app.click('#mcsave'); await app.flush();
  assert.deepEqual(app.S.exMuscles['ejercicio raro'], { p: ['gluteal'], s: ['hamstring'] });
  app.close();
});

test('CA-29b: sin resultados se avisa, y el buscador también funciona en el editor de ejercicio', async () => {
  const app = await loadApp();
  app.eval(`muscleSheet('Ejercicio raro')`); await app.flush();
  const q = v => { const i = app.$('#msearch'); i.value = v; i.dispatchEvent(new app.win.Event('input', { bubbles: true })); };
  q('zzzzqqq');
  assert.match(app.text('#mres'), /Sin resultados/);
  q(''); assert.equal(app.text('#mres'), '');
  app.eval('closeSheet()'); await app.flush();

  app.eval('editEx(0, 0)'); await app.flush();
  assert.ok(app.$('#fm #msearch'), 'el editor tiene el buscador');
  q('face pull');
  app.click(app.$('#mres [data-a="muscleCat"]'));
  assert.ok(app.$('#fm').open, 'se despliega la sección para ver lo copiado');
  assert.equal(app.$('#fm [data-m="deltoids"]').dataset.st, '1');
  assert.equal(app.$('#fm [data-m="upper-back"]').dataset.st, '2');
  app.click('#sv'); await app.flush();
  assert.deepEqual(app.S.exMuscles['hip thrust con barra'], { p: ['trapezius', 'deltoids'], s: ['upper-back'] }, 'en el orden de MUSCLES');
  app.close();
});

/* ---------- recursos y créditos ---------- */

test('CA-29c: el catálogo se carga por <script src>, está en ASSETS y la app arranca con él', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /<script src="src\/exercise-catalog\.js"><\/script>/);
  assert.ok(html.indexOf('src/exercise-catalog.js') < html.indexOf('<script>'));
  assert.ok(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').includes("'./src/exercise-catalog.js'"));
  const app = await loadApp();
  assert.ok(app.eval('CAT.length') > 1000);
  app.close();
});

test('CA-30: NOTICE.md y los créditos incluyen también el aviso MIT del dataset', async () => {
  const notice = fs.readFileSync(path.join(ROOT, 'NOTICE.md'), 'utf8');
  assert.match(notice, /Hasan Emir Yıldırım/); assert.match(notice, /MuscleMap/);
  assert.match(notice, /no se incluyen/i, 'avisa de que no se distribuyen sus imágenes ni vídeos');
  const app = await loadApp();
  app.click('#nav [data-v="settings"]'); await app.flush();
  app.click('[data-a="credits"]'); await app.flush();
  const t = app.text('.sheet');
  assert.match(t, /Exercises Dataset/); assert.match(t, /Hasan Emir/); assert.match(t, /Melih Colpan/);
  assert.equal((t.match(/MIT License/g) || []).length, 2, 'las dos licencias completas');
  app.close();
});

/* ---------- Fase C: crear ejercicios desde el catálogo ---------- */

const EQ = () => [
  { id: '0010', name: 'push-up', equipment: 'body weight', target: 'pectorals', secondary_muscles: ['triceps'] },
  { id: '0011', name: 'front plank', equipment: 'body weight', target: 'abs', secondary_muscles: [] },
  { id: '0012', name: 'barbell squat', equipment: 'barbell', target: 'quads', secondary_muscles: [] },
  { id: '0013', name: 'kettlebell hang clean', equipment: 'kettlebell', target: 'glutes', secondary_muscles: [] },
  { id: '0014', name: 'weighted front plank', equipment: 'weighted', target: 'abs', secondary_muscles: [] }
];
const modeOf = (r, id) => r.entries.find(e => e[0] === id)[6];

test('CA-35: el catálogo lleva el tipo sugerido (reps/tiempo) calculado desde el equipo y el nombre', async () => {
  const r = await build({ dataset: EQ() });
  assert.equal(modeOf(r, '0010'), 'reps', 'peso corporal');
  assert.equal(modeOf(r, '0011'), 'tiempo', 'plancha');
  assert.equal(modeOf(r, '0014'), 'tiempo', 'plancha con peso');
  assert.equal(r.entries.find(e => e[0] === '0012').length, 4, 'sin sugerencia no se añade el campo');
  assert.equal(r.entries.find(e => e[0] === '0013').length, 4, 'hang clean no es isométrico');
  assert.deepEqual(r.entries.find(e => e[0] === '0010'), ['0010', 'push-up', ['chest'], ['triceps'], '', [], 'reps'], 'es/alias vacíos como relleno');

  const o = await build({ dataset: EQ(), overrides: { ids: { '0011': { mode: 'reps' }, '0012': { mode: 'tiempo' } } } });
  assert.equal(modeOf(o, '0011'), 'reps'); assert.equal(modeOf(o, '0012'), 'tiempo');
  const x = { id: 'x01', n: 'wall sit', es: 'sentadilla en pared', p: ['quadriceps'], s: [], mode: 'tiempo' };
  const e = await build({ dataset: EQ(), extras: [x] });
  assert.equal(e.entries.at(-1)[6], 'tiempo');
  await assert.rejects(build({ dataset: EQ(), extras: [{ ...x, mode: 'peso' }] }), /modo/);
  await assert.rejects(build({ dataset: EQ(), overrides: { ids: { '0010': { mode: 'raro' } } } }), /modo/);
});

test('CA-35b: en el catálogo real el peso corporal sugiere reps y las planchas tiempo; sigue bajo 120 KB', async () => {
  const C = realCatalog(), by = id => C.find(e => e[0] === id);
  assert.equal(by('0662')[6], 'reps', 'push-up');
  assert.equal(by('0464')[6], 'tiempo', 'front plank with twist');
  assert.equal(by('0664')[6], 'reps', 'push-up to side plank se corrige a reps');
  assert.equal(by('0043').length, 4, 'barbell full squat: sin sugerencia');
  assert.ok(C.filter(e => e[6] === 'reps').length > 150);
  assert.ok(C.every(e => e.length < 7 || ['reps', 'tiempo'].includes(e[6])));
  assert.ok(fs.statSync(path.join(ROOT, 'src', 'exercise-catalog.js')).size < 120 * 1024);
});

const q2 = (app, id, v) => { const i = app.$(id); i.value = v; i.dispatchEvent(new app.win.Event('input', { bubbles: true })); };
const idx = (app, id) => app.eval(`CAT.findIndex(e => e[0] === ${JSON.stringify(id)})`);
const pick = (app, id) => app.click(`#nres [data-a="catPick"][data-i="${idx(app, id)}"]`);

test('CA-31: el buscador de arriba solo está al crear; la sección Músculos del nuevo no lo repite', async () => {
  const app = await loadApp();
  app.eval('editEx(0, -1)'); await app.flush();
  assert.ok(app.$('#nsearch'), 'buscador arriba al crear');
  assert.equal(app.$('#fm #msearch'), null, 'la sección Músculos no repite el buscador');
  assert.ok(app.$('#fm [data-a="muscleChip"]'), 'pero sí tiene los chips');
  app.eval('closeSheet()'); await app.flush();
  app.eval('editEx(0, 0)'); await app.flush();
  assert.equal(app.$('#nsearch'), null, 'al editar no se muestra');
  assert.ok(app.$('#fm #msearch'), 'la sección Músculos sí tiene el suyo');
  app.close();
});

test('CA-32: elegir un resultado rellena nombre y músculos, vacía la lista y no guarda hasta Guardar', async () => {
  const app = await loadApp();
  const antes = app.S.routine[0].exercises.length;
  app.eval('editEx(0, -1)'); await app.flush();
  q2(app, '#nsearch', 'patada de gluteo');
  assert.ok(app.$('#nres [data-a="catPick"]'));
  pick(app, 'x02');
  assert.equal(app.$('#fn').value, 'Patada de glúteo en polea', 'nombre en español con mayúscula inicial');
  assert.deepEqual([app.$('#fm [data-m="gluteal"]').dataset.st, app.$('#fm [data-m="hamstring"]').dataset.st, app.$('#fm [data-m="chest"]').dataset.st], ['1', '2', '0']);
  assert.ok(app.$('#fm').open, 'se despliega Músculos que trabaja');
  assert.equal(app.text('#nres'), '', 'se vacía la lista');
  assert.equal(app.S.routine[0].exercises.length, antes, 'todavía no se ha guardado');
  assert.deepEqual(app.S.exMuscles, {});
  app.eval('closeSheet()'); await app.flush();

  app.eval('editEx(0, -1)'); await app.flush();
  q2(app, '#nsearch', 'barbell full squat');
  pick(app, '0043');
  assert.equal(app.$('#fn').value, 'Barbell full squat', 'nombre en inglés con mayúscula inicial');
  assert.equal(app.$('#fm [data-m="quadriceps"]').dataset.st, '1');
  app.close();
});

test('CA-33: el tipo sugerido se selecciona y, sin sugerencia, se mantiene el que hubiera', async () => {
  const app = await loadApp();
  app.eval('editEx(0, -1)'); await app.flush();
  const on = () => app.$('#md .on').dataset.m;
  assert.equal(on(), 'peso');
  q2(app, '#nsearch', 'push-up'); pick(app, '0662');
  assert.equal(on(), 'reps', 'peso corporal');
  q2(app, '#nsearch', 'front plank'); pick(app, '0464');
  assert.equal(on(), 'tiempo', 'plancha');
  q2(app, '#nsearch', 'barbell full squat'); pick(app, '0043');
  assert.equal(on(), 'tiempo', 'sin sugerencia se mantiene');
  app.click('#md [data-m="peso"]');
  assert.equal(on(), 'peso', 'el usuario puede cambiarlo');
  app.close();
});

test('CA-34: Guardar añade el ejercicio con nombre, tipo y músculos; lo editado a mano se respeta', async () => {
  let app = await loadApp();
  app.eval('editEx(0, -1)'); await app.flush();
  q2(app, '#nsearch', 'push-up'); pick(app, '0662');
  app.click('#sv'); await app.flush();
  const nuevo = app.S.routine[0].exercises.at(-1);
  assert.equal(nuevo.name, 'Push-up'); assert.equal(nuevo.mode, 'reps');
  const musculos = { p: ['chest'], s: ['deltoids', 'triceps', 'abs'] }; // los del catálogo, en el orden del cuerpo
  assert.deepEqual(app.S.exMuscles['push-up'], musculos);
  assert.deepEqual(app.stored().exMuscles['push-up'], musculos);
  assert.equal(app.S.routine[0].exercises.length, 5);
  app.close();

  app = await loadApp();
  app.eval('editEx(0, -1)'); await app.flush();
  q2(app, '#nsearch', 'patada de gluteo'); pick(app, 'x02');
  app.$('#fn').value = 'Mi patada';
  app.click('#sv'); await app.flush();
  assert.equal(app.S.routine[0].exercises.at(-1).name, 'Mi patada');
  assert.deepEqual(app.S.exMuscles['mi patada'], { p: ['gluteal'], s: ['hamstring'] });
  assert.equal('patada de glúteo en polea' in app.S.exMuscles, false);
  app.close();
});
