// Estado global S: valores por defecto, migración, carga y guardado en localStorage
'use strict';
const { test } = require('node:test');
const assert = require('./helpers/assert');
const { loadApp } = require('./helpers/app');

test('sin datos previos arranca con la rutina por defecto de 6 días', async () => {
  const app = await loadApp();
  const S = app.S;
  assert.equal(S.routine.length, 6);
  assert.deepEqual(S.routine.map(d => d.name), ['Glúteos (fuerza)', 'Espalda (densidad)', 'Pierna (cuádriceps)',
    'Recuperación activa', 'Glúteos (hipertrofia)', 'Tren superior (espalda y hombros)']);
  assert.deepEqual({ ...S.settings }, { timerOn: true, useExRest: true, restDefault: 90, vibrate: true, sound: true, notify: true });
  assert.equal(S.sessions.length, 0);
  assert.equal(S.active, null);
  app.close();
});

test('la rutina por defecto define tipo, descanso y opcionales', async () => {
  const app = await loadApp();
  const ex = name => app.S.routine.flatMap(d => d.exercises).find(x => x.name === name);
  assert.equal(ex('Hip thrust con barra').rest, 180);
  assert.equal(ex('Plancha').mode, 'tiempo');
  assert.equal(ex('Dead Bug').mode, 'reps');
  assert.equal(ex('Curl martillo').optional, true);
  app.close();
});

test('si localStorage tiene JSON corrupto, arranca en blanco sin romperse', async () => {
  const app = await loadApp({ stored: '{no es json' });
  assert.equal(app.S.routine.length, 6);
  assert.equal(app.S.sessions.length, 0);
  app.close();
});

test('migrate completa ajustes nuevos (notify) y ordena sesiones', async () => {
  const app = await loadApp({ stored: {
    v: 1, routine: [{ id: 'd1', name: 'Mi día', exercises: [] }],
    settings: { sound: false },
    sessions: [{ id: 'b', start: 2000, exercises: [] }, { id: 'a', start: 1000, exercises: [] }]
  } });
  const S = app.S;
  assert.equal(S.routine[0].name, 'Mi día');
  assert.equal(S.settings.sound, false);
  assert.equal(S.settings.notify, true);
  assert.equal(S.settings.restDefault, 90);
  assert.deepEqual(S.sessions.map(s => s.id), ['a', 'b']);
  assert.equal(S.lastExport, 0);
  app.close();
});

test('migrate repone rutina y sesiones si faltan', async () => {
  const app = await loadApp({ stored: { settings: {} } });
  assert.equal(app.S.routine.length, 6);
  assert.deepEqual(app.S.sessions, []);
  app.close();
});

test('la sesión activa se guarda y se recupera al reabrir la app', async () => {
  const app = await loadApp();
  await app.start(0);
  await app.confirm();
  const saved = app.stored();
  app.close();
  assert.equal(saved.active.exercises[0].sets[0].done, true);

  const again = await loadApp({ stored: saved });
  assert.equal(again.S.active.dayName, 'Día 1 · Glúteos (fuerza)');
  assert.equal(again.S.active.exercises[0].sets[0].done, true);
  assert.ok(again.$('#panel'), 'debe abrir directamente la sesión en curso');
  again.close();
});

test('se guarda al ocultar la página (pantalla bloqueada)', async () => {
  const app = await loadApp();
  await app.start(0);
  app.eval('S.active.exercises[0].sets[0].w = 77; saveSoon()');
  await app.setVisibility('hidden');
  assert.equal(app.stored().active.exercises[0].sets[0].w, 77);
  app.close();
});
