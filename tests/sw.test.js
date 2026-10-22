// Service worker: caché offline, limpieza de versiones antiguas y clic en la notificación
'use strict';
const { test } = require('node:test');
const assert = require('./helpers/assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT } = require('./helpers/app');

const CODE = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Ejecuta sw.js en un contexto con `self`, `caches`, `clients` y `fetch` falsos
function loadSW({ cached = {}, cacheNames = [], windows = [], network } = {}) {
  const listeners = {};
  const log = { added: [], deleted: [], put: [], focused: 0, opened: [] };
  const cache = {
    addAll: async list => { log.added.push(...list); },
    match: async key => cached[typeof key === 'string' ? key : key.url],
    put: async (key) => { log.put.push(typeof key === 'string' ? key : key.url); }
  };
  const ctx = {
    URL, Promise, console,
    location: { origin: 'http://localhost' },
    caches: { open: async () => cache, keys: async () => cacheNames, delete: async k => { log.deleted.push(k); return true; } },
    fetch: network || (async () => { throw new Error('offline'); })
  };
  ctx.self = Object.assign(ctx, {
    addEventListener: (t, fn) => { listeners[t] = fn; },
    skipWaiting: async () => {},
    clients: {
      claim: async () => {},
      matchAll: async () => windows.map(w => ({ ...w, focus: async () => { log.focused++; } })),
      openWindow: async url => { log.opened.push(url); }
    }
  });
  const { CACHE, ASSETS } = vm.runInNewContext(CODE + '\n;({ CACHE, ASSETS })', ctx);
  const fire = (type, extra = {}) => {
    const ev = { ...extra, waits: [], responded: null, waitUntil(p) { this.waits.push(p); }, respondWith(p) { this.responded = p; } };
    listeners[type](ev);
    return ev;
  };
  return { CACHE, ASSETS, fire, log };
}

test('todos los archivos de ASSETS existen y están todos los de la app', () => {
  const { ASSETS } = loadSW();
  for (const a of ASSETS) if (a !== './') assert.ok(fs.existsSync(path.join(ROOT, a)), `falta ${a}`);
  for (const f of ['index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'])
    assert.ok(ASSETS.includes('./' + f), `ASSETS no incluye ${f}`);
});

test('install precachea todos los archivos', async () => {
  const sw = loadSW();
  const ev = sw.fire('install');
  await Promise.all(ev.waits);
  assert.deepEqual(sw.log.added, sw.ASSETS);
});

test('activate borra las cachés de versiones anteriores', async () => {
  const sw = loadSW({ cacheNames: ['gymlog-v1', 'gymlog-v2', 'otra'] });
  const ev = sw.fire('activate');
  await Promise.all(ev.waits);
  assert.deepEqual(sw.log.deleted, ['gymlog-v1', 'gymlog-v2', 'otra']);
  const sw2 = loadSW({ cacheNames: [sw.CACHE] });
  await Promise.all(sw2.fire('activate').waits);
  assert.deepEqual(sw2.log.deleted, [], 'la caché actual se conserva');
});

test('sin conexión, abrir la app sirve index.html desde la caché', async () => {
  const sw = loadSW({ cached: { './index.html': 'HTML EN CACHÉ' } });
  const ev = sw.fire('fetch', { request: { method: 'GET', url: 'http://localhost/', mode: 'navigate' } });
  assert.equal(await ev.responded, 'HTML EN CACHÉ');
});

test('con caché y conexión responde al instante y actualiza la caché en segundo plano', async () => {
  const sw = loadSW({ cached: { 'http://localhost/icon-192.png': 'viejo' },
    network: async () => ({ ok: true, clone() { return this; } }) });
  const req = { method: 'GET', url: 'http://localhost/icon-192.png', mode: 'no-cors' };
  const ev = sw.fire('fetch', { request: req });
  assert.equal(await ev.responded, 'viejo');
  await Promise.all(ev.waits);
  assert.deepEqual(sw.log.put, ['http://localhost/icon-192.png']);
});

test('ignora peticiones POST y de otros orígenes', () => {
  const sw = loadSW();
  assert.equal(sw.fire('fetch', { request: { method: 'POST', url: 'http://localhost/x' } }).responded, null);
  assert.equal(sw.fire('fetch', { request: { method: 'GET', url: 'https://cdn.example.com/x.js' } }).responded, null);
});

test('tocar la notificación enfoca la app si ya está abierta', async () => {
  const sw = loadSW({ windows: [{ url: 'http://localhost/' }] });
  let closed = false;
  const ev = sw.fire('notificationclick', { notification: { close() { closed = true; } } });
  await Promise.all(ev.waits);
  assert.ok(closed);
  assert.equal(sw.log.focused, 1);
  assert.deepEqual(sw.log.opened, []);
});

test('tocar la notificación abre la app si estaba cerrada', async () => {
  const sw = loadSW({ windows: [] });
  const ev = sw.fire('notificationclick', { notification: { close() {} } });
  await Promise.all(ev.waits);
  assert.deepEqual(sw.log.opened, ['./']);
});
