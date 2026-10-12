const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFamilyService } = require('../cloudfunctions/warmcare/lib/family');
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
test('cloud trusted identity, owner enrollment and single-use invitations reject spoofing', async () => {
  const f = setup();
  assert.equal(
    (
      await f.raw(
        { OPENID: 'founder', APPID: 'foreign' },
        event('family.create', { role: 'elder', name: 'x' }),
      )
    ).ok,
    false,
  );
  assert.equal(
    (await f.call('stranger', 'family.create', { role: 'guardian', name: 'x', owner: 'founder' }))
      .ok,
    false,
  );
  await f.call('founder', 'family.create', { role: 'elder', name: '妈妈' });
  const inv = await f.call('founder', 'family.invite', { role: 'guardian' });
  assert.equal(
    (
      await f.call('daughter', 'family.join', {
        token: inv.data.token,
        name: '女儿',
        role: 'elder',
      })
    ).ok,
    true,
  );
  assert.equal((await f.call('daughter', 'session')).data.me.role, 'guardian');
  assert.equal(
    (await f.call('stranger', 'family.join', { token: inv.data.token, name: '外人' })).ok,
    false,
  );
  assert.equal((await f.call('stranger', 'session')).data.me, null);
});
test('owner not configured fails closed and identity reveals caller only', async () => {
  const f = setup({ owner: '' });
  assert.equal((await f.call('x', 'session')).ok, false);
  assert.deepEqual((await f.call('x', 'identity')).data, {
    openid: 'x',
    isOwner: false,
    configured: false,
  });
});
test('one elder SOS reaches multiple family members; no templates cannot look delivered; distinct acknowledgements', async () => {
  const f = await started();
  await joined(f, 'daughter');
  await joined(f, 'son');
  const raised = await f.call('founder', 'sos.raise');
  assert.equal(raised.ok, true);
  let s = (await f.call('founder', 'session')).data;
  assert.equal(s.alerts[0].receivers.length, 2);
  assert(s.alerts[0].receivers.every((r) => r.status === 'unconfigured' && !r.confirmedAt));
  const repeated = await f.call('founder', 'sos.raise');
  assert.equal(repeated.data.id, raised.data.id);
  await Promise.all([
    f.call('daughter', 'sos.ack', { id: raised.data.id }),
    f.call('son', 'sos.ack', { id: raised.data.id }),
  ]);
  s = (await f.call('founder', 'session')).data;
  assert.equal(s.alerts[0].receivers.filter((r) => r.confirmedAt).length, 2);
  await f.call('daughter', 'sos.close', { id: raised.data.id });
  assert.equal((await f.call('founder', 'session')).data.alerts[0].status, 'closed');
});
test('provider success is submitted, never read; unsubscribed and failures are explicit', async () => {
  const f = await started('elder', { templateId: 'test', templateFields: { thing1: 'title' } });
  await joined(f, 'daughter');
  await joined(f, 'son');
  f.io.notify = async (who) => {
    if (who === 'son') throw { errCode: 43101 };
  };
  await f.call('founder', 'sos.raise');
  const a = (await f.call('founder', 'session')).data.alerts[0];
  assert.deepEqual(a.receivers.map((r) => r.status).sort(), ['notSubscribed', 'submitted']);
  assert(a.receivers.every((r) => !r.seenAt && !r.confirmedAt));
});
test('private notes isolate elders; guarded role cannot be escalated through payload', async () => {
  const f = await started();
  await joined(f, 'daughter');
  await joined(f, 'father', 'elder');
  const first = (await f.call('founder', 'session')).data.me.elderId;
  await f.call('founder', 'notebook.apply', {
    action: {
      type: 'record.save',
      payload: { elderId: first, date: '2026-10-10', category: '生活备忘', content: '本人记录' },
    },
  });
  assert.equal((await f.call('father', 'session')).data.notebook.records.length, 0);
  assert.equal(
    (
      await f.call('father', 'notebook.apply', {
        role: 'guardian',
        action: {
          type: 'record.save',
          payload: { elderId: first, date: '2026-10-10', category: '生活备忘', content: '伪造' },
        },
      })
    ).ok,
    false,
  );
  assert(!JSON.stringify((await f.call('daughter', 'session')).data).includes('openid'));
});
test('message persistence, lost-response retry, acknowledgement, and author-only deletion', async () => {
  const f = await started();
  await joined(f, 'daughter');
  const req = event('message.send', { text: '请回电话', important: true });
  const first = await f.call('founder', req);
  assert.equal((await f.call('founder', req)).data.id, first.data.id);
  assert.equal((await f.call('founder', 'session')).data.messages.length, 1);
  await f.call('daughter', 'message.ack', { id: first.data.id });
  assert((await f.call('founder', 'session')).data.messages[0].receivers[0].confirmedAt);
  assert.equal((await f.call('daughter', 'message.remove', { id: first.data.id })).ok, false);
  await f.call('founder', 'message.remove', { id: first.data.id });
  assert.equal((await f.call('daughter', 'session')).data.messages.length, 0);
});
test('private voice uploads, playback scope, removal and revoked membership', async () => {
  const f = await started();
  const daughter = await joined(f, 'daughter');
  const base64 = Buffer.from('ID3' + 'audio'.repeat(20)).toString('base64');
  const media = (await f.call('founder', 'media.upload', { base64, duration: 3 })).data;
  assert(media);
  assert.equal((await f.call('daughter', 'media.get', { id: media.id })).ok, false);
  const msg = await f.call('founder', 'message.send', { mediaId: media.id });
  assert.equal((await f.call('daughter', 'media.get', { id: media.id })).data.base64, base64);
  await f.call('founder', 'family.remove', { id: daughter });
  assert.equal((await f.call('daughter', 'media.get', { id: media.id })).ok, false);
  await f.call('founder', 'message.remove', { id: msg.data.id });
  assert.equal(f.files.size, 0);
});
test('existing elder profile can be bound by invitation and cannot be deleted while bound', async () => {
  const f = await started('guardian');
  const req = event('notebook.apply', {
    action: { type: 'elder.save', payload: { name: '爸爸' } },
  });
  await f.call('founder', req);
  const id = (await f.call('founder', 'session')).data.notebook.elders[0].id;
  await joined(f, 'father', 'elder', 'founder', id);
  assert.equal((await f.call('father', 'session')).data.me.elderId, id);
  assert.equal(
    (
      await f.call('founder', 'notebook.apply', {
        action: { type: 'elder.delete', payload: { id } },
      })
    ).ok,
    false,
  );
});
test('forbidden legacy routes and unbound writes never modify family state', async () => {
  const f = await started();
  const before = await f.store.read();
  for (const op of ['book', 'admin.list', 'initialize', 'sos.ack', 'message.send', 'family.invite'])
    assert.equal((await f.call('outsider', op, { text: 'x' })).ok, false);
  assert.deepEqual(await f.store.read(), before);
});

test('elders can address all family or chosen members; direct text, voice and receipts are private even from owner', async () => {
  const f = await started('guardian');
  await joined(f, 'mother', 'elder');
  await joined(f, 'father', 'elder');
  const daughter = await joined(f, 'daughter');
  const media = (
    await f.call('mother', 'media.upload', {
      base64: Buffer.from('ID3' + 'audio'.repeat(20)).toString('base64'),
      duration: 3,
    })
  ).data;
  const sent = await f.call('mother', 'message.send', {
    audience: 'members',
    recipientIds: [daughter],
    text: '只给女儿',
    mediaId: media.id,
    important: true,
  });
  assert.equal(sent.ok, true);
  assert.equal((await f.call('daughter', 'session')).data.messages.length, 1);
  assert.equal((await f.call('founder', 'session')).data.messages.length, 0);
  assert.equal((await f.call('father', 'session')).data.messages.length, 0);
  assert.equal((await f.call('founder', 'media.get', { id: media.id })).ok, false);
  assert.equal((await f.call('founder', 'message.ack', { id: sent.data.id })).ok, false);
  assert.equal((await f.call('daughter', 'media.get', { id: media.id })).ok, true);
  await f.call('daughter', 'message.ack', { id: sent.data.id });
  assert((await f.call('mother', 'session')).data.messages[0].receivers[0].confirmedAt);
  await f.call('mother', 'message.send', { audience: 'family', text: '给全家' });
  assert.equal((await f.call('father', 'session')).data.messages.length, 1);
  assert.equal(
    (
      await f.call('mother', 'message.send', {
        audience: 'members',
        recipientIds: ['fake'],
        text: '越权',
      })
    ).ok,
    false,
  );
  assert.equal(
    (
      await f.call('mother', 'message.send', {
        audience: 'members',
        recipientIds: [],
        text: '空接收人',
      })
    ).ok,
    false,
  );
  await f.call('founder', 'family.remove', { id: daughter });
  assert.equal((await f.call('daughter', 'media.get', { id: media.id })).ok, false);
});

test('new family records can reference guardians; only author edits; legacy elder privacy remains unchanged', async () => {
  const f = await started('guardian');
  const mother = await joined(f, 'mother', 'elder');
  await joined(f, 'father', 'elder');
  const owner = (await f.call('founder', 'session')).data.me.id;
  const p = {
    subjectMemberId: owner,
    date: '2026-10-11',
    category: '陪伴记录',
    content: '给家人准备午饭',
  };
  const saved = await f.call('mother', 'record.save', p);
  assert.equal(saved.ok, true);
  const visible = (await f.call('father', 'session')).data.familyRecords;
  assert.equal(visible.length, 1);
  assert.equal(visible[0].canEdit, false);
  assert.equal(visible[0].subjectMemberId, owner);
  assert.equal((await f.call('founder', 'record.save', { ...p, id: saved.data.id })).ok, false);
  assert.equal((await f.call('father', 'record.delete', { id: saved.data.id })).ok, false);
  assert.equal(
    (await f.call('mother', 'record.save', { ...p, id: saved.data.id, subjectMemberId: '' })).ok,
    true,
  );
  const elderId = (await f.call('mother', 'session')).data.me.elderId;
  await f.call('mother', 'notebook.apply', {
    action: {
      type: 'record.save',
      payload: { elderId, date: '2026-10-11', category: '生活备忘', content: '原范围' },
    },
  });
  assert.equal((await f.call('father', 'session')).data.notebook.records.length, 0);
  assert.equal((await f.call('mother', 'record.save', { ...p, date: '2026-02-30' })).ok, false);
  await f.call('mother', 'record.delete', { id: saved.data.id });
  assert.equal((await f.call('founder', 'session')).data.familyRecords.length, 0);
  assert.equal((await f.call('stranger', 'record.save', p)).ok, false);
  assert(mother);
});

test('members list exposes no invite secrets; owner removal and scoped invitation revocation are enforced', async () => {
  const f = await started();
  const son = await joined(f, 'son');
  await joined(f, 'daughter');
  await f.call('son', 'family.invite', { role: 'guardian' });
  const mine = (await f.call('son', 'session')).data.pendingInvites;
  assert.equal(mine.length, 1);
  assert(!JSON.stringify(mine).includes('hash'));
  assert(!JSON.stringify(mine).includes('token'));
  assert.equal((await f.call('daughter', 'family.revokeInvite', { id: mine[0].id })).ok, false);
  assert.equal((await f.call('son', 'family.revokeInvite', { id: mine[0].id })).ok, true);
  assert.equal((await f.call('daughter', 'family.remove', { id: son })).ok, false);
  const founder = (await f.call('founder', 'session')).data.me.id;
  assert.equal((await f.call('founder', 'family.remove', { id: founder })).ok, false);
  await f.call('son', 'family.invite', { role: 'guardian' });
  await f.call('founder', 'family.remove', { id: son });
  assert.equal((await f.call('founder', 'session')).data.pendingInvites.length, 0);
});
