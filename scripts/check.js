const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((x) => !['node_modules', 'artifacts', '.git'].includes(x.name))
    .flatMap((x) => (x.isDirectory() ? walk(path.join(dir, x.name)) : [path.join(dir, x.name)]));
}
const all = walk(root);
for (const file of all) {
  if (file.endsWith('.json')) JSON.parse(fs.readFileSync(file, 'utf8'));
  if (file.endsWith('.js')) new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
}
const app = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'));
global.wx = {};
global.getApp = () => ({ globalData: { large: false } });
global.Page = (x) => {
  global.definition = x;
};
for (const p of app.pages) {
  for (const ext of ['js', 'json', 'wxml', 'wxss'])
    assert(fs.existsSync(path.join(root, 'miniprogram', p + '.' + ext)), p + '.' + ext);
  require(path.join(root, 'miniprogram', p + '.js'));
  const wxml = fs.readFileSync(path.join(root, 'miniprogram', p + '.wxml'), 'utf8');
  for (const m of wxml.matchAll(/bind(?:tap|input|change)="([\w]+)"/g))
    assert.equal(typeof global.definition[m[1]], 'function', p + ' ' + m[1]);
}
for (const tab of app.tabBar.list)
  for (const key of ['iconPath', 'selectedIconPath'])
    assert(fs.existsSync(path.join(root, 'miniprogram', tab[key])));
assert.deepEqual(
  app.pages.map((p) => p.split('/')[1]),
  [
    'login',
    'home',
    'messages',
    'family',
    'sos',
    'records',
    'todos',
    'elders',
    'profile',
    'privacy',
  ],
);
for (const file of all.filter((x) => x.endsWith('.wxml')))
  assert(
    !/wx:(?:if|elif)="(?!\{\{)/.test(fs.readFileSync(file, 'utf8')),
    'Unbound condition: ' + file,
  );
for (const retired of ['booking', 'orders', 'order', 'admin', 'editor'])
  assert(!fs.existsSync(path.join(root, 'miniprogram/pages', retired)), 'Retired page: ' + retired);
assert.equal(
  fs.readFileSync(path.join(root, 'miniprogram/core/personal.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'cloudfunctions/warmcare/lib/personal.js'), 'utf8'),
  'Run npm run prepare:cloud',
);
require('../cloudfunctions/warmcare/lib/family');
console.log(
  'PASS: JS/JSON syntax, ' +
    app.pages.length +
    ' native pages, event handlers, bound conditions, assets, private family routes and shared backend rules.',
);
