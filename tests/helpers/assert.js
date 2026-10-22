// assert/strict, pero deepEqual copia antes los valores al contexto de Node: los objetos que
// vienen de la página (jsdom) tienen otro Array/Object y la comparación estricta fallaría.
'use strict';
const strict = require('node:assert/strict');

const plain = v => structuredClone(v);
module.exports = Object.assign((...a) => strict(...a), strict, {
  deepEqual: (a, b, msg) => strict.deepEqual(plain(a), plain(b), msg)
});
