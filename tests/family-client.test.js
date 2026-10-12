const { test } = require('node:test');
const assert = require('node:assert/strict');
test('failed family mutation retries original request ID and never uses local notebook fallback', async () => {
  const memory = new Map(),
    calls = [];
  let fail = true;
  global.wx = {
    getStorageSync: (k) => memory.get(k),
    setStorageSync: (k, v) => memory.set(k, v),
    removeStorageSync: (k) => memory.delete(k),
    cloud: {
      callFunction: async ({ data }) => {
        calls.push(data);
        if (fail) throw Error('offline');
        return { result: { ok: true, data: { id: 'message-1' } } };
      },
    },
  };
  delete require.cache[require.resolve('../miniprogram/lib/family')];
  const api = require('../miniprogram/lib/family');
  await assert.rejects(api.act('message.send', { text: '你好' }), /未能连接/);
  assert(memory.has('nxh.family.pending'));
  fail = false;
  await api.act('message.send', { text: '你好' });
  assert.equal(calls[0].requestId, calls[1].requestId);
  assert.equal(memory.has('nxh.family.pending'), false);
  assert.equal(memory.has('nxh.personal.v1'), false);
});
