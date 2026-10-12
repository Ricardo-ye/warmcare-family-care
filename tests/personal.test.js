const { test } = require('node:test');
const assert = require('node:assert/strict');
const d = require('../miniprogram/core/personal');
let counter = 0;
const action = (type, payload) => ({
  id: 'test-operation-' + String(++counter).padStart(6, '0'),
  type,
  payload,
});
function family() {
  const a = action('elder.save', { name: '奶奶', relation: '祖母', note: '喜欢散步' });
  return { state: d.apply(d.empty(), a), id: a.id };
}
test('starts empty; editing and deletion preserve unrelated elder and cascade associated records', () => {
  let { state, id } = family();
  const second = action('elder.save', { name: '爷爷' });
  state = d.apply(state, second);
  state = d.apply(
    state,
    action('record.save', {
      elderId: id,
      date: '2026-10-10',
      category: '生活备忘',
      content: '今天整理衣物',
    }),
  );
  state = d.apply(
    state,
    action('todo.save', { elderId: id, date: '2026-10-11', title: '一起散步' }),
  );
  state = d.apply(state, action('elder.save', { id, name: '奶奶', note: '喜欢看书' }));
  assert.equal(state.records.length, 1);
  state = d.apply(state, action('elder.delete', { id }));
  assert.equal(state.elders[0].id, second.id);
  assert.equal(state.records.length, 0);
  assert.equal(state.todos.length, 0);
});
test('repeated operation is idempotent and conflicting reuse is rejected', () => {
  const a = action('elder.save', { name: '奶奶' }),
    s = d.apply(d.empty(), a);
  assert.deepEqual(d.apply(s, a), s);
  assert.throws(() => d.apply(s, { ...a, payload: { name: '不同内容' } }), /重复/);
});
test('deleted content is not retained in retry receipts and clear removes all records', () => {
  let { state, id } = family();
  state = d.apply(state, action('elder.delete', { id }));
  assert(!JSON.stringify(state).includes('喜欢散步'));
  state = d.apply(state, action('clear', { confirm: 'CLEAR_MY_RECORDS' }));
  assert.deepEqual(state.elders, []);
  assert.equal(state.receipts.length, 1);
  assert.throws(() => d.apply(state, action('clear', {})), /确认/);
});
test('validates dates, required content and elder relationships without mutating state', () => {
  const { state, id } = family(),
    before = JSON.stringify(state);
  for (const date of ['2026-02-29', '2026-13-10', 'abc'])
    assert.throws(
      () =>
        d.apply(
          state,
          action('record.save', { elderId: id, date, category: '生活备忘', content: '日常' }),
        ),
      /日期/,
    );
  assert.throws(
    () =>
      d.apply(
        state,
        action('todo.save', { elderId: 'missing', date: '2026-10-10', title: '日常' }),
      ),
    /长辈/,
  );
  assert.throws(() => d.apply(state, action('elder.save', { name: '   ' })), /称呼/);
  assert.equal(JSON.stringify(state), before);
  assert.equal(d.date('2028-02-29'), '2028-02-29');
});
test('record edits retain identity; todo completion is explicit and reversible', () => {
  let { state, id } = family();
  const r = action('record.save', {
    elderId: id,
    date: '2026-10-10',
    category: '陪伴记录',
    content: '散步',
  });
  state = d.apply(state, r);
  state = d.apply(state, action('record.save', { ...r.payload, id: r.id, content: '一起散步' }));
  assert.equal(state.records.length, 1);
  assert.equal(state.records[0].content, '一起散步');
  const t = action('todo.save', { elderId: id, date: '2026-10-11', title: '收衣物' });
  state = d.apply(state, t);
  for (let i = 0; i < 2; i++) state = d.apply(state, action('todo.set', { id: t.id, done: true }));
  assert.equal(state.todos[0].done, true);
  state = d.apply(state, action('todo.set', { id: t.id, done: false }));
  assert.equal(state.todos[0].done, false);
});
test('rejects business operations and excessive content', () => {
  const { state } = family();
  assert.throws(() => d.apply(state, action('book', {})), /不支持/);
  assert.throws(() => d.apply(state, action('elder.save', { name: '名'.repeat(31) })), /称呼/);
});
