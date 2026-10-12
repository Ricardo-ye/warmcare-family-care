const { test } = require('node:test');
const assert = require('node:assert/strict');
test('large inbox renders in batches and searches the complete visible message set', () => {
  let definition;
  global.Page = (d) => (definition = d);
  delete require.cache[require.resolve('../miniprogram/pages/messages/index')];
  require('../miniprogram/pages/messages/index');
  const page = {
    ...definition,
    data: { ...definition.data },
    setData(d) {
      Object.assign(this.data, d);
    },
  };
  page.data.session = {
    messages: Array.from({ length: 200 }, (_, i) => ({
      id: String(i),
      senderName: '家人',
      text: '记录' + i,
    })),
  };
  page.filterItems();
  assert.equal(page.data.items.length, 30);
  page.more();
  assert.equal(page.data.items.length, 60);
  page.search({ detail: { value: '记录199' } });
  assert.deepEqual(
    page.data.items.map((m) => m.id),
    ['199'],
  );
  assert.equal(page.data.hasMore, false);
});
test('inbox filters and foreground refresh preserve the composer draft and selected elder identity', () => {
  let definition;
  global.Page = (d) => (definition = d);
  global.wx = { pageScrollTo: () => {} };
  delete require.cache[require.resolve('../miniprogram/pages/messages/index')];
  require('../miniprogram/pages/messages/index');
  const page = {
    ...definition,
    data: { ...definition.data },
    setData(d) {
      Object.assign(this.data, d);
    },
  };
  const session = {
    notebook: {
      elders: [
        { id: 'a', name: '长辈甲' },
        { id: 'b', name: '长辈乙' },
      ],
    },
    messages: [
      { id: 'incoming', unread: true, mine: false },
      { id: 'sent', unread: false, mine: true },
    ],
  };
  page.applySession(session);
  assert.equal(page.data.composing, false);
  page.filter({ currentTarget: { dataset: { filter: 'unread' } } });
  assert.deepEqual(
    page.data.items.map((m) => m.id),
    ['incoming'],
  );
  page.compose();
  page.setData({ text: '未发送的草稿', elderIndex: 2, draftPath: 'local.mp3' });
  page.applySession({
    ...session,
    notebook: { elders: [session.notebook.elders[1], session.notebook.elders[0]] },
  });
  assert.equal(page.data.elderIndex, 1);
  assert.equal(page.data.text, '未发送的草稿');
  assert.equal(page.data.draftPath, 'local.mp3');
  assert.equal(page.data.composing, true);
  page.backToMessages();
  assert.equal(page.data.composing, false);
  assert.equal(page.data.text, '未发送的草稿');
});
test('old backend cannot silently widen a directed message into a family message', async () => {
  let definition;
  global.Page = (d) => (definition = d);
  global.wx = { stopPullDownRefresh: () => {} };
  delete require.cache[require.resolve('../miniprogram/pages/messages/index')];
  require('../miniprogram/pages/messages/index');
  const page = {
    ...definition,
    data: {
      ...definition.data,
      session: {},
      text: '只给一位家人',
      audience: 'members',
      recipientIds: ['chosen'],
    },
    setData(d) {
      Object.assign(this.data, d);
    },
  };
  await page.send();
  assert.match(page.data.error, /云端尚未更新接收范围/);
  assert.equal(page.data.text, '只给一位家人');
});
