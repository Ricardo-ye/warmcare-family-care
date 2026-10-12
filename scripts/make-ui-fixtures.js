// Development-only fixtures. Never imported by the mini program or cloud function.
const fs = require('node:fs'),
  path = require('node:path');
const { createFamilyService } = require('../cloudfunctions/warmcare/lib/family');
fs.mkdirSync(path.join(__dirname, '../artifacts'), { recursive: true });
let state = null,
  seq = 0;
const clone = (x) => x && JSON.parse(JSON.stringify(x));
const store = {
  read: async () => clone(state),
  transaction: async (fn) =>
    fn({
      read: async () => clone(state),
      write: async (x) => {
        state = clone(x);
      },
    }),
};
const service = createFamilyService(store, { owner: 'fixture-elder', appid: 'fixture-app' });
const call = (user, operation, payload = {}) =>
  service(
    { OPENID: user, APPID: 'fixture-app' },
    { operation, payload, requestId: 'fixture-request-' + (++seq).toString().padStart(8, '0') },
  );
(async () => {
  await call('fixture-elder', 'family.create', { role: 'elder', name: '测试长辈' });
  const invite = await call('fixture-elder', 'family.invite', { role: 'guardian' });
  await call('fixture-child', 'family.join', { token: invite.data.token, name: '测试家人' });
  await call('fixture-elder', 'message.send', {
    text: '测试情景：今天想一起散步。',
    important: true,
  });
  await call('fixture-elder', 'sos.raise', { note: '仅用于界面验收的模拟求助，未发送真实通知。' });
  for (const [name, user] of [
    ['elder', 'fixture-elder'],
    ['guardian', 'fixture-child'],
  ]) {
    const result = await call(user, 'session');
    fs.writeFileSync(
      path.join(__dirname, '../artifacts/' + name + '-fixture.json'),
      JSON.stringify({ result }, null, 2),
    );
  }
  console.log('Two synthetic UI fixtures generated; no cloud or external notification used.');
})();
