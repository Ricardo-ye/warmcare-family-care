const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { started } = require('./helpers/family-fixture');
test('F05: failing device cleanup does not retain private views on other pages', () => {
  const { clearPrivatePages } = require('../miniprogram/lib/session');
  const pages = [0, 1].map(() => ({
    state: { private: true },
    data: { session: {}, latest: { text: 'private' } },
    onSessionInvalidated() {
      throw new Error('device stopped');
    },
    setData(data) {
      Object.assign(this.data, data);
    },
  }));
  clearPrivatePages(pages);
  for (const page of pages) {
    assert.equal(page.state, null);
    assert.equal(page.data.session, null);
    assert.equal(page.data.latest, null);
  }
});
test('F04: committed write + failed refresh retries only the read, never creates another todo', async () => {
  const f = await started();
  const memory = new Map();
  let failRead = true,
    writes = 0;
  global.wx = {
    getStorageSync: (k) => memory.get(k),
    setStorageSync: (k, v) => memory.set(k, v),
    removeStorageSync: (k) => memory.delete(k),
    cloud: {
      callFunction: async ({ data }) => {
        if (data.operation === 'session' && failRead) {
          failRead = false;
          throw Error('read failed');
        }
        if (data.operation === 'notebook.apply') writes++;
        return { result: await f.raw({ OPENID: 'founder', APPID: 'app-test' }, data) };
      },
    },
  };
  const api = require('../miniprogram/lib/api');
  const elderId = (await f.store.read()).members[0].elderId,
    p = { elderId, title: 'one', date: '2026-10-11' };
  await assert.rejects(
    api.dispatch('todo.save', p),
    (e) => e.committed && e.code === 'COMMITTED_REFRESH_FAILED',
  );
  await api.dispatch('todo.save', p);
  assert.equal(writes, 1);
  assert.equal((await f.store.read()).notebook.todos.length, 1);
});
test('F04: page clears successful form and blocks another save until reload', async () => {
  global.wx = { stopPullDownRefresh() {} };
  const ui = require('../miniprogram/lib/ui');
  const p = {
    data: { title: 'old' },
    setData(d) {
      Object.assign(this.data, d);
    },
    reset() {
      this.data.title = '';
    },
  };
  await ui.run(p, async () => {
    throw Object.assign(new Error('saved; reload failed'), { committed: true });
  });
  assert.equal(p.data.title, '');
  assert.equal(p.data.refreshRequired, true);
});
test('pending operation IDs survive an intervening different operation without storing private payloads', async () => {
  const memory = new Map(),
    calls = [];
  let lost = true;
  global.wx = {
    getStorageSync: (k) => memory.get(k),
    setStorageSync: (k, v) => memory.set(k, v),
    removeStorageSync: (k) => memory.delete(k),
    cloud: {
      callFunction: async ({ data }) => {
        calls.push(data);
        if (data.payload.text === 'secret-a' && lost) throw Error('lost response');
        return { result: { ok: true, data: {} } };
      },
    },
  };
  const family = require('../miniprogram/lib/family');
  await assert.rejects(family.act('message.send', { text: 'secret-a' }));
  assert(!JSON.stringify([...memory.values()]).includes('secret-a'));
  await family.act('message.send', { text: 'b' });
  lost = false;
  await family.act('message.send', { text: 'secret-a' });
  assert.equal(calls[0].requestId, calls[2].requestId);
});
test('F05: revoked foreground session clears views even during recording and navigates away', async () => {
  const { createReminders } = require('../miniprogram/lib/reminders');
  let stopped = 0,
    navigated = 0;
  const page = {
    route: 'pages/messages/index',
    data: { session: { me: { id: 'removed' } }, recording: true, text: 'private', items: [1] },
    setData(d) {
      Object.assign(this.data, d);
    },
    onSessionInvalidated() {
      stopped++;
    },
  };
  const r = createReminders({
    wx: {
      reLaunch() {
        navigated++;
      },
    },
    request: async () => ({ me: null, exists: true }),
    currentPage: () => page,
    setInterval: () => 1,
    clearInterval() {},
  });
  r.start();
  await new Promise(setImmediate);
  r.stop();
  assert.equal(page.data.session, null);
  assert.equal(page.data.text, '');
  assert.deepEqual(page.data.items, []);
  assert.equal(stopped, 1);
  assert.equal(navigated, 1);
});
