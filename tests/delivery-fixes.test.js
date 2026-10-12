const { test } = require('node:test');
const assert = require('node:assert/strict');
const { started, joined, event } = require('./helpers/family-fixture');
const bytes = (s) => Buffer.byteLength(JSON.stringify(s));
const voice = () => ({
  base64: Buffer.from('ID3' + 'audio'.repeat(20)).toString('base64'),
  duration: 3,
});
test('notification transaction retry does not reuse a recipient from an aborted claim', async () => {
  const f = await started('elder', { templateId: 'test', templateFields: { thing1: 'title' } });
  await joined(f, 'child');
  const transaction = f.store.transaction;
  let retried = false;
  f.store.transaction = async (fn) => {
    const state = await f.store.read();
    if (!retried && state.messages.some((m) => m.receivers.some((r) => r.status === 'pending'))) {
      retried = true;
      // Execute and discard the first attempt, then simulate another worker winning the claim.
      await fn({ read: async () => structuredClone(state), write: async () => {} });
      await transaction(async (tx) => {
        const current = await tx.read();
        current.messages[0].receivers[0].status = 'sending';
        await tx.write(current);
      });
    }
    return transaction(fn);
  };
  assert(
    (await f.call('founder', 'message.send', { audience: 'family', text: 'test', important: true }))
      .ok,
  );
  assert(retried);
  assert.equal(f.notified.length, 0);
});
test('notification failure logs a safe status and preserves the saved message', async () => {
  const f = await started('elder', { templateId: 'test', templateFields: { thing1: 'title' } });
  await joined(f, 'child');
  const logs = [];
  f.io.log = (x) => logs.push(x);
  f.io.notify = async () => {
    throw Error('private provider error');
  };
  assert(
    (
      await f.call('founder', 'message.send', {
        audience: 'family',
        text: 'private body',
        important: true,
      })
    ).ok,
  );
  assert.equal((await f.store.read()).messages[0].receivers[0].status, 'failed');
  assert(logs.some((x) => x.stage === 'notify' && x.code === 'FAILED'));
  assert(!JSON.stringify(logs).includes('private'));
});

test('F01: history trimming never removes a still active SOS behind 80 closed alerts', async () => {
  const f = await started();
  await joined(f, 'child');
  await joined(f, 'other', 'elder');
  const old = (await f.call('founder', 'sos.raise')).data.id;
  await f.store.transaction(async (tx) => {
    const s = await tx.read();
    s.alerts = [
      ...Array.from({ length: 80 }, (_, i) => ({
        id: 'history' + i,
        status: 'closed',
        createdAt: new Date().toISOString(),
        receivers: [],
      })),
      ...s.alerts,
    ];
    await tx.write(s);
  });
  assert((await f.call('other', 'sos.raise')).ok);
  assert((await f.store.read()).alerts.some((a) => a.id === old && a.status === 'active'));
});

test('F06: ordinary capacity cannot consume SOS reserve; 20 active requests can be acknowledged and closed', async () => {
  const f = await started('guardian');
  for (let i = 0; i < 19; i++) await joined(f, 'child' + i);
  await f.store.transaction(async (tx) => {
    const s = await tx.read();
    s.notebook.elders = Array.from({ length: 20 }, (_, i) => ({
      id: 'elder' + i,
      name: '长辈' + i,
      relation: '家人',
      note: '',
      updatedAt: new Date().toISOString(),
    }));
    s.familyRecords = Array.from({ length: 800 }, (_, i) => ({
      id: 'record' + i,
      authorId: s.members[0].id,
      subjectMemberId: '',
      subjectName: '全家',
      authorName: '家人',
      date: '2026-10-11',
      category: '生活备忘',
      scope: 'family',
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    const fill = 849900 - bytes(s),
      each = Math.floor(fill / 800),
      extra = fill % 800;
    assert(each > 0 && each < 1000);
    s.familyRecords.forEach((r, i) => (r.content = 'x'.repeat(each + (i < extra ? 1 : 0))));
    assert.equal(bytes(s), 849900);
    await tx.write(s);
  });
  const ordinary = await f.call('founder', 'record.save', {
    subjectMemberId: '',
    date: '2026-10-11',
    category: '生活备忘',
    content: 'ordinary',
  });
  assert.equal(ordinary.error.code, 'NORMAL_CAPACITY_FULL');
  const ids = [];
  for (let i = 0; i < 20; i++) {
    const r = await f.call('founder', 'sos.raise', {
      elderId: 'elder' + i,
      note: '急'.repeat(200),
    });
    assert(r.ok, JSON.stringify(r));
    ids.push(r.data.id);
  }
  assert.equal((await f.store.read()).alerts.filter((a) => a.status === 'active').length, 20);
  for (const id of ids) {
    assert((await f.call('child0', 'sos.ack', { id })).ok);
    assert((await f.call('founder', 'sos.close', { id })).ok);
  }
  assert(bytes(await f.store.read()) < 1000000);
  assert.equal((await f.store.read()).familyRecords.length, 800);
});

test('F02: failed audio cleanup is terminal for attachment, cleanup retry cannot delete another sent recording', async () => {
  const f = await started();
  await joined(f, 'child');
  const doomed = (await f.call('founder', 'media.upload', voice())).data;
  const remove = f.io.delete;
  f.io.delete = async () => {
    throw Error('failure with private details');
  };
  assert.equal((await f.call('founder', 'media.clean')).ok, false);
  assert.equal(
    (await f.call('founder', 'message.send', { audience: 'family', mediaId: doomed.id })).ok,
    false,
  );
  const safe = (await f.call('founder', 'media.upload', voice())).data;
  assert((await f.call('founder', 'message.send', { audience: 'family', mediaId: safe.id })).ok);
  f.io.delete = remove;
  assert((await f.call('founder', 'media.clean')).ok);
  assert((await f.call('child', 'media.get', { id: safe.id })).ok);
  assert.equal((await f.call('child', 'media.get', { id: doomed.id })).ok, false);
});

test('F02: sending while storage cleanup is in flight is rejected', async () => {
  const f = await started();
  await joined(f, 'child');
  const file = (await f.call('founder', 'media.upload', voice())).data;
  let release, entered;
  const enteredPromise = new Promise((r) => (entered = r)),
    gate = new Promise((r) => (release = r)),
    remove = f.io.delete;
  f.io.delete = async (id) => {
    entered();
    await gate;
    return remove(id);
  };
  const cleaning = f.call('founder', 'media.clean');
  await enteredPromise;
  assert.equal(
    (await f.call('founder', 'message.send', { audience: 'family', mediaId: file.id })).ok,
    false,
  );
  release();
  assert((await cleaning).ok);
});

test('F03: explicit owner cleanup recovers capacity without revealing departed private messages', async () => {
  const f = await started();
  const leaver = await joined(f, 'leaver'),
    target = await joined(f, 'target');
  await f.store.transaction(async (tx) => {
    const s = await tx.read();
    s.messages = Array.from({ length: 200 }, (_, i) => ({
      id: 'private' + i,
      senderId: leaver,
      senderName: 'gone',
      audience: 'members',
      recipientIds: [target],
      receivers: [],
      text: 'private',
      createdAt: new Date().toISOString(),
    }));
    s.familyRecords = [{ id: 'orphan', authorId: leaver }];
    await tx.write(s);
  });
  assert((await f.call('founder', 'family.remove', { id: leaver })).ok);
  let s = (await f.call('founder', 'session')).data;
  assert.equal(s.messages.length, 0);
  assert.equal(s.departedContent.messages, 200);
  assert.equal(
    (await f.call('target', 'family.cleanupDeparted', { confirm: 'DELETE_DEPARTED_CONTENT' })).ok,
    false,
  );
  assert.equal((await f.call('founder', 'family.cleanupDeparted')).ok, false);
  const r = await f.call('founder', 'family.cleanupDeparted', {
    confirm: 'DELETE_DEPARTED_CONTENT',
  });
  assert(r.ok);
  assert.equal(r.data.removedMessages, 200);
  assert.equal(r.data.removedRecords, 1);
  assert(
    (await f.call('founder', 'message.send', { audience: 'family', text: 'available again' })).ok,
  );
});

test('notebook rejects stale shared edits; retry of already committed request still succeeds', async () => {
  const f = await started();
  await joined(f, 'child');
  const elder = (await f.call('founder', 'session')).data.me.elderId;
  const req = event('notebook.apply', {
    expectedRevision: 0,
    action: { type: 'todo.save', payload: { elderId: elder, title: 'one', date: '2026-10-11' } },
  });
  assert((await f.call('founder', req)).ok);
  assert((await f.call('founder', req)).ok);
  const conflict = await f.call('child', 'notebook.apply', {
    expectedRevision: 0,
    action: { type: 'todo.save', payload: { elderId: elder, title: 'stale', date: '2026-10-11' } },
  });
  assert.equal(conflict.error.code, 'REVISION_CONFLICT');
  assert.equal((await f.store.read()).notebook.todos.length, 1);
});

test('diagnostics expose only whitelisted metadata, never message content or SDK errors', async () => {
  const f = await started();
  await joined(f, 'child');
  const logs = [];
  f.io.log = (x) => logs.push(x);
  f.io.upload = async () => {
    throw Error('private SDK data');
  };
  await f.call('founder', 'media.upload', voice());
  assert(logs.some((x) => x.code === 'INTERNAL_ERROR'));
  assert(!JSON.stringify(logs).includes('private SDK'));
  assert(logs.every((x) => Object.keys(x).sort().join(',') === 'code,operation,requestId,stage'));
});

test('revoked member cannot replay an old successful mutation receipt', async () => {
  const f = await started();
  const id = await joined(f, 'child');
  const req = event('profile.update', { name: 'child' });
  assert((await f.call('child', req)).ok);
  await f.call('founder', 'family.remove', { id });
  assert.equal((await f.call('child', req)).error.code, 'MEMBERSHIP_REQUIRED');
});

test('single-use invitation remains single use during concurrent joins, and expiry is enforced', async () => {
  const f = await started();
  const inv = await f.call('founder', 'family.invite', { role: 'guardian' });
  const results = await Promise.all(
    ['a', 'b'].map((name) => f.call(name, 'family.join', { name, token: inv.data.token })),
  );
  assert.equal(results.filter((r) => r.ok).length, 1);
  const expired = await f.call('founder', 'family.invite', { role: 'guardian' });
  await f.store.transaction(async (tx) => {
    const s = await tx.read();
    s.invites.forEach((i) => (i.expiresAt = 0));
    await tx.write(s);
  });
  assert.equal(
    (await f.call('late', 'family.join', { name: 'late', token: expired.data.token })).ok,
    false,
  );
});
