// Flujo de entrenamiento: empezar, rellenar series, confirmar, récords, terminar
'use strict';
const { test } = require('node:test');
const assert = require('./helpers/assert');
const { loadApp, T0 } = require('./helpers/app');

// Historial con una sesión previa del Día 1 (hip thrust 100 kg × 5)
function withHistory(app) {
  app.eval('save()'); // guarda la rutina para que coincidan los ids de los días
  const d1 = app.S.routine[0];
  return { ...app.stored(), sessions: [{ id: 'h1', dayId: d1.id, dayName: 'Día 1 · Glúteos (fuerza)', start: T0 - 3 * 864e5, end: T0 - 3 * 864e5 + 3600e3,
    exercises: [{ name: 'Hip thrust con barra', mode: 'peso', sets: [{ w: 100, r: 5 }, { w: 100, r: 4 }] }] }] };
}

test('la pantalla de inicio sugiere el Día 1 sin historial', async () => {
  const app = await loadApp();
  assert.equal(app.text('.hero .d'), 'Día 1 · Glúteos (fuerza)');
  assert.equal(app.doc.querySelectorAll('button.day').length, 7, '6 días + sesión libre');
  app.close();
});

test('tras entrenar el Día 1, sugiere el Día 2', async () => {
  const base = await loadApp();
  const stored = withHistory(base); base.close();
  const app = await loadApp({ stored });
  assert.equal(app.text('.hero .d'), 'Día 2 · Espalda (densidad)');
  app.close();
});

test('empezar sin historial rellena las series con el objetivo de la rutina', async () => {
  const app = await loadApp();
  await app.start(0);
  const ex = app.S.active.exercises;
  assert.equal(ex[0].name, 'Hip thrust con barra');
  assert.equal(ex[0].sets.length, 5);
  assert.deepEqual({ w: ex[0].sets[0].w, r: ex[0].sets[0].r }, { w: 0, r: 5 }); // '5-6' → 5
  assert.equal(ex[2].sets[0].r, 8); // Búlgaras '8-10 por pierna'
  assert.deepEqual(app.S.active.cur, { e: 0, s: 0, manual: false });
  assert.match(app.text('.s-head'), /Día 1 · Glúteos \(fuerza\)/);
  app.close();
});

test('los ejercicios de tiempo convierten minutos a segundos', async () => {
  const app = await loadApp();
  await app.start(3); // Recuperación activa
  const ex = app.S.active.exercises;
  assert.equal(ex[0].sets[0].t, 20 * 60); // '20-30 min'
  assert.equal(ex[1].sets[0].t, 45);      // Plancha '45-60 s'
  app.close();
});

test('con historial, rellena con lo que hiciste la última vez', async () => {
  const base = await loadApp();
  const stored = withHistory(base); base.close();
  const app = await loadApp({ stored });
  await app.start(0);
  const sets = app.S.active.exercises[0].sets;
  assert.deepEqual(sets.slice(0, 3).map(s => [s.w, s.r]), [[100, 5], [100, 4], [100, 4]]);
  assert.match(app.text('.last'), /Última vez/);
  app.close();
});

test('confirmar una serie la marca, avanza el cursor e inicia el descanso del ejercicio', async () => {
  const app = await loadApp();
  await app.start(0);
  await app.confirm();
  const A = app.S.active;
  assert.equal(A.exercises[0].sets[0].done, true);
  assert.deepEqual(A.cur, { e: 0, s: 1, manual: false });
  assert.equal(A.timer.total, 180);
  assert.equal(A.timer.end, app.clock.now + 180000);
  assert.equal(app.$('#timerBox').hidden, false);
  app.close();
});

test('con "usar el descanso de cada ejercicio" apagado usa el descanso por defecto', async () => {
  const app = await loadApp();
  app.eval('S.settings.useExRest = false; S.settings.restDefault = 75');
  await app.start(0);
  await app.confirm();
  assert.equal(app.S.active.timer.total, 75);
  app.close();
});

test('con el temporizador desactivado no hay descanso', async () => {
  const app = await loadApp();
  app.eval('S.settings.timerOn = false');
  await app.start(0);
  await app.confirm();
  assert.equal(app.S.active.timer, null);
  app.close();
});

test('el cambio de peso se propaga a las series siguientes no tocadas', async () => {
  const app = await loadApp();
  await app.start(0);
  app.eval('curSet().w = 60');
  await app.confirm();
  assert.deepEqual(app.S.active.exercises[0].sets.map(s => s.w), [60, 60, 60, 60, 60]);
  app.close();
});

test('los botones +/− cambian peso y reps según el incremento del ejercicio', async () => {
  const app = await loadApp();
  await app.start(0);
  const step = sel => { const b = app.$(`[data-step="${sel}"]`); app.pointerdown(b); b.dispatchEvent(new app.win.Event('pointerup', { bubbles: true })); app.win.dispatchEvent(new app.win.Event('pointerup')); };
  step('w+'); step('w+'); step('r-');
  const st = app.eval('curSet()');
  assert.equal(st.w, 5); // 2 × 2,5 kg
  assert.equal(st.r, 4);
  assert.equal(app.text('#vw'), '5');
  app.close();
});

test('superar el peso máximo del historial es un récord (PR)', async () => {
  const base = await loadApp();
  const stored = withHistory(base); base.close();
  const app = await loadApp({ stored });
  await app.start(0);
  app.eval('curSet().w = 102.5');
  await app.confirm();
  assert.equal(app.S.active.exercises[0].sets[0].pr, 'peso');
  assert.match(app.text('#toast'), /Récord! 102,5 kg/);
  app.close();
});

test('igualar el peso con más reps es récord de reps; igualarlo sin más no', async () => {
  const base = await loadApp();
  const stored = withHistory(base); base.close();
  const app = await loadApp({ stored });
  await app.start(0);
  app.eval('curSet().r = 6');
  await app.confirm();
  assert.equal(app.S.active.exercises[0].sets[0].pr, 'reps');
  app.eval('curSet().r = 4');
  await app.confirm();
  assert.equal(app.S.active.exercises[0].sets[1].pr, null);
  app.close();
});

test('sin historial no se marca récord', async () => {
  const app = await loadApp();
  await app.start(0);
  await app.confirm();
  assert.equal(app.S.active.exercises[0].sets[0].pr, null);
  app.close();
});

test('terminar y guardar almacena solo las series hechas', async () => {
  const app = await loadApp();
  await app.start(0);
  app.eval('curSet().w = 80');
  await app.confirm();
  app.click('[data-a="finishAsk"]');
  app.click('#ok');
  await app.flush();
  const S = app.S;
  assert.equal(S.active, null);
  assert.equal(S.sessions.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(S.sessions[0].exercises)), [{ name: 'Hip thrust con barra', mode: 'peso', sets: [{ w: 80, r: 5 }] }]);
  assert.match(app.text('#toast'), /Sesión guardada/);
  app.close();
});

test('terminar sin series hechas no guarda nada', async () => {
  const app = await loadApp();
  await app.start(0);
  app.click('[data-a="finishAsk"]');
  app.click('#ok');
  assert.equal(app.S.sessions.length, 0);
  assert.match(app.text('#toast'), /Sesión vacía/);
  app.close();
});

test('descartar la sesión pide confirmación y no guarda', async () => {
  const app = await loadApp();
  await app.start(0);
  await app.confirm();
  app.click('[data-a="finishAsk"]');
  app.click('#disc');
  app.click('#qOk');
  assert.equal(app.S.active, null);
  assert.equal(app.S.sessions.length, 0);
  app.close();
});

test('al acabar un ejercicio el cursor pasa al siguiente con series pendientes', async () => {
  const app = await loadApp();
  await app.start(0);
  for (let i = 0; i < 5; i++) await app.confirm();
  assert.deepEqual(app.S.active.cur, { e: 1, s: 0, manual: false });
  app.close();
});

test('añadir un ejercicio extra en sesión libre', async () => {
  const app = await loadApp();
  app.click('[data-a="start"][data-id=""]');
  assert.ok(app.$('#q'), 'abre el buscador de ejercicios');
  app.$('#q').value = 'Sentadilla goblet';
  app.click('#addNew');
  const ex = app.S.active.exercises;
  assert.equal(ex.length, 1);
  assert.equal(ex[0].name, 'Sentadilla goblet');
  assert.equal(ex[0].extra, true);
  assert.equal(ex[0].sets.length, 3);
  app.close();
});

test('los nombres escritos por el usuario se escapan al pintarlos (sin XSS)', async () => {
  const app = await loadApp();
  app.eval(`S.routine[0].name = '<img src=x onerror="window.hacked=1">'; render()`);
  assert.equal(app.doc.querySelector('#app img'), null);
  assert.match(app.text('.hero .d'), /<img src=x/);
  assert.equal(app.win.hacked, undefined);
  app.close();
});
