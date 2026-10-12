const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { organize } = require('../miniprogram/core/record-draft');
const members = [
  { id: 'grandma', name: '奶奶' },
  { id: 'daughter', name: '小芳' },
];
test('one sentence proposes member, relative date and activity without inventing or rewriting content', () => {
  const sentence = '昨天陪奶奶散步了半小时';
  const d = organize(sentence, members, '2026-01-01');
  assert.equal(d.date, '2025-12-31');
  assert.equal(d.subjectMemberId, 'grandma');
  assert.equal(d.category, '陪伴记录');
  assert.equal(d.content, sentence);
  assert.equal(organize('大前天小芳吃饭', members, '2026-01-01').date, '2025-12-29');
  assert.equal(organize('2026年10月9日奶奶午休', members, '2026-10-11').date, '2026-10-09');
});
test('ambiguous members, impossible dates and multiple dates get review hints, never silent certainty', () => {
  let d = organize('2月30日陪奶奶和小芳吃饭', members, '2026-10-11');
  assert.equal(d.date, '2026-10-11');
  assert.equal(d.subjectMemberId, '');
  assert.equal(d.category, '生活备忘');
  assert(d.notes.some((n) => n.includes('日期无效')));
  d = organize('昨天和今天都在聊天', members, '2026-10-11');
  assert(d.notes.some((n) => n.includes('多个日期')));
  assert.equal(d.subjectMemberId, '');
  assert.throws(() => organize('', members, '2026-10-11'));
  assert.throws(() => organize('a'.repeat(1001), members, '2026-10-11'));
});
