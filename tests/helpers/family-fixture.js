const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFamilyService } = require('../../cloudfunctions/warmcare/lib/family');
let seq = 0;
const event = (operation, payload = {}) => ({
  operation,
  payload,
  requestId: 'family-test-operation-' + String(++seq).padStart(8, '0'),
});
function setup(config = {}) {
  let state = null,
    queue = Promise.resolve();
  const files = new Map(),
    notified = [];
  const clone = (s) => s && JSON.parse(JSON.stringify(s));
  const store = {
    read: async () => clone(state),
    transaction: (fn) => {
      const run = async () => {
        let draft = clone(state);
        const r = await fn({
          read: async () => clone(draft),
          write: async (s) => {
            draft = clone(s);
          },
        });
        state = draft;
        return r;
      };
      const r = queue.then(run, run);
      queue = r.catch(() => {});
      return r;
    },
  };
  const io = {
    upload: async (b) => {
      const id = 'file-' + ++seq;
      files.set(id, b);
      return id;
    },
    download: async (id) => files.get(id),
    delete: async (id) => files.delete(id),
    notify: async (openid, notice) => notified.push({ openid, notice }),
  };
  const service = createFamilyService(
    store,
    { owner: 'founder', appid: 'app-test', ...config },
    io,
  );
  return {
    store,
    files,
    notified,
    io,
    raw: service,
    call: (who, op, p = {}) =>
      service({ OPENID: who, APPID: 'app-test' }, typeof op === 'string' ? event(op, p) : op),
  };
}
async function joined(f, who, role = 'guardian', by = 'founder', elderId) {
  const inv = await f.call(by, 'family.invite', { role, elderId });
  assert.equal(inv.ok, true, JSON.stringify(inv));
  const r = await f.call(who, 'family.join', { token: inv.data.token, name: who });
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.data.memberId;
}
async function started(role = 'elder', config = {}) {
  const f = setup(config);
  assert.equal((await f.call('founder', 'family.create', { role, name: '妈妈' })).ok, true);
  return f;
}

module.exports = { setup, started, joined, event };
