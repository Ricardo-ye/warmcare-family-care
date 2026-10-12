const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm');
test('actual deployed single-file entry works without a lib directory and fails closed for missing owner', async () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../cloudfunctions/warmcare/index.js'),
    'utf8',
  );
  assert(!/require\(['"]\.\//.test(source), 'Runtime must not require deployment subdirectories');
  const exports = {};
  const sdk = {
    init() {},
    DYNAMIC_CURRENT_ENV: 'current',
    database() {
      return {};
    },
    getWXContext() {
      return { OPENID: 'real-caller-fixture', APPID: 'wxtestfixtureappid' };
    },
  };
  vm.runInNewContext(source, {
    exports,
    require: (n) => {
      if (n === 'wx-server-sdk') return sdk;
      if (n === 'crypto') return require('node:crypto');
      throw new Error('Unexpected runtime dependency ' + n);
    },
    process: { env: { APPID: 'wxtestfixtureappid' } },
    Buffer,
    setTimeout,
    clearTimeout,
  });
  const identity = await exports.main({ operation: 'identity' });
  assert.equal(identity.ok, true);
  assert.equal(identity.data.openid, 'real-caller-fixture');
  assert.equal(identity.data.configured, false);
  const session = await exports.main({ operation: 'session' });
  assert.equal(session.ok, false);
  assert.match(session.error.message, /OWNER_OPENID/);
});
