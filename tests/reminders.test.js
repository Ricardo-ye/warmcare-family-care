const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createReminders } = require('../miniprogram/lib/reminders');
const clone = (x) => JSON.parse(JSON.stringify(x));
const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture() {
  return {
    me: { id: 'me', role: 'guardian' },
    members: [
      { id: 'me', name: '女儿' },
      { id: 'elder', name: '妈妈' },
    ],
    messages: [
      {
        id: 'msg',
        senderId: 'elder',
        senderName: '妈妈',
        receivers: [{ memberId: 'me', seenAt: null }],
      },
    ],
    alerts: [],
  };
}
function setup(initial = fixture(), memory = new Map()) {
  let state = initial,
    interval,
    pendingModal;
  const calls = [],
    operations = [];
  const page = {
    route: 'pages/profile/index',
    data: { busy: false, recording: false },
    setData(d) {
      Object.assign(this.data, d);
    },
    onFamilySnapshot(s) {
      this.snapshot = clone(s);
    },
  };
  const wx = { getStorageSync: (k) => memory.get(k), setStorageSync: (k, v) => memory.set(k, v) };
  for (const method of [
    'setTabBarBadge',
    'removeTabBarBadge',
    'showToast',
    'vibrateShort',
    'navigateTo',
  ])
    wx[method] = (o) => {
      calls.push({ method, ...o });
      if (o.success) o.success({});
      if (o.complete) o.complete();
    };
  wx.showModal = (o) => {
    calls.push({ method: 'showModal', ...o });
    pendingModal = o;
  };
  const api = {
    wx,
    sound: {
      play() {
        calls.push({ method: 'sound.play' });
      },
      stop() {
        calls.push({ method: 'sound.stop' });
      },
    },
    request: async (op) => {
      operations.push(op);
      if (state instanceof Error) throw state;
      return clone(state);
    },
    currentPage: () => page,
    setInterval: (fn) => {
      interval = fn;
      return 1;
    },
    clearInterval: () => {
      interval = null;
    },
  };
  const r = createReminders(api);
  return {
    r,
    calls,
    operations,
    page,
    wx,
    memory,
    setState: (s) => (state = s),
    tick: () => interval && interval(),
    modal: () => pendingModal,
  };
}
test('foreground hints persist deduplication, badge remains until explicit receipt, and no writes occur', async () => {
  const f = setup();
  f.r.start();
  await flush();
  assert.equal(f.calls.filter((x) => x.method === 'showToast').length, 1);
  assert(f.calls.some((x) => x.method === 'setTabBarBadge' && x.index === 1 && x.text === '1'));
  await f.tick();
  assert.equal(f.calls.filter((x) => x.method === 'showToast').length, 1);
  assert(f.operations.every((x) => x === 'session'));
  const s = fixture();
  s.messages[0].receivers[0].seenAt = 'now';
  f.setState(s);
  await f.tick();
  assert(f.calls.some((x) => x.method === 'removeTabBarBadge' && x.index === 1));
  f.r.stop();
  const reopened = setup(fixture(), f.memory);
  reopened.r.start();
  await flush();
  assert.equal(reopened.calls.filter((x) => x.method === 'showToast').length, 0);
  reopened.r.stop();
});
test('SOS takes priority, modal does not acknowledge and repeat polls do not duplicate it', async () => {
  const s = fixture();
  s.alerts = [
    {
      id: 'sos',
      status: 'active',
      senderId: 'elder',
      senderName: '妈妈',
      receivers: [{ memberId: 'me' }],
    },
  ];
  const f = setup(s);
  f.r.start();
  await flush();
  assert.equal(f.calls.filter((x) => x.method === 'showModal').length, 1);
  assert.equal(f.calls.filter((x) => x.method === 'showToast').length, 0);
  await f.tick();
  assert.equal(f.calls.filter((x) => x.method === 'showModal').length, 1);
  f.modal().success({ confirm: true });
  f.modal().complete();
  assert(f.calls.some((x) => x.method === 'navigateTo'));
  assert(f.operations.every((x) => x === 'session'));
  f.r.stop();
});
test('recording defers hints while keeping badges; owner receives individual SOS confirmations', async () => {
  const f = setup();
  f.page.data.recording = true;
  f.r.start();
  await flush();
  assert(!f.calls.some((x) => x.method === 'showToast'));
  f.page.data.recording = false;
  await f.tick();
  assert(f.calls.some((x) => x.method === 'showToast'));
  f.r.stop();
  const s = fixture();
  s.me = { id: 'elder', role: 'elder' };
  s.messages = [];
  s.alerts = [
    {
      id: 'sos',
      status: 'active',
      senderId: 'elder',
      receivers: [{ memberId: 'me', confirmedAt: 'now' }],
    },
  ];
  const elder = setup(s);
  elder.r.start();
  await flush();
  assert(elder.calls.some((x) => x.method === 'showToast' && x.title === '女儿已确认收到求助'));
  assert(!elder.calls.some((x) => x.method === 'showModal'));
  elder.r.stop();
});
test('background stops polling; late responses and stale modal navigation are ignored', async () => {
  const f = setup();
  let resolve;
  f.wx.showToast = () => assert.fail('must not toast in background');
  const r = createReminders({
    wx: f.wx,
    request: () => new Promise((r) => (resolve = r)),
    currentPage: () => f.page,
    setInterval: () => 1,
    clearInterval: () => {},
  });
  r.start();
  r.stop();
  resolve(fixture());
  await flush();
  assert.equal(f.calls.length, 0);
  const s = fixture();
  s.alerts = [
    { id: 'sos', status: 'active', senderId: 'elder', senderName: '妈妈', receivers: [] },
  ];
  const modal = setup(s);
  modal.r.start();
  await flush();
  modal.r.stop();
  modal.modal().success({ confirm: true });
  assert(!modal.calls.some((x) => x.method === 'navigateTo'));
});
test('network failure retains truthful status, next successful poll clears it, self messages are silent', async () => {
  const f = setup(new Error('offline'));
  f.r.start();
  await flush();
  assert.match(f.page.data.reminderError, /暂未更新/);
  const s = fixture();
  s.messages[0].senderId = 'me';
  f.setState(s);
  await f.tick();
  assert.equal(f.page.data.reminderError, '');
  assert(!f.calls.some((x) => x.method === 'showToast'));
  f.r.stop();
});
test('failed notification display can retry; switching member does not reuse previous hint history', async () => {
  const f = setup();
  const original = f.wx.showToast;
  f.wx.showToast = (o) => o.fail();
  f.r.start();
  await flush();
  assert.equal(f.memory.size, 0);
  f.wx.showToast = original;
  await f.tick();
  assert.equal(f.calls.filter((x) => x.method === 'showToast').length, 1);
  const s = fixture();
  s.me.id = 'second';
  f.setState(s);
  await f.tick();
  assert.equal(f.calls.filter((x) => x.method === 'showToast').length, 2);
  f.r.stop();
});
test('sound plays once for a new foreground hint, avoids recording/playback, and stops in background', async () => {
  const f = setup();
  f.page.data.recording = true;
  f.r.start();
  await flush();
  assert(!f.calls.some((x) => x.method === 'sound.play'));
  f.page.data.recording = false;
  await f.tick();
  await f.tick();
  assert.equal(f.calls.filter((x) => x.method === 'sound.play').length, 1);
  const s = fixture();
  s.messages[0].id = 'next';
  f.setState(s);
  f.page.data.playingId = 'voice';
  await f.tick();
  assert.equal(f.calls.filter((x) => x.method === 'sound.play').length, 1);
  f.r.stop();
  assert.equal(f.calls.at(-1).method, 'sound.stop');
});
