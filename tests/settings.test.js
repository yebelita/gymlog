// Ajustes, versión visible, navegación, respaldo y editor de rutina
'use strict';
const { test } = require('node:test');
const assert = require('./helpers/assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, ROOT, T0 } = require('./helpers/app');

async function settings(opts) {
  const app = await loadApp(opts);
  app.click('#nav [data-a="go"][data-v="settings"]');
  return app;
}
const toggle = (app, k) => app.$(`[data-a="tog"][data-k="${k}"]`);

/* ---- versión ---- */

test('APP_VERSION de index.html coincide con CACHE de sw.js', async () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const cache = +sw.match(/const CACHE = 'gymlog-v(\d+)'/)[1];
  const app = await loadApp();
  assert.equal(app.eval('APP_VERSION'), cache);
  app.close();
});

test('el pie de Ajustes muestra la versión', async () => {
  const app = await settings();
  const v = app.eval('APP_VERSION');
  assert.match(app.text('#app'), new RegExp(`GymLog v${v} · todo se guarda solo en este dispositivo`));
  app.close();
});

/* ---- navegación ---- */

test('la barra inferior cambia de vista y marca la pestaña activa', async () => {
  const app = await loadApp();
  for (const [v, title] of [['history', 'Historial'], ['progress', 'Progreso'], ['settings', 'Ajustes'], ['train', 'Entrenar']]) {
    app.click(`#nav [data-v="${v}"]`);
    assert.equal(app.text('#app h1'), title);
    assert.ok(app.$(`#nav [data-v="${v}"]`).classList.contains('on'));
  }
  app.close();
});

test('historial y progreso vacíos muestran un mensaje', async () => {
  const app = await loadApp();
  app.click('#nav [data-v="history"]');
  assert.match(app.text('.empty'), /Aún no hay sesiones/);
  app.click('#nav [data-v="progress"]');
  assert.match(app.text('.empty'), /verás aquí tu progreso/);
  app.close();
});

test('historial y progreso muestran una sesión guardada', async () => {
  const app = await loadApp();
  await app.start(0);
  app.eval('curSet().w = 90');
  await app.confirm();
  app.click('[data-a="finishAsk"]');
  app.click('#ok');
  app.click('#nav [data-v="history"]');
  assert.match(app.text('.hist'), /Día 1 · Glúteos \(fuerza\)/);
  assert.match(app.text('.hist'), /1 series/);
  app.click('#nav [data-v="progress"]');
  assert.match(app.text('.tile.pr'), /90 × 5/);
  assert.ok(app.$('.chart svg'));
  app.close();
});

/* ---- avisos ---- */

test('"Probar alarma" hace sonar la alarma una vez', async () => {
  const app = await settings();
  app.click('[data-a="testAlarm"]');
  assert.equal(app.beeps(), 1);
  assert.equal(app.env.vibrations.length, 1);
  await app.advance(10000);
  assert.equal(app.beeps(), 1, 'la prueba no se repite');
  app.close();
});

test('"Probar alarma" respeta el ajuste de sonido', async () => {
  const app = await settings();
  app.click(toggle(app, 'sound'));
  app.click('[data-a="testAlarm"]');
  assert.equal(app.beeps(), 0);
  app.close();
});

test('el estado del permiso de notificaciones se explica en Ajustes', async () => {
  const cases = [
    [{ permission: 'granted' }, /Notificaciones permitidas/],
    [{ permission: 'denied' }, /Notificaciones bloqueadas/],
    [{ permission: 'default' }, /Se pedirá permiso al empezar una sesión/],
    [{ notifications: false }, /no admite notificaciones/]
  ];
  for (const [opts, re] of cases) {
    const app = await settings(opts);
    assert.match(app.text('#app'), re);
    app.close();
  }
});

test('activar "Notificación con la pantalla bloqueada" pide permiso', async () => {
  const app = await settings({ permission: 'default' });
  app.click(toggle(app, 'notify')); // apagar
  assert.equal(app.S.settings.notify, false);
  assert.equal(app.env.permRequests, 0);
  app.click(toggle(app, 'notify')); // encender
  await app.flush();
  assert.equal(app.S.settings.notify, true);
  assert.equal(app.env.permRequests, 1);
  assert.match(app.text('#app'), /Notificaciones permitidas/);
  app.close();
});

test('los interruptores cambian y guardan el ajuste', async () => {
  const app = await settings();
  app.click(toggle(app, 'vibrate'));
  assert.equal(app.S.settings.vibrate, false);
  assert.equal(app.stored().settings.vibrate, false);
  assert.equal(toggle(app, 'vibrate').querySelector('i').textContent, 'No');
  app.close();
});

test('el descanso por defecto va de 15 en 15 s, entre 15 s y 10 min', async () => {
  const app = await settings();
  app.click('[data-a="restAdj"][data-v="15"]');
  assert.equal(app.S.settings.restDefault, 105);
  for (let i = 0; i < 50; i++) app.click('[data-a="restAdj"][data-v="15"]');
  assert.equal(app.S.settings.restDefault, 600);
  for (let i = 0; i < 50; i++) app.click('[data-a="restAdj"][data-v="-15"]');
  assert.equal(app.S.settings.restDefault, 15);
  app.close();
});

test('borrar todos los datos pide doble confirmación', async () => {
  const app = await settings();
  app.eval('S.routine.pop(); S.sessions.push({ id: "x", start: 1, exercises: [] }); save()');
  app.click('[data-a="wipe"]');
  app.click('#qOk');
  assert.equal(app.S.sessions.length, 1, 'aún no ha borrado');
  app.click('#qOk');
  assert.equal(app.S.sessions.length, 0);
  assert.equal(app.S.routine.length, 6);
  app.close();
});

/* ---- respaldo ---- */

test('exportar registra la fecha del último respaldo', async () => {
  const app = await settings();
  app.click('[data-a="export"]');
  assert.equal(app.S.lastExport, app.clock.now);
  assert.match(app.text('#toast'), /Respaldo descargado/);
  app.close();
});

async function importFile(app, text) {
  const input = app.$('#importFile');
  const file = new app.win.File([text], 'respaldo.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new app.win.Event('change', { bubbles: true }));
  for (let i = 0; i < 20 && !app.$('#qOk') && !app.text('#toast'); i++) await new Promise(r => setTimeout(r, 10));
}

test('importar un respaldo válido reemplaza los datos tras confirmar', async () => {
  const app = await settings();
  const backup = { app: 'gymlog', exportedAt: 'x', v: 1, routine: [{ id: 'd', name: 'Importado', exercises: [] }],
    sessions: [{ id: 's1', dayId: 'd', dayName: 'Día 1 · Importado', start: T0 - 864e5, end: T0 - 864e5 + 1, exercises: [] }], settings: { sound: false } };
  await importFile(app, JSON.stringify(backup));
  assert.match(app.text('.sheet'), /1 sesiones, 1 días/);
  app.click('#qOk');
  assert.equal(app.S.routine[0].name, 'Importado');
  assert.equal(app.S.sessions.length, 1);
  assert.equal(app.S.settings.sound, false);
  assert.equal(app.S.settings.notify, true, 'pasa por migrate');
  assert.equal(app.S.app, undefined);
  app.close();
});

test('importar un archivo no válido avisa y no toca los datos', async () => {
  const app = await settings();
  await importFile(app, '{roto');
  assert.match(app.text('#toast'), /no es un JSON válido/);
  app.close();
  const app2 = await settings();
  await importFile(app2, JSON.stringify({ hola: 1 }));
  assert.match(app2.text('#toast'), /No parece un respaldo/);
  assert.equal(app2.S.routine.length, 6);
  app2.close();
});

/* ---- editor de rutina ---- */

test('editor: mover días y añadir uno nuevo', async () => {
  const app = await settings();
  app.click('[data-a="go"][data-v="editor"]');
  app.click('[data-a="mvDay"][data-d="0"][data-v="1"]');
  assert.equal(app.S.routine[0].name, 'Espalda (densidad)');
  assert.equal(app.S.routine[1].name, 'Glúteos (fuerza)');
  app.click('[data-a="mvDay"][data-d="0"][data-v="-1"]'); // fuera de rango: no hace nada
  assert.equal(app.S.routine[0].name, 'Espalda (densidad)');
  app.click('[data-a="addDay"]');
  assert.equal(app.S.routine.length, 7);
  app.$('#n').value = 'Brazos';
  app.$('#f').dispatchEvent(new app.win.Event('submit', { cancelable: true }));
  assert.equal(app.S.routine[6].name, 'Brazos');
  app.close();
});

test('editor: crear un ejercicio con sus valores', async () => {
  const app = await settings();
  app.click('[data-a="go"][data-v="editor"]');
  app.click('[data-a="editEx"][data-d="0"][data-x="-1"]');
  app.$('#fn').value = 'Sentadilla';
  app.$('#fs').value = '4';
  app.$('#fr').value = '6-8';
  app.$('#ft').value = '150';
  app.click('#sv');
  const x = app.S.routine[0].exercises.at(-1);
  assert.deepEqual({ name: x.name, sets: x.sets, reps: x.reps, rest: x.rest, mode: x.mode }, { name: 'Sentadilla', sets: 4, reps: '6-8', rest: 150, mode: 'peso' });
  app.close();
});

test('editor: renombrar un ejercicio con historial ofrece renombrarlo también en el historial', async () => {
  const app = await loadApp();
  app.eval(`S.sessions.push({ id: 'h', dayId: S.routine[0].id, dayName: 'x', start: ${T0 - 864e5}, end: ${T0 - 864e5}, exercises: [{ name: 'Hip thrust con barra', mode: 'peso', sets: [{ w: 100, r: 5 }] }] }); save()`);
  app.click('#nav [data-v="settings"]');
  app.click('[data-a="go"][data-v="editor"]');
  app.click('[data-a="editEx"][data-d="0"][data-x="0"]');
  app.$('#fn').value = 'Hip thrust';
  app.click('#sv');
  assert.match(app.text('.sheet'), /Renombrar también en el historial/);
  app.click('#qOk');
  assert.equal(app.S.sessions[0].exercises[0].name, 'Hip thrust');
  assert.equal(app.S.routine[0].exercises[0].name, 'Hip thrust');
  app.close();
});

test('restaurar la rutina original conserva el historial', async () => {
  const app = await settings();
  app.eval(`S.routine = []; S.sessions.push({ id: 'h', start: 1, exercises: [] }); save(); render()`);
  app.click('[data-a="go"][data-v="editor"]');
  app.click('[data-a="resetRoutine"]');
  app.click('#qOk');
  assert.equal(app.S.routine.length, 6);
  assert.equal(app.S.sessions.length, 1);
  app.close();
});
