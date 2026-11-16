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

/* ---------- Fase 1: la alarma nativa integrada en el descanso real ---------- */

const IDS = [1001, 1002, 1003];
const restTimer = app => app.eval('S.active.timer && ({ end: S.active.timer.end, total: S.active.timer.total, fired: S.active.timer.fired })');
const lastSchedule = app => callsOf(app, 'schedule').at(-1).args.notifications;
const startRest = async app => { await app.start(0); await app.confirm(); await app.flush(); };
const idsOf = c => (c.args.notifications || []).map(n => n.id).sort();

test('CA-3: al empezar un descanso se programan 3 notificaciones con ids fijos: la principal al terminar y dos refuerzos a +10 s y +20 s', async () => {
  const app = await loadApp({ native: true });
  await startRest(app);
  const T = restTimer(app), n = lastSchedule(app);
  assert.deepEqual(n.map(x => x.id), IDS);
  assert.deepEqual(n.map(x => x.schedule.at.getTime()), [T.end, T.end + 10000, T.end + 20000]);
  for (const x of n) {
    assert.equal(x.channelId, 'descanso-sv');
    assert.equal(x.title, 'Descanso terminado');
    assert.match(x.body, /siguiente serie/);
    assert.equal(x.schedule.allowWhileIdle, true);
    assert.equal(x.isExactNotification, true);
  }
  assert.equal(app.env.audios.length, 0, 'sin el audio inaudible del navegador (keepAlive)');
  app.close();
});

test('CA-4: sumar o restar tiempo reprograma las mismas ids; saltar, terminar o desactivar avisos las cancelan', async () => {
  const app = await loadApp({ native: true });
  await startRest(app);
  const end0 = restTimer(app).end;
  app.click('[data-a="tadd"][data-v="15"]'); await app.flush();
  assert.deepEqual(lastSchedule(app).map(x => x.id), IDS, 'mismas ids');
  assert.equal(lastSchedule(app)[0].schedule.at.getTime(), end0 + 15000);
  app.click('[data-a="tadd"][data-v="-15"]'); await app.flush();
  assert.equal(lastSchedule(app)[0].schedule.at.getTime(), end0);

  const antes = callsOf(app, 'cancel').length;
  app.click('[data-a="tskip"]'); await app.flush();
  const c = callsOf(app, 'cancel');
  assert.equal(c.length, antes + 1, 'saltar cancela');
  assert.deepEqual(idsOf(c.at(-1)), IDS);

  await app.confirm(); await app.flush();   // otro descanso
  const antes2 = callsOf(app, 'cancel').length;
  app.eval('S.settings.notify = false; syncRest()'); await app.flush();
  assert.equal(callsOf(app, 'cancel').length, antes2 + 1, 'desactivar los avisos cancela');
  app.close();
});

test('CA-5: con la página visible, 2 s antes del final se cancelan las pendientes; con la página oculta no', async () => {
  let app = await loadApp({ native: true });
  await startRest(app);
  const T = restTimer(app), base = callsOf(app, 'cancel').length;   // lo anterior al descanso no cuenta
  await app.advance(T.end - app.clock.now - 3000);
  assert.equal(callsOf(app, 'cancel').length, base, 'a 3 s del final aún no');
  await app.advance(1500);
  assert.equal(callsOf(app, 'cancel').length, base + 1, 'a menos de 2 s se cancelan');
  assert.deepEqual(idsOf(callsOf(app, 'cancel').at(-1)), IDS);
  await app.advance(500);
  assert.equal(callsOf(app, 'cancel').length, base + 1, 'una sola vez');
  app.close();

  app = await loadApp({ native: true });
  await startRest(app);
  const base2 = callsOf(app, 'cancel').length;
  await app.setVisibility('hidden');
  await app.advance(restTimer(app).end - app.clock.now - 500);
  assert.equal(callsOf(app, 'cancel').length, base2, 'con la pantalla bloqueada se quedan');
  app.close();
});

test('CA-5b: si se suma tiempo después de cancelar, vuelven a programarse', async () => {
  const app = await loadApp({ native: true });
  await startRest(app);
  const base = callsOf(app, 'cancel').length;
  await app.advance(restTimer(app).end - app.clock.now - 1500);
  assert.equal(callsOf(app, 'cancel').length, base + 1);
  const n = callsOf(app, 'schedule').length;
  app.click('[data-a="tadd"][data-v="15"]'); await app.flush();
  assert.equal(callsOf(app, 'schedule').length, n + 1, 'reprogramado');
  await app.advance(3000);
  assert.equal(callsOf(app, 'cancel').length, base + 1, 'y no se vuelve a cancelar mientras falten más de 2 s');
  app.close();
});

test('CA-6 y CA-15: con la pantalla bloqueada al acabar no suena la alarma de la app y los refuerzos se quedan; al desbloquear se limpian', async () => {
  const app = await loadApp({ native: true });
  await startRest(app);
  const base = callsOf(app, 'cancel').length, vib0 = app.env.vibrations.length;   // confirmar la serie ya vibró una vez
  await app.setVisibility('hidden');
  await app.advance(restTimer(app).end - app.clock.now + 3000);   // el JS sigue vivo con la pantalla bloqueada
  assert.equal(app.eval('S.active.timer.fired'), true);
  assert.equal(app.beeps(), 0, 'no suena la alarma de la app: lo hace la notificación');
  assert.equal(app.env.vibrations.length, vib0, 'ni vibra la app');
  assert.equal(callsOf(app, 'cancel').length, base, 'los refuerzos siguen pendientes');
  assert.equal(callsOf(app, 'removeAllDeliveredNotifications').length, 0);

  await app.setVisibility('visible');
  assert.equal(callsOf(app, 'removeAllDeliveredNotifications').length, 1, 'se retiran las entregadas');
  assert.deepEqual(idsOf(callsOf(app, 'cancel').at(-1)), IDS, 'y se cancelan los refuerzos pendientes');
  assert.equal(app.beeps(), 0, 'desbloquear no hace sonar la alarma de la app');
  app.close();
});

test('CA-15b: con la página visible al acabar sí suena la alarma de la app', async () => {
  const app = await loadApp({ native: true });
  await startRest(app);
  const vib0 = app.env.vibrations.length;
  await app.advance(restTimer(app).end - app.clock.now + 100);
  assert.ok(app.beeps() >= 1, 'suena en la app');
  assert.ok(app.env.vibrations.length > vib0, 'y vibra');
  app.close();
});

test('CA-9: si la página estuvo congelada y vuelve más de 5 s tarde, no suena', async () => {
  const app = await loadApp({ native: true });
  await startRest(app);
  const T = restTimer(app);
  await app.setVisibility('hidden');
  app.clock.jump(T.end - app.clock.now + 20000);    // congelada: no corren los temporizadores
  await app.setVisibility('visible');
  assert.equal(app.beeps(), 0);
  app.close();
});

test('CA-7: sin permiso no se programa nada; askNotify lo pide y, si se concede, se programa', async () => {
  let app = await loadApp({ native: { permission: 'prompt', grantOnRequest: true } });
  await startRest(app);   // empezar la sesión pide el permiso
  assert.equal(callsOf(app, 'requestPermissions').length, 1);
  assert.deepEqual(lastSchedule(app).map(x => x.id), IDS, 'concedido: se programa');
  app.close();

  app = await loadApp({ native: { permission: 'prompt', grantOnRequest: false } });
  await startRest(app);
  assert.equal(callsOf(app, 'requestPermissions').length, 1);
  assert.equal(callsOf(app, 'schedule').length, 0, 'denegado: nada programado');
  app.close();

  app = await loadApp({ native: { permission: 'denied' } });
  await startRest(app);
  assert.equal(callsOf(app, 'schedule').length, 0);
  app.close();
});

test('CA-8: con los avisos desactivados no se programa nada', async () => {
  const app = await loadApp({ native: true, stored: { v: 1, settings: { notify: false } } });
  await startRest(app);
  assert.equal(callsOf(app, 'schedule').length, 0);
  app.close();
});

test('CA-8b: el canal sigue a los interruptores de sonido y vibración', async () => {
  const app = await loadApp({ native: true, stored: { v: 1, settings: { sound: false } } });
  await startRest(app);
  assert.ok(lastSchedule(app).every(x => x.channelId === 'descanso-v'));
  app.close();
});

test('CA-12: en la web no hay llamadas nativas y los avisos del navegador funcionan como siempre', async () => {
  const app = await loadApp();
  await startRest(app);
  assert.equal(app.native, null);
  assert.ok(app.env.audios.length >= 1, 'la web mantiene el audio inaudible para seguir viva con la pantalla bloqueada');
  await app.setVisibility('hidden');
  await app.advance(restTimer(app).end - app.clock.now + 500);
  assert.ok(app.env.notes.length >= 1, 'y avisa con la notificación del navegador');
  app.close();
});

/* ---------- Fase 2: respaldo nativo, estado en Ajustes, icono, firma y documentación ---------- */

test('CA-11: en nativo Exportar escribe el JSON con Filesystem y abre el menú de compartir; no usa <a download>', async () => {
  const app = await loadApp({ native: true });
  await openSettings(app);
  assert.equal(app.$('[data-a="share"]'), null, 'sin el botón de compartir aparte (CA-11c)');
  app.click('[data-a="export"]'); await app.flush();
  const w = callsOf(app, 'writeFile'), sh = callsOf(app, 'share');
  assert.equal(w.length, 1);
  assert.match(w[0].args.path, /^gymlog-respaldo-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(w[0].args.directory, 'CACHE');
  assert.equal(w[0].args.encoding, 'utf8');
  const d = JSON.parse(w[0].args.data);
  assert.equal(d.app, 'gymlog'); assert.ok(Array.isArray(d.routine) && Array.isArray(d.sessions) && Array.isArray(d.measures));
  assert.equal(sh.length, 1);
  assert.deepEqual([...sh[0].args.files], ['file:///cache/' + w[0].args.path]);
  assert.equal(app.S.lastExport, app.clock.now, 'se anota el último respaldo');
  assert.equal(app.env.objectUrls, 0, 'no se crea ningún enlace de descarga');
  assert.equal(app.$('a[download]'), null);
  app.close();
});

test('CA-11b: si se cancela el menú de compartir no hay error ni se anota el respaldo; si falla la escritura se avisa', async () => {
  let app = await loadApp({ native: { shareError: 'Share canceled' } });
  await openSettings(app);
  app.click('[data-a="export"]'); await app.flush();
  assert.equal(callsOf(app, 'share').length, 1);
  assert.equal(app.S.lastExport, 0);
  assert.doesNotMatch(app.text('#toast'), /No se pudo/);
  app.close();

  app = await loadApp({ native: { writeError: 'disco lleno' } });
  await openSettings(app);
  app.click('[data-a="export"]'); await app.flush();
  assert.equal(callsOf(app, 'share').length, 0, 'sin escritura no se abre el menú');
  assert.equal(app.S.lastExport, 0);
  assert.match(app.text('#toast'), /No se pudo exportar/);
  app.close();
});

test('CA-18: en nativo Ajustes muestra el estado del permiso de notificaciones, se refresca al volver y hay ayuda de batería', async () => {
  let app = await loadApp({ native: { permission: 'granted' } });
  await openSettings(app);
  assert.match(app.text('#app'), /Notificaciones permitidas/);
  assert.ok(app.$('#batHelp'));
  assert.match(app.text('#batHelp'), /Batería/);
  app.native.perm = 'denied';                       // el usuario las bloquea en los ajustes del móvil
  await app.setVisibility('hidden'); await app.setVisibility('visible');
  assert.match(app.text('#app'), /bloqueadas/);
  assert.match(app.text('#app'), /ajustes del móvil/);
  app.close();

  app = await loadApp({ native: { permission: 'prompt' } });
  await openSettings(app);
  assert.match(app.text('#app'), /Se pedirá permiso/);
  app.close();

  app = await loadApp();
  await openSettings(app);
  assert.equal(app.$('#batHelp'), null, 'en la web no hay ayuda de batería');
  app.close();
});

test('CA-17: la app se llama GymLog y el fondo del icono adaptativo es #0f1115', () => {
  const res = path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'values');
  assert.match(fs.readFileSync(path.join(res, 'strings.xml'), 'utf8'), /<string name="app_name">GymLog<\/string>/);
  assert.match(fs.readFileSync(path.join(res, 'ic_launcher_background.xml'), 'utf8'), /#0f1115/i);
});

test('CA-16: la firma release lee keystore.properties; ni este archivo ni las claves se versionan; la compilación debug no depende de ellos', () => {
  const g = fs.readFileSync(path.join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');
  assert.match(g, /keystore\.properties/);
  assert.match(g, /signingConfigs\s*\{[\s\S]*release/);
  assert.match(g, /keystorePropertiesFile\.exists\(\)/, 'solo firma si el archivo existe');
  const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  assert.match(gi, /^keystore\.properties$/m);
  assert.match(gi, /^\*\.jks$/m);
  assert.ok(!fs.existsSync(path.join(ROOT, 'android', 'keystore.properties')) || /keystore\.properties/.test(gi));
});

test('CA-19: docs/ANDROID.md explica los requisitos, la compilación, la firma y la copia de la clave', () => {
  const d = fs.readFileSync(path.join(ROOT, 'docs', 'ANDROID.md'), 'utf8');
  for (const t of ['JDK 21', 'assembleRelease', 'keystore.properties', 'copia', 'adb install', 'sync-www']) assert.ok(d.includes(t), `falta «${t}»`);
});
