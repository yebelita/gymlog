// Spec 002: medidas corporales (Progreso → Medidas) y guía "cómo medir"
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('./helpers/assert');
const { loadApp, ROOT, T0 } = require('./helpers/app');

const DAY = 864e5;
const noon = ts => { const d = new Date(ts); d.setHours(12, 0, 0, 0); return d.getTime(); };
const M = (id, daysAgo, values, note = '') => ({ id, date: noon(T0 - daysAgo * DAY), values, note });
const BASE = { v: 1, routine: [{ id: 'd1', name: 'Día', exercises: [] }], sessions: [], settings: {} };

const withMeasures = measures => loadApp({ stored: { ...BASE, measures } });
const openMed = async app => {
  app.click('#nav [data-v="progress"]'); await app.flush();
  app.click('#progTabs [data-v="medidas"]'); await app.flush();
};
const newSheet = async app => { app.click('[data-a="measureNew"]'); await app.flush(); };
const fill = (app, vals) => { for (const [k, v] of Object.entries(vals)) app.$('#m_' + k).value = v; };
const save = async app => { app.click('#msave'); await app.flush(); };
const toastText = app => app.text('#toast');
const hidden = (app, k) => app.$('#g_' + k).hasAttribute('hidden');

test('CA-1: un estado antiguo sin measures arranca con [] y el resto intacto', async () => {
  const app = await loadApp({ stored: BASE });
  assert.deepEqual(app.S.measures, []);
  assert.equal(app.S.routine[0].name, 'Día');
  assert.equal(app.S.v, 1);
  app.close();
});

test('CA-2: se descartan solo las mediciones inválidas (al cargar y al importar)', async () => {
  const bad = [
    M('ok', 5, { cintura: 80 }),
    { id: 'sinfecha', values: { cintura: 1 } },
    { id: 'fechatexto', date: 'ayer', values: { cintura: 80 } },
    M('vacia', 4, {}),
    { id: 'tipo', date: noon(T0), values: 'x' },
    { id: 'nonum', date: noon(T0), values: { cintura: 'abc' } },
    'basura', null, 7
  ];
  const app = await withMeasures(bad);
  assert.deepEqual(app.S.measures.map(m => m.id), ['ok']);
  const viaImport = app.eval(`migrate({ routine: [], sessions: [], measures: ${JSON.stringify(bad)} }).measures.map(m => m.id)`);
  assert.deepEqual(viaImport, ['ok']);
  app.close();
});

test('CA-3: sin mediciones muestra el estado vacío y el botón, aunque no haya sesiones', async () => {
  const app = await loadApp();
  assert.equal(app.S.sessions.length, 0);
  await openMed(app);
  assert.match(app.text('.empty'), /Aún no hay mediciones/);
  assert.ok(app.$('[data-a="measureNew"]'));
  app.close();
});

test('CA-4: guardar solo la cintura crea una medición con ese único valor, persistida', async () => {
  const app = await loadApp();
  await openMed(app);
  await newSheet(app);
  fill(app, { cintura: '78,5' });
  await save(app);
  assert.equal(app.S.measures.length, 1);
  assert.deepEqual(app.S.measures[0].values, { cintura: 78.5 });
  assert.equal(app.S.measures[0].date, noon(T0));
  assert.deepEqual(app.stored().measures[0].values, { cintura: 78.5 });
  assert.equal(app.$('.sheet'), null, 'el sheet se cierra');
  app.close();
});

test('CA-5: sin ningún valor no se guarda y se avisa', async () => {
  const app = await loadApp();
  await openMed(app);
  await newSheet(app);
  await save(app);
  assert.equal(app.S.measures.length, 0);
  assert.match(toastText(app), /al menos una/);
  assert.ok(app.$('.sheet'), 'el sheet sigue abierto');
  app.close();
});

test('CA-6: valores fuera de rango o no numéricos se rechazan nombrando el campo', async () => {
  const app = await loadApp();
  await openMed(app);
  const cases = [['cintura', '400', /Cintura/], ['cintura', '4', /Cintura/], ['cintura', 'abc', /Cintura/],
    ['cintura', '78,5cm', /Cintura/], ['peso', '10', /Peso corporal/], ['peso', '501', /Peso corporal/]];
  for (const [k, v, re] of cases) {
    await newSheet(app);
    fill(app, { [k]: v });
    await save(app);
    assert.equal(app.S.measures.length, 0, `${k}=${v} no debe guardarse`);
    assert.match(toastText(app), re);
  }
  await newSheet(app);
  fill(app, { cintura: '5', peso: '500' });
  await save(app);
  assert.deepEqual(app.S.measures[0].values, { peso: 500, cintura: 5 }, 'los límites son válidos');
  app.close();
});

test('CA-7: coma y punto decimal dan el mismo valor', async () => {
  const app = await loadApp();
  await openMed(app);
  for (const v of ['78,5', '78.5']) { await newSheet(app); fill(app, { cintura: v }); await save(app); }
  assert.deepEqual(app.S.measures.map(m => m.values.cintura), [78.5, 78.5]);
  app.close();
});

test('CA-8: con historial los campos están vacíos con el último valor de sugerencia, y + parte de él', async () => {
  const app = await withMeasures([M('a', 3, { cintura: 80 }), M('b', 1, { cintura: 79, pecho: 100 })]);
  await openMed(app);
  await newSheet(app);
  assert.equal(app.$('#m_cintura').value, '');
  assert.equal(app.$('#m_cintura').placeholder, '79');
  assert.equal(app.$('#m_pecho').placeholder, '100');
  assert.equal(app.$('#m_date').value, '2026-10-20');
  app.click('[data-a="measureStep"][data-k="cintura"][data-d="1"]');
  assert.equal(app.$('#m_cintura').value, '79,5');
  app.click('[data-a="measureStep"][data-k="cintura"][data-d="-1"]');
  app.click('[data-a="measureStep"][data-k="cintura"][data-d="-1"]');
  assert.equal(app.$('#m_cintura').value, '78,5');
  assert.equal(app.$('#m_pecho').value, '', 'los demás siguen vacíos');
  app.close();
});

test('CA-9: la variación se calcula contra la anterior que tenga esa medida', async () => {
  const app = await withMeasures([M('a', 7, { cintura: 80 }), M('b', 3, { pecho: 100 }), M('c', 1, { cintura: 78.5 })]);
  await openMed(app);
  const row = app.$('[data-a="measureEdit"][data-id="c"]');
  assert.match(row.textContent, /78,5 cm/);
  assert.match(row.textContent, /−1,5 cm/);
  assert.doesNotMatch(app.$('[data-a="measureEdit"][data-id="b"]').textContent, /[−+]\d/, 'la primera de pecho no tiene variación');
  app.close();
});

test('CA-10: los tiles usan la última medición que incluye esa medida', async () => {
  const app = await withMeasures([M('a', 5, { pecho: 100 }), M('b', 2, { cintura: 80 })]);
  await openMed(app);
  const sel = app.$('select[data-ch="measure"]');
  sel.value = 'pecho';
  sel.dispatchEvent(new app.win.Event('change', { bubbles: true }));
  const tiles = [...app.doc.querySelectorAll('.tile')].map(t => t.textContent);
  assert.match(tiles[0], /100 cm/);
  app.close();
});

test('CA-11: editar la fecha mantiene S.measures ordenada', async () => {
  const app = await withMeasures([M('a', 10, { cintura: 80 }), M('b', 5, { cintura: 79 }), M('c', 1, { cintura: 78 })]);
  await openMed(app);
  app.click('[data-a="measureEdit"][data-id="c"]'); await app.flush();
  app.$('#m_date').value = '2026-10-01';
  await save(app);
  const dates = app.S.measures.map(m => m.date);
  assert.deepEqual(dates, [...dates].sort((x, y) => x - y));
  assert.equal(app.S.measures[0].id, 'c', '1 oct es anterior a hace 10 días (10 oct)');
  app.close();
});

test('CA-12: eliminar pide confirmación; al confirmar desaparece y al cancelar no', async () => {
  const app = await withMeasures([M('a', 3, { cintura: 80 }), M('b', 1, { cintura: 79 })]);
  await openMed(app);
  app.click('[data-a="measureEdit"][data-id="b"]'); await app.flush();
  app.click('#mdel'); await app.flush();
  app.click('#qNo'); await app.flush();
  assert.equal(app.S.measures.length, 2);
  app.click('[data-a="measureEdit"][data-id="b"]'); await app.flush();
  app.click('#mdel'); await app.flush();
  app.click('#qOk'); await app.flush();
  assert.deepEqual(app.S.measures.map(m => m.id), ['a']);
  assert.deepEqual(app.stored().measures.map(m => m.id), ['a']);
  app.close();
});

test('CA-13: con una sola medición la gráfica se dibuja y la variación es —', async () => {
  const app = await withMeasures([M('a', 1, { cintura: 80 })]);
  await openMed(app);
  assert.ok(app.$('.chart svg'));
  const tiles = [...app.doc.querySelectorAll('.tile b')].map(b => b.textContent);
  assert.deepEqual(tiles, ['80 cm', '—', '—']);
  app.close();
});

test('CA-14: la nota se escapa en la lista y en el sheet', async () => {
  const evil = '<img src=x onerror="window.pwned=1">';
  const app = await withMeasures([M('a', 1, { cintura: 80 }, evil)]);
  await openMed(app);
  assert.equal(app.doc.querySelectorAll('#app img').length, 0);
  assert.ok(app.text('[data-id="a"]').includes(evil), 'se ve como texto');
  app.click('[data-a="measureEdit"][data-id="a"]'); await app.flush();
  assert.equal(app.$('#m_note').value, evil);
  assert.equal(app.doc.querySelectorAll('.sheet img[src="x"]').length, 0);
  assert.equal(app.win.pwned, undefined);
  app.close();
});

test('CA-15: exportar y reimportar conserva las mediciones', async () => {
  const app = await withMeasures([M('a', 3, { cintura: 80, bicepsI: 35 }, 'nota'), M('b', 1, { peso: 70.5 })]);
  const text = await new Promise(res => { const fr = new app.win.FileReader(); fr.onload = () => res(fr.result); fr.readAsText(app.eval('backupBlob()')); });
  const d = JSON.parse(text);
  assert.equal(d.measures.length, 2);
  const re = app.eval(`JSON.stringify(migrate(${text}).measures)`);
  assert.deepEqual(JSON.parse(re), JSON.parse(JSON.stringify(app.S.measures)));
  app.close();
});

test('CA-16: ⓘ despliega la guía sin cerrar el sheet ni borrar lo escrito', async () => {
  const app = await loadApp();
  await openMed(app);
  await newSheet(app);
  fill(app, { cintura: '77' });
  assert.ok(hidden(app, 'pecho'));
  app.click('[data-a="measureInfo"][data-k="pecho"]');
  assert.ok(!hidden(app, 'pecho'));
  assert.match(app.text('#g_pecho'), /pezones|pecho/i);
  assert.ok(app.$('.sheet'));
  assert.equal(app.$('#m_cintura').value, '77');
  app.click('[data-a="measureInfo"][data-k="_gen"]');
  assert.ok(!hidden(app, '_gen'), 'consejos generales');
  assert.match(app.text('#g__gen'), /misma hora/);
  app.close();
});

test('CA-17: abrir otra guía pliega la anterior; pulsar la misma la pliega', async () => {
  const app = await loadApp();
  await openMed(app);
  await newSheet(app);
  app.click('[data-a="measureInfo"][data-k="pecho"]');
  app.click('[data-a="measureInfo"][data-k="cintura"]');
  assert.ok(hidden(app, 'pecho'));
  assert.ok(!hidden(app, 'cintura'));
  app.click('[data-a="measureInfo"][data-k="cintura"]');
  assert.ok(hidden(app, 'cintura'));
  app.close();
});

test('CA-18: izquierdo y derecho comparten imagen y texto', async () => {
  const app = await loadApp();
  await openMed(app);
  await newSheet(app);
  for (const [i, d] of [['bicepsI', 'bicepsD'], ['antebrazoI', 'antebrazoD'], ['musloI', 'musloD'], ['pantorrillaI', 'pantorrillaD']]) {
    assert.ok(app.$(`#g_${i} img`), `imagen de ${i}`);
    assert.equal(app.$(`#g_${i} img`).getAttribute('src'), app.$(`#g_${d} img`).getAttribute('src'));
    assert.equal(app.text(`#g_${i} p`), app.text(`#g_${d} p`));
  }
  app.close();
});

test('CA-19: toda medida tiene guía, y cada imagen existe y está en ASSETS del service worker', async () => {
  const app = await loadApp();
  const list = JSON.parse(app.eval('JSON.stringify(MEASURES)'));
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.equal(list.length, 14);
  for (const m of list) {
    assert.ok(m.guia && m.guia.trim(), `${m.k} sin guía`);
    if (!m.img) continue;
    assert.ok(fs.existsSync(path.join(ROOT, m.img)), `falta ${m.img}`);
    assert.ok(sw.includes(`'./${m.img}'`), `sw.js no lista ${m.img}`);
  }
  app.close();
});

test('CA-20: si una imagen falla, el texto de la guía sigue y el sheet no se rompe', async () => {
  const app = await loadApp();
  await openMed(app);
  await newSheet(app);
  app.click('[data-a="measureInfo"][data-k="cintura"]');
  app.$('#g_cintura img').dispatchEvent(new app.win.Event('error'));
  assert.equal(app.$('#g_cintura img'), null);
  assert.ok(app.text('#g_cintura p').length > 10);
  assert.ok(!hidden(app, 'cintura'));
  assert.ok(app.$('.sheet'));
  app.close();
});

test('CA-21: el peso corporal solo lleva texto', async () => {
  const app = await loadApp();
  await openMed(app);
  await newSheet(app);
  assert.equal(app.$('#g_peso img'), null);
  assert.match(app.text('#g_peso'), /mañana|ayunas|báscula/);
  app.close();
});
