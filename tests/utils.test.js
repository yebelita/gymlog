// Utilidades de formato y parseo (sección "utilidades" de index.html)
'use strict';
const { test, before, after } = require('node:test');
const assert = require('./helpers/assert');
const { loadApp } = require('./helpers/app');

let app;
before(async () => { app = await loadApp(); });
after(() => app.close());
const ev = c => app.eval(c);

test('fmtN usa coma decimal y redondea a 2 decimales', () => {
  assert.equal(ev('fmtN(2.5)'), '2,5');
  assert.equal(ev('fmtN(100)'), '100');
  assert.equal(ev('fmtN(1.005 + 0.004)'), '1,01');
  assert.equal(ev('fmtN("abc")'), '0');
});

test('fmtT formatea segundos como s / min / m:ss min', () => {
  assert.equal(ev('fmtT(45)'), '45 s');
  assert.equal(ev('fmtT(120)'), '2 min');
  assert.equal(ev('fmtT(90)'), '1:30 min');
  assert.equal(ev('fmtT(-5)'), '0 s');
});

test('fmtClock redondea hacia arriba (cuenta atrás)', () => {
  assert.equal(ev('fmtClock(61.2)'), '1:02');
  assert.equal(ev('fmtClock(0)'), '0:00');
  assert.equal(ev('fmtClock(-3)'), '0:00');
});

test('fmtRest, fmtDur y fmtElapsed', () => {
  assert.equal(ev('fmtRest(45)'), '45 s');
  assert.equal(ev('fmtRest(120)'), '2 min');
  assert.equal(ev('fmtRest(90)'), '1:30 min');
  assert.equal(ev('fmtDur(65 * 60000)'), '1 h 5 min');
  assert.equal(ev('fmtDur(59 * 60000)'), '59 min');
  assert.equal(ev('fmtElapsed(3661000)'), '1:01:01');
  assert.equal(ev('fmtElapsed(75000)'), '1:15');
});

test('esc escapa los caracteres peligrosos de HTML', () => {
  assert.equal(ev(`esc('<a href="x">&\\'')`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  assert.equal(ev('esc(null)'), '');
});

test('parseNum acepta coma decimal y firstNum extrae el primer número', () => {
  assert.equal(ev('parseNum("2,5")'), 2.5);
  assert.ok(Number.isNaN(ev('parseNum("abc")')));
  assert.equal(ev('firstNum("8-10 por pierna")'), 8);
  assert.equal(ev('firstNum("20-30 min")'), 20);
  assert.equal(ev('firstNum("")'), 0);
});

test('norm normaliza nombres para enlazar historial', () => {
  assert.equal(ev('norm("  Face Pull ")'), 'face pull');
  assert.equal(ev('norm(undefined)'), '');
});
