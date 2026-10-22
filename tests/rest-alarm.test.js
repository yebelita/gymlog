// Fin del descanso: alarma insistente, notificaciones (también con la pantalla bloqueada),
// audio inaudible que mantiene viva la página y todas las formas de silenciarla.
'use strict';
const { test } = require('node:test');
const assert = require('./helpers/assert');
const { loadApp } = require('./helpers/app');

const REST = 180000; // descanso del hip thrust (Día 1, primer ejercicio)

// App con una sesión empezada y la primera serie confirmada: descanso de 3 min en marcha
async function resting(opts) {
  const app = await loadApp(opts);
  await app.start(0);
  await app.confirm();
  return app;
}
const ringing = app => app.eval('ringing()');
const keep = app => app.env.audios[0];

/* ---- con la pantalla encendida ---- */

test('al terminar el descanso suena la alarma fuerte: 6 pitidos de onda cuadrada y vibración', async () => {
  const app = await resting();
  await app.advance(REST - 1000);
  assert.equal(app.beeps(), 0, 'no suena antes de tiempo');
  await app.advance(1100);
  assert.equal(app.beeps(), 1);
  const osc = app.env.oscillators;
  assert.ok(osc.every(o => o.type === 'square'));
  assert.deepEqual(osc.map(o => o.frequency.value), [988, 988, 988, 1319, 1319, 1319]);
  assert.deepEqual(app.env.vibrations.at(-1), [400, 150, 400, 150, 400]);
  assert.match(app.text('#tt'), /A por la siguiente/);
  assert.equal(app.env.notes.length, 0, 'con la pantalla encendida no hace falta notificación');
  app.close();
});

test('la alarma se repite cada 2 s mientras nadie la atienda', async () => {
  const app = await resting();
  await app.advance(REST + 100);
  await app.advance(2000);
  assert.equal(app.beeps(), 2);
  await app.advance(4000);
  assert.equal(app.beeps(), 4);
  assert.equal(ringing(app), true);
  app.close();
});

test('se corta sola a los 45 s y después desaparece el aviso', async () => {
  const app = await resting();
  await app.advance(REST + 100);
  await app.advance(60000);
  const n = app.beeps();
  assert.ok(n >= 20 && n <= 24, `entre 20 y 24 alarmas en 45 s (hubo ${n})`);
  assert.equal(ringing(app), false);
  await app.advance(30000);
  assert.equal(app.beeps(), n, 'no vuelve a sonar');
  assert.equal(app.S.active.timer, null);
  app.close();
});

test('tocar la pantalla silencia la alarma', async () => {
  const app = await resting();
  await app.advance(REST + 100);
  app.pointerdown();
  await app.advance(10000);
  assert.equal(app.beeps(), 1);
  assert.equal(ringing(app), false);
  assert.equal(app.S.active.timer, null, 'el aviso se quita 6 s después del final');
  app.close();
});

test('el aviso "¡A por la siguiente!" sigue visible mientras suena', async () => {
  const app = await resting();
  await app.advance(REST + 100);
  await app.advance(10000);
  assert.ok(app.S.active.timer && app.S.active.timer.fired);
  assert.equal(app.$('#timerBox').hidden, false);
  app.close();
});

test('Saltar durante el descanso lo cancela: no suena después', async () => {
  const app = await resting();
  await app.advance(30000);
  app.click('[data-a="tskip"]');
  await app.advance(REST);
  assert.equal(app.beeps(), 0);
  assert.equal(app.S.active.timer, null);
  assert.equal(keep(app).paused, true, 'se apaga el audio inaudible');
  app.close();
});

test('+15 y −15 reprograman el final del descanso', async () => {
  const app = await resting();
  app.click('[data-a="tadd"][data-v="15"]');
  await app.advance(REST + 100);
  assert.equal(app.beeps(), 0, 'con +15 aún no ha terminado');
  await app.advance(15000);
  assert.equal(app.beeps(), 1);
  app.close();

  const app2 = await resting();
  app2.click('[data-a="tadd"][data-v="-15"]');
  await app2.advance(REST - 15000 + 100);
  assert.equal(app2.beeps(), 1);
  app2.close();
});

test('+15 mientras suena para la alarma y abre 15 s más de descanso', async () => {
  const app = await resting();
  await app.advance(REST + 100);
  app.click('[data-a="tadd"][data-v="15"]');
  assert.equal(ringing(app), false);
  assert.equal(app.S.active.timer.fired, false);
  await app.advance(15100);
  assert.equal(app.beeps(), 2, 'vuelve a sonar al acabar los 15 s');
  app.close();
});

test('confirmar la siguiente serie mientras suena corta la alarma e inicia otro descanso', async () => {
  const app = await resting();
  await app.advance(REST + 100);
  await app.confirm();
  assert.equal(ringing(app), false);
  assert.equal(app.S.active.timer.fired, false);
  await app.advance(5000);
  assert.equal(app.beeps(), 1);
  app.close();
});

test('terminar la sesión mientras suena la detiene', async () => {
  const app = await resting();
  await app.advance(REST + 100);
  app.click('[data-a="finishAsk"]');
  app.click('#ok');
  await app.advance(10000);
  assert.equal(ringing(app), false);
  assert.equal(app.beeps(), 1);
  app.close();
});

test('con el sonido desactivado no pita, pero vibra', async () => {
  const app = await loadApp();
  app.eval('S.settings.sound = false');
  await app.start(0);
  await app.confirm();
  await app.advance(REST + 100);
  assert.equal(app.beeps(), 0);
  assert.deepEqual(app.env.vibrations.at(-1), [400, 150, 400, 150, 400]);
  app.close();
});

/* ---- con la pantalla bloqueada ---- */

test('bloqueado: al terminar llega una notificación con vibración larga', async () => {
  const app = await resting();
  await app.setVisibility('hidden');
  await app.advance(REST + 100);
  assert.equal(app.env.notes.length, 1);
  const n = app.env.notes[0];
  assert.equal(n.title, 'Descanso terminado');
  assert.equal(n.opts.tag, 'gymlog-rest');
  assert.equal(n.opts.renotify, true);
  assert.deepEqual(n.opts.vibrate, [500, 200, 500, 200, 500, 200, 800]);
  assert.equal(app.beeps(), 1, 'también suena');
  app.close();
});

test('bloqueado: la notificación se repite a los 10 y 20 s, y nada más', async () => {
  const app = await resting();
  await app.setVisibility('hidden');
  await app.advance(REST + 100);
  await app.advance(9000);
  assert.equal(app.env.notes.length, 1);
  await app.advance(1000);
  assert.equal(app.env.notes.length, 2);
  await app.advance(10000);
  assert.equal(app.env.notes.length, 3);
  await app.advance(60000);
  assert.equal(app.env.notes.length, 3);
  const at = app.env.notes.map(n => n.at - app.env.notes[0].at);
  assert.deepEqual(at, [0, 10000, 20000]);
  app.close();
});

test('el audio inaudible suena durante el descanso y mientras suena la alarma', async () => {
  const app = await resting();
  assert.equal(app.env.audios.length, 1);
  assert.equal(keep(app).loop, true);
  assert.equal(keep(app).paused, false, 'activo durante el descanso');
  await app.setVisibility('hidden');
  await app.advance(REST + 100);
  await app.advance(20000);
  assert.equal(keep(app).paused, false, 'sigue activo mientras suena la alarma');
  await app.advance(30000);
  assert.equal(keep(app).paused, true, 'se apaga al cortarse la alarma (45 s)');
  app.close();
});

test('desbloquear el móvil silencia la alarma, cierra la notificación y apaga el audio', async () => {
  const app = await resting();
  await app.setVisibility('hidden');
  await app.advance(REST + 100);
  await app.advance(4000);
  await app.setVisibility('visible');
  assert.equal(ringing(app), false);
  assert.ok(app.env.notes.every(n => n.closed), 'notificaciones cerradas');
  assert.equal(keep(app).paused, true);
  const n = app.beeps();
  await app.advance(10000);
  assert.equal(app.beeps(), n);
  app.close();
});

test('si el sistema congeló la página, al desbloquear tarde NO suena (ya estás mirando)', async () => {
  const app = await resting();
  await app.setVisibility('hidden');
  app.clock.jump(REST + 20000); // la página no ha ejecutado nada en todo ese tiempo
  await app.setVisibility('visible');
  await app.advance(10000);
  assert.equal(app.beeps(), 0);
  assert.equal(app.env.notes.length, 0);
  assert.equal(app.S.active.timer, null);
  app.close();
});

test('si se despierta tarde pero sigue bloqueado, avisa igualmente', async () => {
  const app = await resting();
  await app.setVisibility('hidden');
  app.clock.jump(REST + 20000);
  await app.advance(0);
  assert.equal(app.beeps(), 1);
  assert.equal(app.env.notes.length, 1);
  app.close();
});

test('sin vibración activada, la notificación no vibra', async () => {
  const app = await loadApp();
  app.eval('S.settings.vibrate = false');
  await app.start(0);
  await app.confirm();
  await app.setVisibility('hidden');
  await app.advance(REST + 100);
  assert.equal(app.env.notes.length, 1);
  assert.equal('vibrate' in app.env.notes[0].opts, false);
  app.close();
});

/* ---- permisos y ajuste "Notificación con la pantalla bloqueada" ---- */

test('al empezar una sesión pide permiso de notificaciones si aún no se ha decidido', async () => {
  const app = await loadApp({ permission: 'default' });
  await app.start(0);
  assert.equal(app.env.permRequests, 1);
  assert.equal(app.env.permission, 'granted');
  await app.confirm();
  assert.equal(keep(app).paused, false);
  app.close();
});

test('no vuelve a pedir permiso si ya se concedió o se denegó', async () => {
  for (const permission of ['granted', 'denied']) {
    const app = await loadApp({ permission });
    await app.start(0);
    assert.equal(app.env.permRequests, 0, permission);
    app.close();
  }
});

test('con permiso denegado: sin notificación ni audio inaudible, pero la alarma suena', async () => {
  const app = await resting({ permission: 'denied' });
  assert.equal(app.env.audios.length, 0);
  await app.setVisibility('hidden');
  await app.advance(REST + 100);
  assert.equal(app.env.notes.length, 0);
  assert.equal(app.beeps(), 1);
  app.close();
});

test('con el ajuste de notificación apagado: ni permiso, ni notificación, ni audio inaudible', async () => {
  const app = await loadApp({ permission: 'default' });
  app.eval('S.settings.notify = false');
  await app.start(0);
  await app.confirm();
  assert.equal(app.env.permRequests, 0);
  assert.equal(app.env.audios.length, 0);
  await app.setVisibility('hidden');
  await app.advance(REST + 100);
  assert.equal(app.env.notes.length, 0);
  app.close();
});

test('en un navegador sin notificaciones la app sigue funcionando y la alarma suena', async () => {
  const app = await resting({ notifications: false });
  await app.setVisibility('hidden');
  await app.advance(REST + 100);
  assert.equal(app.beeps(), 1);
  app.close();
});

test('al reabrir la app con un descanso en curso, se reprograma el aviso', async () => {
  const first = await resting();
  const stored = first.stored();
  first.close();
  const app = await loadApp({ stored }); // el reloj vuelve al mismo instante del confirm
  assert.notEqual(app.eval('restTO'), null, 'aviso programado al arrancar');
  assert.equal(keep(app).paused, false, 'audio inaudible reactivado');
  await app.advance(REST + 100);
  assert.equal(app.beeps(), 1);
  app.close();
});
