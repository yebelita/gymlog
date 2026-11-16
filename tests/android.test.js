// Spec 004 (Fase 0 y 1): APK Android con Capacitor. Los plugins se simulan (tests/helpers/app.js, opción `native`);
// el comportamiento real con la pantalla bloqueada solo se puede probar en el móvil (criterios M-n de la spec).
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('./helpers/assert');
const { loadApp, ROOT } = require('./helpers/app');

const sync = async () => import('../scripts/sync-www.mjs');
const callsOf = (app, fn) => app.native.calls.filter(c => c.fn === fn);
const openSettings = async app => { app.click('#nav [data-v="settings"]'); await app.flush(); };

/* ---------- plataforma ---------- */

test('CA-1: sin Capacitor la app es la web de siempre: NATIVE falso, service worker registrado, sin llamadas nativas', async () => {
  const app = await loadApp();
  assert.equal(app.eval('NATIVE'), false);
  assert.equal(app.env.swRegs, 1);
  assert.equal(app.native, null);
  await openSettings(app);
  assert.equal(app.$('[data-a="nativeTest"]'), null, 'el botón de prueba nativa no existe en la web');
  assert.equal(app.$('[data-a="testSecs"]'), null, 'ni su selector de tiempo');
  app.close();
});

test('CA-2: con Capacitor.isNativePlatform() verdadero NATIVE es verdadero y no se registra el service worker', async () => {
  const app = await loadApp({ native: true });
  assert.equal(app.eval('NATIVE'), true);
  assert.equal(app.env.swRegs, 0);
  app.close();
});

test('CA-10e: restChannel() elige el canal según sonido y vibración, y la JS no crea canales (los crea el código nativo)', async () => {
  const app = await loadApp({ native: true });
  assert.equal(callsOf(app, 'createChannel').length, 0);
  const ch = (snd, vib) => app.eval(`S.settings.sound = ${snd}; S.settings.vibrate = ${vib}; restChannel()`);
  assert.equal(ch(true, true), 'descanso-sv');
  assert.equal(ch(true, false), 'descanso-s');
  assert.equal(ch(false, true), 'descanso-v');
  assert.equal(ch(false, false), 'descanso-n');
  app.close();
});

test('CA-10: Ajustes muestra «Probar alarma» con selector 15 s / 1 min / 5 min / 30 min solo en nativo y programa una notificación exacta', async () => {
  const app = await loadApp({ native: true });
  await openSettings(app);
  const opts = [...app.doc.querySelectorAll('[data-a="testSecs"]')];
  assert.deepEqual(opts.map(b => b.textContent), ['15 s', '1 min', '5 min', '30 min']);
  assert.deepEqual(opts.map(b => b.dataset.v), ['15', '60', '300', '1800']);
  assert.equal(app.$('[data-a="testSecs"].on').dataset.v, '15', 'por defecto 15 s');
  const btn = () => app.$('[data-a="nativeTest"]');
  assert.match(btn().textContent, /Probar alarma \(15 s\)/);

  app.click(btn()); await app.flush();
  let s = callsOf(app, 'schedule');
  assert.equal(s.length, 1);
  const n = s[0].args.notifications[0];
  assert.equal(n.channelId, 'descanso-sv');
  assert.equal(n.schedule.at.getTime(), app.clock.now + 15000, 'a 15 s exactos');
  assert.equal(n.schedule.allowWhileIdle, true);
  assert.equal(n.isExactNotification, true);
  assert.ok(Number.isInteger(n.id) && n.title && n.body);
  assert.match(app.text('#toast'), /15 s/);

  app.click('[data-a="testSecs"][data-v="300"]');
  assert.equal(app.$('[data-a="testSecs"].on').dataset.v, '300');
  assert.match(btn().textContent, /Probar alarma \(5 min\)/);
  app.click(btn()); await app.flush();
  s = callsOf(app, 'schedule');
  assert.equal(s.at(-1).args.notifications[0].schedule.at.getTime(), app.clock.now + 300000);
  assert.equal(s.at(-1).args.notifications[0].id, n.id, 'misma id: la prueba nueva sustituye a la anterior');

  app.eval('S.settings.sound = false'); await app.flush();
  app.click(btn()); await app.flush();
  assert.equal(callsOf(app, 'schedule').at(-1).args.notifications[0].channelId, 'descanso-v', 'sin sonido: canal solo vibración');
  app.close();
});

test('CA-10f: MainActivity.java crea los cuatro canales con USAGE_ALARM, importancia alta y visibilidad pública, y borra el antiguo', () => {
  const j = fs.readFileSync(path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'yebelita', 'gymlog', 'MainActivity.java'), 'utf8');
  for (const id of ['descanso-sv', 'descanso-s', 'descanso-v', 'descanso-n']) assert.ok(j.includes(`"${id}"`), id);
  assert.match(j, /USAGE_ALARM/);
  assert.match(j, /IMPORTANCE_HIGH/);
  assert.match(j, /VISIBILITY_PUBLIC/);
  assert.match(j, /deleteNotificationChannel\("descanso"\)/);
  assert.match(j, /Build\.VERSION_CODES\.O/, 'los canales solo existen desde Android 8');
});

test('CA-10c: la prueba pide el permiso de notificaciones si falta y no programa nada si se deniega', async () => {
  let app = await loadApp({ native: { permission: 'prompt', grantOnRequest: true } });
  await openSettings(app);
  app.click('[data-a="nativeTest"]'); await app.flush();
  assert.equal(callsOf(app, 'requestPermissions').length, 1);
  assert.equal(callsOf(app, 'schedule').length, 1, 'concedido: se programa');
  app.close();

  app = await loadApp({ native: { permission: 'prompt', grantOnRequest: false } });
  await openSettings(app);
  app.click('[data-a="nativeTest"]'); await app.flush();
  assert.equal(callsOf(app, 'requestPermissions').length, 1);
  assert.equal(callsOf(app, 'schedule').length, 0, 'denegado: no se programa');
  assert.match(app.text('#toast'), /notificaciones/i);
  app.close();
});

test('CA-10d: en nativo Ajustes no muestra el aviso de «navegador sin notificaciones»', async () => {
  const app = await loadApp({ native: true, notifications: false });
  await openSettings(app);
  assert.doesNotMatch(app.text('#app'), /navegador no admite/);
  app.close();
});

/* ---------- empaquetado ---------- */

test('CA-13: sync-www copia exactamente los archivos de la app (los de ASSETS) y nada más, limpiando lo anterior', async () => {
  const { appFiles, syncWww } = await sync();
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const assets = JSON.parse(/const ASSETS = (\[[\s\S]*?\]);/.exec(sw)[1].replace(/'/g, '"')).filter(a => a !== './').map(a => a.replace(/^\.\//, ''));
  assert.deepEqual(appFiles(ROOT).sort(), assets.sort());

  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gymlog-www-'));
  fs.writeFileSync(path.join(out, 'viejo.txt'), 'sobra');
  syncWww(ROOT, out);
  const listed = [];
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => (e.isDirectory() ? walk(path.join(d, e.name)) : listed.push(path.relative(out, path.join(d, e.name)).split(path.sep).join('/'))));
  walk(out);
  assert.deepEqual(listed.sort(), assets.sort(), 'solo los archivos de la app; el viejo se elimina');
  for (const a of ['sw.js', 'tests', 'specs', 'scripts', 'node_modules', 'android', 'package.json'])
    assert.ok(!listed.some(f => f === a || f.startsWith(a + '/')), `no debe copiar ${a}`);
  for (const f of listed) assert.deepEqual(fs.readFileSync(path.join(out, f)), fs.readFileSync(path.join(ROOT, f)), `${f} idéntico`);
  fs.rmSync(out, { recursive: true, force: true });
});

test('CA-14: capacitor.config.json y AndroidManifest.xml declaran appId, webDir y los permisos acordados', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));
  assert.equal(cfg.appId, 'com.yebelita.gymlog');
  assert.equal(cfg.appName, 'GymLog');
  assert.equal(cfg.webDir, 'www');
  const man = fs.readFileSync(path.join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
  for (const p of ['POST_NOTIFICATIONS', 'VIBRATE', 'USE_EXACT_ALARM']) assert.match(man, new RegExp(`android\\.permission\\.${p}`), p);
  assert.ok(fs.existsSync(path.join(ROOT, 'android', 'app', 'build.gradle')));
});

test('CA-14b: el .gitignore no versiona www/ y package.json lleva Capacitor solo como dependencia de desarrollo', () => {
  assert.match(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'), /^www\/$/m);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(!pkg.dependencies || Object.keys(pkg.dependencies).length === 0, 'sin dependencias de runtime');
  for (const d of ['@capacitor/core', '@capacitor/cli', '@capacitor/android', '@capacitor/local-notifications', '@capacitor/app', '@capacitor/filesystem', '@capacitor/share'])
    assert.ok(pkg.devDependencies[d], d);
});
