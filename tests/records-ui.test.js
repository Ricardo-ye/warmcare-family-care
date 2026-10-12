const { test } = require('node:test'),
  assert = require('node:assert/strict');
test('record composer builds family choices with native Page.options present and preserves draft through snapshots', () => {
  let definition;
  global.Page = (d) => (definition = d);
  global.wx = { pageScrollTo: () => {} };
  require('../miniprogram/pages/records/index');
  const page = {
    ...definition,
    options: {},
    data: structuredClone(definition.data),
    setData(d) {
      Object.assign(this.data, d);
    },
  };
  const s = {
    me: { id: 'elder', role: 'elder' },
    members: [
      { id: 'elder', name: '奶奶' },
      { id: 'child', name: '女儿' },
    ],
    capabilities: ['family-records'],
    notebook: { elders: [], records: [] },
    familyRecords: [],
  };
  page.applySession(s);
  page.create();
  assert.equal(page.data.subjectOptions.length, 3);
  page.setData({ content: '昨天陪女儿散步' });
  page.organize();
  assert.equal(page.data.subjectOptions[page.data.subjectIndex].id, 'child');
  assert(page.data.draftReady);
  page.applySession({ ...s, members: [...s.members].reverse() });
  assert.equal(page.data.subjectOptions[page.data.subjectIndex].id, 'child');
  assert.equal(page.data.content, '昨天陪女儿散步');
  page.back();
  page.create();
  assert.equal(page.data.content, '昨天陪女儿散步');
});
