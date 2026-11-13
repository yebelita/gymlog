// Spec 001: Progreso con pestañas internas (la barra solo aparece con 2+ pestañas).
// Desde la spec 002 existe también la pestaña Medidas, así que estos tests parten de PROG_TABS con solo Ejercicios.
'use strict';
const { test } = require('node:test');
const assert = require('./helpers/assert');
const { loadApp, T0 } = require('./helpers/app');

// Historial con dos ejercicios para poder cambiar de ejercicio y de métrica
async function withSessions() {
  const base = await loadApp();
  base.eval('save()');
  const d1 = base.S.routine[0];
  const mk = (id, days, name, sets) => ({ id, dayId: d1.id, dayName: 'Día 1', start: T0 - days * 864e5, end: T0 - days * 864e5 + 3600e3,
    exercises: [{ name, mode: 'peso', sets }] });
  const stored = { ...base.stored(), sessions: [
    mk('a', 9, 'Hip thrust con barra', [{ w: 80, r: 6 }, { w: 80, r: 5 }]),
    mk('b', 3, 'Hip thrust con barra', [{ w: 90, r: 5 }]),
    mk('c', 2, 'Prensa', [{ w: 150, r: 8 }])] };
  base.close();
  return loadApp({ stored });
}
const openProgress = async app => { app.click('#nav [data-v="progress"]'); await app.flush(); };
const onlyEjercicios = app => app.eval('PROG_TABS.length = 1');
const addTab = app => {
  onlyEjercicios(app);
  app.eval(`PROG_TABS.push({ id: 'prueba', label: 'Prueba', render: () => '<div id="tabPrueba">PRUEBA</div>' })`);
};
const tabBtns = app => [...app.doc.querySelectorAll('#progTabs button')];

test('CA-1: con una sola sección Progreso se ve como antes y sin barra de pestañas', async () => {
  const app = await withSessions();
  onlyEjercicios(app);
  await openProgress(app);
  assert.equal(app.text('h1'), 'Progreso');
  assert.ok(app.$('select[data-ch="progEx"]'));
  assert.equal(app.doc.querySelectorAll('.seg button').length, 2, 'solo las métricas (Peso máx / Volumen)');
  assert.ok(app.$('.tiles'));
  assert.ok(app.$('.chart svg'));
  assert.ok(app.$('.plist'));
  assert.equal(app.$('#progTabs'), null);
  app.close();
});

test('CA-2: sin sesiones muestra el mensaje vacío de Ejercicios; con otra pestaña no depende de las sesiones', async () => {
  const app = await loadApp();
  onlyEjercicios(app);
  await openProgress(app);
  assert.match(app.text('.empty'), /Cuando guardes sesiones/);
  assert.equal(app.$('#progTabs'), null);

  addTab(app); app.eval('render()');
  assert.equal(tabBtns(app).length, 2);
  app.click(tabBtns(app)[1]);
  assert.equal(app.text('#tabPrueba'), 'PRUEBA');
  assert.equal(app.$('.empty'), null, 'la pestaña Prueba no hereda el estado vacío de Ejercicios');
  app.click(tabBtns(app)[0]);
  assert.match(app.text('.empty'), /Cuando guardes sesiones/);
  app.close();
});

test('CA-3: con dos pestañas aparece la barra y la activa está marcada', async () => {
  const app = await withSessions();
  addTab(app);
  await openProgress(app);
  const btns = tabBtns(app);
  assert.deepEqual(btns.map(b => b.textContent), ['Ejercicios', 'Prueba']);
  assert.deepEqual(btns.map(b => b.classList.contains('on')), [true, false]);
  assert.ok(app.$('select[data-ch="progEx"]'), 'la pestaña activa es Ejercicios');
  app.close();
});

test('CA-4: pulsar otra pestaña cambia el contenido y se recuerda al volver a Progreso', async () => {
  const app = await withSessions();
  addTab(app);
  await openProgress(app);
  app.click(tabBtns(app)[1]);
  assert.equal(app.text('#tabPrueba'), 'PRUEBA');
  assert.equal(app.$('select[data-ch="progEx"]'), null);
  assert.deepEqual(tabBtns(app).map(b => b.classList.contains('on')), [false, true]);

  app.click('#nav [data-v="history"]'); await app.flush();
  await openProgress(app);
  assert.equal(app.text('#tabPrueba'), 'PRUEBA', 'conserva la pestaña elegida');
  app.close();
});

test('CA-5: cambiar de pestaña no altera el ejercicio ni la métrica elegidos', async () => {
  const app = await withSessions();
  addTab(app);
  await openProgress(app);
  const sel = app.$('select[data-ch="progEx"]');
  sel.value = 'Hip thrust con barra';
  sel.dispatchEvent(new app.win.Event('change', { bubbles: true }));
  app.click('[data-a="metric"][data-v="1"]');
  assert.equal(app.eval('progEx'), 'Hip thrust con barra');
  assert.equal(app.eval('progMetric'), 1);

  app.click(tabBtns(app)[1]);
  app.click(tabBtns(app)[0]);
  assert.equal(app.eval('progEx'), 'Hip thrust con barra');
  assert.equal(app.eval('progMetric'), 1);
  assert.equal(app.$('select[data-ch="progEx"]').value, 'Hip thrust con barra');
  assert.ok(app.$('.seg.mt button[data-v="1"].on'));
  app.close();
});

test('CA-6: las pestañas no cambian el estado S ni lo guardado', async () => {
  const app = await withSessions();
  const before = JSON.stringify(app.S);
  addTab(app);
  await openProgress(app);
  app.click(tabBtns(app)[1]);
  app.click(tabBtns(app)[0]);
  assert.equal(JSON.stringify(app.S), before);
  assert.deepEqual(Object.keys(app.S), ['v', 'routine', 'sessions', 'settings', 'active', 'lastExport', 'measures', 'exMuscles']);
  app.close();
});
