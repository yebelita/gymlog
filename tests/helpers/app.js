// Carga index.html en jsdom con un reloj falso y APIs del dispositivo simuladas
// (audio, vibración, notificaciones, service worker, wake lock) para poder probar la app
// sin navegador. Cada test crea su propia instancia con loadApp() y la cierra con close().
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const KEY = 'gymlog.v1';
const T0 = new Date(2026, 9, 20, 10, 0, 0).getTime(); // martes 20 oct 2026, 10:00 hora local

/* Reloj falso: controla Date.now(), setTimeout y setInterval de la página */
function makeClock(start) {
  const c = { now: start, seq: 0, timers: new Map() };
  c.setTimeout = (fn, ms, ...args) => { const id = ++c.seq; c.timers.set(id, { at: c.now + Math.max(0, +ms || 0), fn, args, every: 0 }); return id; };
  c.setInterval = (fn, ms, ...args) => { const id = ++c.seq; const every = Math.max(1, +ms || 0); c.timers.set(id, { at: c.now + every, fn, args, every }); return id; };
  c.clear = id => { c.timers.delete(id); };
  // Avanza el tiempo ejecutando en orden los temporizadores que vencen
  c.advance = ms => {
    const target = c.now + ms;
    for (;;) {
      let next = null, nid = 0;
      for (const [id, t] of c.timers) if (t.at <= target && (!next || t.at < next.at || (t.at === next.at && id < nid))) { next = t; nid = id; }
      if (!next) break;
      c.now = Math.max(c.now, next.at);
      if (next.every) { next.at += next.every; if (next.at <= c.now) next.at = c.now + next.every; } else c.timers.delete(nid);
      next.fn(...next.args);
    }
    c.now = target;
  };
  // Salta el tiempo SIN ejecutar temporizadores (simula la página congelada por el sistema)
  c.jump = ms => { c.now += ms; };
  return c;
}

/**
 * @param {object} [o]
 * @param {object|string} [o.stored]   contenido previo de localStorage (objeto o texto crudo)
 * @param {'granted'|'denied'|'default'} [o.permission='granted']
 * @param {boolean} [o.grantOnRequest=true]  respuesta a Notification.requestPermission()
 * @param {boolean} [o.notifications=true]   false = navegador sin API de notificaciones
 */
async function loadApp(o = {}) {
  const clock = makeClock(T0);
  const env = {
    clock, visibility: 'visible',
    permission: o.permission || 'granted', grantOnRequest: o.grantOnRequest !== false, permRequests: 0,
    notes: [], vibrations: [], oscillators: [], audios: [], errors: []
  };

  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/Not implemented/.test(e.message)) env.errors.push(e); });

  const dom = new JSDOM(HTML, {
    url: 'http://localhost/', runScripts: 'dangerously', virtualConsole: vc,
    beforeParse(win) {
      // tiempo
      const RealDate = win.Date;
      class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(clock.now); } static now() { return clock.now; } }
      win.Date = FakeDate;
      win.setTimeout = clock.setTimeout; win.clearTimeout = clock.clear;
      win.setInterval = clock.setInterval; win.clearInterval = clock.clear;
      win.requestAnimationFrame = fn => clock.setTimeout(fn, 16);
      win.scrollTo = () => {};
      win.Element.prototype.scrollIntoView = () => {};

      // almacenamiento
      win.localStorage.clear();
      if (o.stored !== undefined) win.localStorage.setItem(KEY, typeof o.stored === 'string' ? o.stored : JSON.stringify(o.stored));

      // visibilidad (pantalla bloqueada = 'hidden')
      Object.defineProperty(win.document, 'visibilityState', { get: () => env.visibility, configurable: true });
      Object.defineProperty(win.document, 'hidden', { get: () => env.visibility === 'hidden', configurable: true });

      // audio: Web Audio (pitidos) y <audio> (audio inaudible que mantiene viva la página)
      class FakeAudioContext {
        constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
        resume() { this.state = 'running'; return Promise.resolve(); }
        createOscillator() { const osc = { type: 'sine', frequency: { value: 0 }, connect: n => n, start() {}, stop() {} }; env.oscillators.push(osc); return osc; }
        createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: n => n }; }
        createDynamicsCompressor() { return { threshold: { value: 0 }, ratio: { value: 0 }, connect: n => n }; }
      }
      win.AudioContext = FakeAudioContext;
      win.Audio = class { constructor(src) { this.src = src; this.paused = true; this.loop = false; env.audios.push(this); }
        play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } };
      win.MediaMetadata = class { constructor(m) { Object.assign(this, m); } };
      win.URL.createObjectURL = () => 'blob:http://localhost/fake';
      win.URL.revokeObjectURL = () => {};

      // dispositivo
      const nav = win.navigator;
      const def = (k, v) => Object.defineProperty(nav, k, { value: v, configurable: true });
      def('vibrate', p => { env.vibrations.push(p); return true; });
      def('wakeLock', { request: async () => ({ release: async () => {}, addEventListener() {} }) });
      def('storage', { persisted: async () => true, persist: async () => true });
      def('mediaSession', { metadata: null });

      // notificaciones + service worker
      if (o.notifications !== false) {
        win.Notification = class { static get permission() { return env.permission; }
          static async requestPermission() { env.permRequests++; env.permission = env.grantOnRequest ? 'granted' : 'denied'; return env.permission; } };
        const reg = {
          showNotification: async (title, opts) => { env.notes.push({ title, opts, at: clock.now, closed: false, close() { this.closed = true; } }); },
          getNotifications: async ({ tag } = {}) => env.notes.filter(n => !n.closed && (!tag || n.opts.tag === tag))
        };
        def('serviceWorker', { ready: Promise.resolve(reg), controller: {}, register: async () => reg });
      }
    }
  });

  const win = dom.window, doc = win.document;
  const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };
  await flush();

  const app = {
    win, doc, env, clock, flush,
    get S() { return win.eval('S'); },
    eval: code => win.eval(code),
    $: s => doc.querySelector(s),
    text: s => (doc.querySelector(s) || {}).textContent || '',
    stored: () => JSON.parse(win.localStorage.getItem(KEY)),
    click(sel) {
      const el = typeof sel === 'string' ? doc.querySelector(sel) : sel;
      if (!el) throw new Error('No existe el elemento: ' + sel);
      el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      return el;
    },
    pointerdown(el = doc.body) { el.dispatchEvent(new win.Event('pointerdown', { bubbles: true, cancelable: true })); },
    async advance(ms) { clock.advance(ms); await flush(); },
    async setVisibility(v) { env.visibility = v; doc.dispatchEvent(new win.Event('visibilitychange')); await flush(); },
    // Empieza la sesión del día i (0 = Día 1) pulsando su botón en la pantalla de inicio
    async start(i = 0) { app.click(`[data-a="start"][data-id="${app.S.routine[i].id}"]`); await flush(); },
    async confirm() { app.click('[data-a="confirm"]'); await flush(); },
    beeps: () => env.oscillators.length / 6, // cada alarma = 6 pitidos
    close() {
      win.close();
      if (env.errors.length) throw env.errors[0];
    }
  };
  return app;
}

module.exports = { loadApp, ROOT, KEY, T0 };
