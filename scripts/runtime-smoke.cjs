// Node 16 compatible; uses installed SDK loading + fake database, never cloud network.
const assert = require('assert').strict;
const sdk = require('../cloudfunctions/warmcare/node_modules/wx-server-sdk');
const fs = require('fs'),
  vm = require('vm'),
  path = require('path');
assert.equal(typeof sdk.database, 'function');
let state,
  who = 'owner';
const clone = (s) => s && JSON.parse(JSON.stringify(s));
const doc = {
  get: async () => ({ data: clone(state) }),
  set: async ({ data }) => {
    state = clone(data);
  },
};
const db = { collection: () => ({ doc: () => doc }), runTransaction: async (fn) => fn(db) };
const fakeSdk = {
  init() {},
  DYNAMIC_CURRENT_ENV: 'test',
  database: () => db,
  getWXContext: () => ({ OPENID: who, APPID: 'wxtestfixtureappid' }),
};
const exportsObject = {};
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../cloudfunctions/warmcare/index.js'), 'utf8'),
  {
    exports: exportsObject,
    require: (n) => (n === 'wx-server-sdk' ? fakeSdk : require(n)),
    process: { env: { OWNER_OPENID: 'owner', APPID: 'wxtestfixtureappid' } },
    console,
    Buffer,
    setTimeout,
    clearTimeout,
  },
);
let seq = 0;
const call = (operation, payload = {}) =>
  exportsObject.main({ operation, payload, requestId: 'runtime-smoke-operation-' + ++seq });
(async () => {
  assert((await call('family.create', { role: 'elder', name: 'test elder' })).ok);
  const inv = await call('family.invite', { role: 'guardian' });
  assert(inv.ok);
  who = 'child';
  assert((await call('family.join', { name: 'test child', token: inv.data.token })).ok);
  assert((await call('message.send', { audience: 'family', text: 'local only' })).ok);
  who = 'owner';
  const sos = await call('sos.raise');
  assert(sos.ok);
  who = 'child';
  assert((await call('sos.ack', { id: sos.data.id })).ok);
  assert((await call('sos.close', { id: sos.data.id })).ok);
  const session = await call('session');
  assert(session.ok);
  assert(session.data.capabilities.includes('departed-cleanup'));
  console.log(
    'PASS runtime ' +
      process.version +
      ': real SDK loads; generated entry with isolated DB handles membership, messages, SOS. No network operations.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
