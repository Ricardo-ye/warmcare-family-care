const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
assert.equal(
  fs.readFileSync(path.join(root, 'cloudfunctions/warmcare/index.js'), 'utf8'),
  require('./bundle-source')(root),
  'Cloud bundle stale: run npm run prepare:cloud',
);
console.log('PASS: generated cloud bundle matches source and has no relative runtime dependency.');
