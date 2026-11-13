// Spec 003 (Fase A): mapa de calor muscular en Progreso → Músculos
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('./helpers/assert');
const { loadApp, ROOT, T0 } = require('./helpers/app');

const DAY = 864e5;
const BASE = { v: 1, routine: [{ id: 'd1', name: 'Día', exercises: [] }], sessions: [], settings: {} };
// Sesión terminada: ex = [[nombre, nº de series hechas], …]; daysAgo 0 = hoy a las 9:00
const sess = (id, daysAgo, ex) => ({ id, dayId: 'd1', dayName: 'Día', start: T0 - 3600e3 - daysAgo * DAY, end: T0 - daysAgo * DAY,
  exercises: ex.map(([name, n]) => ({ name, mode: 'peso', sets: Array.from({ length: n }, () => ({ w: 50, r: 8 })) })) });
const withSessions = sessions => loadApp({ stored: { ...BASE, sessions } });
const calc = (app, days = 7) => JSON.parse(app.eval(`JSON.stringify(muscleLoad(${days}))`));
const res = (app, name) => JSON.parse(app.eval(`JSON.stringify(musclesFor(${JSON.stringify(name)}))`));
const openMus = async app => {
  app.click('#nav [data-v="progress"]'); await app.flush();
  app.click('#progTabs [data-v="musculos"]'); await app.flush();
};
const grp = (app, m) => app.$(`g.bm[data-m="${m}"]`);
const lvl = (app, m) => (grp(app, m).getAttribute('class').match(/\bl(\d)\b/) || [])[1];
const near = (a, b) => Math.abs(a - b) < 1e-9;

/* ---------- datos y migración ---------- */

test('CA-1: bodyGender vale male por defecto, conserva female y corrige valores inválidos', async () => {
  let app = await loadApp();
  assert.equal(app.S.settings.bodyGender, 'male'); app.close();
  app = await loadApp({ stored: { ...BASE, settings: { bodyGender: 'female' } } });
  assert.equal(app.S.settings.bodyGender, 'female'); app.close();
  app = await loadApp({ stored: { ...BASE, settings: { bodyGender: 'otro' } } });
  assert.equal(app.S.settings.bodyGender, 'male'); app.close();
});

test('CA-2: exMuscles vale {} y migrate limpia entradas inválidas conservando "sin músculos"', async () => {
  let app = await loadApp({ stored: BASE });
  assert.deepEqual(app.S.exMuscles, {}); app.close();
  const raw = { a: { p: ['chest', 'nada'], s: ['triceps', 'chest'] }, b: 'x', c: null, d: { p: 'chest', s: 5 }, e: { p: [], s: [] }, f: [1] };
  app = await loadApp({ stored: { ...BASE, exMuscles: raw } });
  assert.deepEqual(app.S.exMuscles, { a: { p: ['chest'], s: ['triceps'] }, d: { p: [], s: [] }, e: { p: [], s: [] } });
  app.close();
});

test('CA-3: el mapeo se guarda y se busca por nombre normalizado', async () => {
  const app = await loadApp({ stored: { ...BASE, exMuscles: { '  HIP Thrust ': { p: ['gluteal'], s: [] } } } });
  assert.deepEqual(Object.keys(app.S.exMuscles), ['hip thrust']);
  assert.equal(res(app, 'hip THRUST').src, 'user');
  app.close();
});

test('CA-4: exMuscles se exporta e importa con el respaldo', async () => {
  const app = await loadApp({ stored: { ...BASE, exMuscles: { plancha: { p: ['abs'], s: [] } } } });
  const text = await new Promise(r => { const fr = new app.win.FileReader(); fr.onload = () => r(fr.result); fr.readAsText(app.eval('backupBlob()')); });
  assert.deepEqual(JSON.parse(text).exMuscles, { plancha: { p: ['abs'], s: [] } });
  assert.deepEqual(JSON.parse(app.eval(`JSON.stringify(migrate(${text}).exMuscles)`)), { plancha: { p: ['abs'], s: [] } });
  app.close();
});

/* ---------- resolución ---------- */

test('CA-5: prioridad usuario > curado > palabras clave > sin clasificar', async () => {
  const app = await loadApp();
  assert.equal(res(app, 'Hip thrust con barra').src, 'builtin');
  assert.equal(res(app, 'Sentadilla goblet').src, 'keyword');
  assert.equal(res(app, 'Ejercicio raro').src, null);
  app.eval(`S.exMuscles['hip thrust con barra'] = { p: ['chest'], s: [] }; S.exMuscles['ejercicio raro'] = { p: [], s: [] }`);
  assert.deepEqual(res(app, 'Hip thrust con barra').p, ['chest']);
  assert.equal(res(app, 'Hip thrust con barra').src, 'user');
  assert.equal(res(app, 'Ejercicio raro').src, 'user', '"sin músculos" a propósito cuenta como resuelto');
  app.close();
});

test('CA-6: los ejercicios de la rutina por defecto resuelven por el mapeo curado', async () => {
  const app = await loadApp();
  const names = [...new Set(app.S.routine.flatMap(d => d.exercises.map(e => e.name)))];
  assert.equal(names.length, 33);
  for (const n of names) assert.equal(res(app, n).src, 'builtin', `${n} debería estar curado`);
  for (const n of ['Caminata inclinada', 'Movilidad']) { const r = res(app, n); assert.deepEqual([r.p, r.s], [[], []]); }
  assert.deepEqual(res(app, 'Patada en polea').p, ['gluteal']);
  assert.deepEqual(res(app, 'Hack').p, ['quadriceps']);
  app.close();
});

test('CA-7: palabras clave sin distinguir acentos ni mayúsculas', async () => {
  const app = await loadApp();
  const p = n => res(app, n).p;
  assert.deepEqual(p('Sentadilla búlgara con mancuernas'), ['quadriceps', 'gluteal']);
  assert.deepEqual(p('PRESS INCLINADO con mancuernas'), ['chest']);
  assert.deepEqual(p('Elevación de talones'), ['calves']);
  assert.deepEqual(p('Extension de triceps en polea'), ['triceps']);
  assert.deepEqual(p('Curl femoral tumbado'), ['hamstring']);
  assert.equal(res(app, 'Zumba divertida').src, null);
  app.close();
});

test('CA-8: pesos 1,0 principal y 0,4 secundario; si está en ambos vale 1,0', async () => {
  const app = await loadApp();
  const r = res(app, 'Hip thrust con barra');
  assert.equal(r.w.gluteal, 1); assert.equal(r.w.hamstring, 0.4); assert.equal(r.w.adductors, 0.4);
  app.eval(`S.exMuscles['x'] = { p: ['biceps'], s: ['biceps', 'forearm'] }`);
  const x = res(app, 'x');
  assert.equal(x.w.biceps, 1); assert.equal(x.w.forearm, 0.4);
  app.close();
});

/* ---------- cálculo ---------- */

test('CA-9: carga = series × peso; ventana móvil de 7 o 30 días', async () => {
  const app = await withSessions([sess('a', 0, [['Hip thrust con barra', 4]]), sess('b', 8, [['Press banca con mancuernas', 3]])]);
  const w7 = calc(app, 7), w30 = calc(app, 30);
  assert.ok(near(w7.load.gluteal, 4)); assert.ok(near(w7.load.hamstring, 1.6));
  assert.equal(w7.load.chest, 0, 'una sesión de hace 8 días no cuenta en 7');
  assert.ok(near(w30.load.chest, 3), 'pero sí en 30');
  assert.ok(near(w30.load.triceps, 1.2));
  app.close();
});

test('CA-10: la sesión activa no cuenta', async () => {
  const app = await loadApp();
  await app.start(0); await app.confirm();
  assert.ok(app.S.active);
  assert.ok(Object.values(calc(app, 7).load).every(v => v === 0));
  app.close();
});

test('CA-11: niveles 0-4 relativos al máximo', async () => {
  const app = await withSessions([sess('a', 0, [['Hip thrust con barra', 4], ['Curl de bíceps', 2]])]);
  const { levels } = calc(app, 7);
  assert.equal(levels.gluteal, 4);
  assert.equal(levels.hamstring, 2);
  assert.equal(levels.biceps, 2);
  assert.equal(levels.forearm, 1);
  assert.equal(levels.chest, 0);
  app.close();
});

test('CA-12: los sin clasificar se listan una vez por nombre; los "sin músculos" no', async () => {
  const app = await withSessions([sess('a', 0, [['Ejercicio raro', 2], ['Movilidad', 1]]), sess('b', 1, [['ejercicio RARO', 3]])]);
  app.eval(`S.exMuscles['zumba'] = { p: [], s: [] }`);
  const r = calc(app, 7);
  assert.deepEqual(r.unclassified.map(u => [u.name.toLowerCase(), u.sets]), [['ejercicio raro', 5]]);
  assert.ok(Object.values(r.load).every(v => v === 0), 'no suman');
  app.close();
});

test('CA-13: sin sesiones en la ventana el cuerpo queda gris con mensaje, sin errores', async () => {
  const app = await loadApp();
  await openMus(app);
  assert.equal(app.doc.querySelectorAll('.bodies svg').length, 2);
  assert.ok([...app.doc.querySelectorAll('g.bm')].every(g => g.classList.contains('l0')));
  assert.match(app.text('#app'), /Sin entrenamientos/);
  app.close();
});

/* ---------- vista ---------- */

test('CA-14: la pestaña Músculos va entre Ejercicios y Medidas y funciona sin sesiones', async () => {
  const app = await loadApp();
  assert.deepEqual(JSON.parse(app.eval('JSON.stringify(PROG_TABS.map(t => t.id))')), ['ejercicios', 'musculos', 'medidas']);
  await openMus(app);
  assert.ok(app.$('.bodies'));
  app.close();
});

test('CA-15: Hombre/Mujer persiste y repinta con la silueta correspondiente', async () => {
  const app = await loadApp();
  await openMus(app);
  const vb = (g, v) => app.eval(`BODY_PATHS.${g}.${v}.vb`);
  assert.deepEqual([...app.doc.querySelectorAll('.bodies svg')].map(s => s.getAttribute('viewBox')), [vb('male', 'front'), vb('male', 'back')]);
  app.click('[data-a="bodyGender"][data-v="female"]');
  assert.equal(app.S.settings.bodyGender, 'female');
  assert.equal(app.stored().settings.bodyGender, 'female');
  assert.deepEqual([...app.doc.querySelectorAll('.bodies svg')].map(s => s.getAttribute('viewBox')), [vb('female', 'front'), vb('female', 'back')]);
  assert.ok(app.$('[data-a="bodyGender"][data-v="female"].on'));
  app.close();
});

test('CA-16: cambiar 7/30 días recalcula sin tocar S', async () => {
  const app = await withSessions([sess('b', 8, [['Press banca con mancuernas', 3]])]);
  await openMus(app);
  assert.equal(lvl(app, 'chest'), '0');
  const before = JSON.stringify(app.S);
  app.click('[data-a="musWin"][data-v="30"]');
  assert.equal(lvl(app, 'chest'), '4');
  assert.equal(JSON.stringify(app.S), before);
  app.close();
});

test('CA-17: cada músculo lleva su clase de nivel y las partes inertes no se colorean', async () => {
  const app = await withSessions([sess('a', 0, [['Hip thrust con barra', 4], ['Curl de bíceps', 2]])]);
  await openMus(app);
  assert.equal(lvl(app, 'gluteal'), '4');
  assert.equal(lvl(app, 'hamstring'), '2');
  assert.equal(lvl(app, 'chest'), '0');
  const inert = [...app.doc.querySelectorAll('.bodies .bm-in')];
  assert.ok(inert.length > 0);
  assert.ok(inert.every(p => !/\bl\d\b/.test(p.getAttribute('class'))));
  app.close();
});

test('CA-18: tocar un músculo muestra nombre, series con coma y ejercicios; tocar el mismo lo cierra', async () => {
  const app = await withSessions([sess('a', 0, [['Hip thrust con barra', 4]])]);
  await openMus(app);
  app.click(grp(app, 'hamstring'));
  assert.match(app.text('#musDet'), /Isquios/);
  assert.match(app.text('#musDet'), /1,6 series/);
  assert.match(app.text('#musDet'), /Hip thrust con barra/);
  app.click(grp(app, 'gluteal'));
  assert.match(app.text('#musDet'), /Glúteos/);
  assert.match(app.text('#musDet'), /4 series/);
  app.click(grp(app, 'gluteal'));
  assert.equal(app.$('#musDet'), null);
  app.close();
});

test('CA-19: Más trabajados ordena por carga y Sin trabajar sigue el orden del cuerpo', async () => {
  const app = await withSessions([sess('a', 0, [['Hip thrust con barra', 4], ['Curl de bíceps', 2]])]);
  await openMus(app);
  const worked = [...app.doc.querySelectorAll('#musRank [data-m]')].map(e => e.dataset.m);
  assert.deepEqual(worked.slice(0, 3), ['gluteal', 'biceps', 'hamstring']);
  const missed = [...app.doc.querySelectorAll('#musMiss [data-m]')].map(e => e.dataset.m);
  assert.equal(missed[0], 'trapezius');
  assert.ok(!missed.includes('gluteal') && missed.includes('chest'));
  app.close();
});

test('CA-20: los músculos son botones accesibles y se activan con Enter y Espacio', async () => {
  const app = await loadApp();
  await openMus(app);
  const groups = [...app.doc.querySelectorAll('g.bm')];
  assert.ok(groups.length >= 18);
  for (const g of groups) {
    assert.equal(g.getAttribute('role'), 'button');
    assert.equal(g.getAttribute('tabindex'), '0');
    assert.ok(g.getAttribute('aria-label').length > 3);
  }
  const key = (el, k) => el.dispatchEvent(new app.win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  key(grp(app, 'chest'), 'Enter');
  assert.match(app.text('#musDet'), /Pecho/);
  key(grp(app, 'chest'), ' ');
  assert.equal(app.$('#musDet'), null);
  app.close();
});

test('CA-21: BODY_PATHS tiene las 4 vistas y dibuja los 18 músculos en cada sexo', async () => {
  const app = await loadApp();
  const r = JSON.parse(app.eval(`JSON.stringify(['male', 'female'].map(g => ({ g,
    views: ['front', 'back'].every(v => BODY_PATHS[g][v] && BODY_PATHS[g][v].vb),
    missing: MUSCLES.filter(m => !BODY_PATHS[g].front.p[m] && !BODY_PATHS[g].back.p[m]) })))`));
  for (const x of r) { assert.ok(x.views, x.g); assert.deepEqual(x.missing, [], x.g); }
  app.close();
});

/* ---------- asignación manual ---------- */

test('CA-22: asignar músculos a un sin clasificar desde la pestaña', async () => {
  const app = await withSessions([sess('a', 0, [['Ejercicio raro', 3]])]);
  await openMus(app);
  app.click('#musUnc [data-a="muscleEdit"]'); await app.flush();
  const chip = m => app.$(`.sheet [data-a="muscleChip"][data-m="${m}"]`);
  assert.equal(chip('chest').dataset.st, '0');
  app.click(chip('chest')); assert.equal(chip('chest').dataset.st, '1');
  app.click(chip('chest')); assert.equal(chip('chest').dataset.st, '2');
  app.click(chip('chest')); assert.equal(chip('chest').dataset.st, '0');
  app.click(chip('chest')); app.click(chip('triceps')); app.click(chip('triceps'));
  app.click('#mcsave'); await app.flush();
  assert.deepEqual(app.S.exMuscles['ejercicio raro'], { p: ['chest'], s: ['triceps'] });
  assert.deepEqual(app.stored().exMuscles['ejercicio raro'], { p: ['chest'], s: ['triceps'] });
  assert.equal(app.$('#musUnc'), null, 'ya no está sin clasificar');
  assert.equal(lvl(app, 'chest'), '4');
  app.close();
});

test('CA-23: Restablecer a sugerido borra el override', async () => {
  const app = await loadApp();
  app.eval(`S.exMuscles['hip thrust con barra'] = { p: ['chest'], s: [] }`);
  app.eval(`muscleSheet('Hip thrust con barra')`); await app.flush();
  assert.equal(app.$('.sheet [data-m="chest"]').dataset.st, '1');
  app.click('#mcreset'); await app.flush();
  assert.equal('hip thrust con barra' in app.S.exMuscles, false);
  assert.deepEqual(res(app, 'Hip thrust con barra').p, ['gluteal']);
  app.close();
});

test('CA-24: el editor de ejercicio muestra los músculos y solo guarda si los cambias', async () => {
  const app = await loadApp();
  app.eval('editEx(0, 0)'); await app.flush();
  const chip = m => app.$(`.sheet #fm [data-m="${m}"]`);
  assert.equal(chip('gluteal').dataset.st, '1', 'principal del curado');
  assert.equal(chip('hamstring').dataset.st, '2', 'secundario del curado');
  app.click('#sv'); await app.flush();
  assert.deepEqual(app.S.exMuscles, {}, 'sin cambios no se crea override');
  app.eval('editEx(0, 0)'); await app.flush();
  app.click(chip('adductors'));  // secundario → apagado
  app.click('#sv'); await app.flush();
  assert.deepEqual(app.S.exMuscles['hip thrust con barra'], { p: ['gluteal'], s: ['hamstring'] });
  app.close();
});

test('CA-25: renombrar mueve el mapeo del usuario al nombre nuevo sin pisar uno existente', async () => {
  const rename = async (app, to) => { app.eval('editEx(0, 0)'); await app.flush(); app.$('#fn').value = to; app.click('#sv'); await app.flush(); };
  // con historial: hay que aceptar renombrar el historial
  let app = await withSessions([sess('a', 1, [['Hip thrust con barra', 2]])]);
  app.eval(`S.routine = defaultRoutine(); S.exMuscles['hip thrust con barra'] = { p: ['chest'], s: [] }`);
  await rename(app, 'Hip thrust pausa');
  app.click('#qOk'); await app.flush();
  assert.deepEqual(app.S.exMuscles['hip thrust pausa'], { p: ['chest'], s: [] });
  assert.equal('hip thrust con barra' in app.S.exMuscles, false);
  app.close();
  // el nombre nuevo ya tenía mapeo propio: no se pisa
  app = await withSessions([sess('a', 1, [['Hip thrust con barra', 2]])]);
  app.eval(`S.routine = defaultRoutine(); S.exMuscles['hip thrust con barra'] = { p: ['chest'], s: [] }; S.exMuscles['hip thrust pausa'] = { p: ['abs'], s: [] }`);
  await rename(app, 'Hip thrust pausa');
  app.click('#qOk'); await app.flush();
  assert.deepEqual(app.S.exMuscles['hip thrust pausa'], { p: ['abs'], s: [] });
  app.close();
  // sin historial del nombre anterior el mapeo también se mueve
  app = await loadApp();
  app.eval(`S.exMuscles['hip thrust con barra'] = { p: ['chest'], s: [] }`);
  await rename(app, 'Hip thrust pausa');
  assert.deepEqual(app.S.exMuscles['hip thrust pausa'], { p: ['chest'], s: [] });
  app.close();
});

/* ---------- carga de recursos y créditos ---------- */

test('CA-26: body-paths.js se carga por <script src>, está en ASSETS y la app arranca con él', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /<script src="src\/body-paths\.js"><\/script>/);
  assert.ok(html.indexOf('src/body-paths.js') < html.indexOf('<script>'), 'se carga antes del script principal');
  assert.ok(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').includes("'./src/body-paths.js'"));
  const app = await loadApp();
  assert.equal(app.eval('typeof BODY_PATHS'), 'object');
  app.close();
});

test('CA-26b: NOTICE.md y la pantalla de créditos incluyen el aviso MIT de MuscleMap', async () => {
  const notice = fs.readFileSync(path.join(ROOT, 'NOTICE.md'), 'utf8');
  assert.match(notice, /MuscleMap/); assert.match(notice, /Melih Colpan/); assert.match(notice, /MIT License/);
  const app = await loadApp();
  app.click('#nav [data-v="settings"]'); await app.flush();
  app.click('[data-a="credits"]'); await app.flush();
  const t = app.text('.sheet');
  assert.match(t, /MuscleMap/); assert.match(t, /Melih Colpan/); assert.match(t, /MIT/);
  app.close();
});
