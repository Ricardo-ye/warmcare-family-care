const family = require('./family');
let committedRefresh = null;
async function load() {
  const notebook = (await family.load()).notebook;
  committedRefresh = null;
  return notebook;
}
async function dispatch(type, payload, expectedRevision) {
  const intent = JSON.stringify([type, payload, expectedRevision]),
    generation = family.sessionVersion();
  if (committedRefresh && committedRefresh.generation !== generation) committedRefresh = null;
  if (committedRefresh && committedRefresh.intent !== intent)
    throw Object.assign(new Error('上一项修改已保存，请先重新加载再操作'), {
      committed: true,
      code: 'COMMITTED_REFRESH_FAILED',
    });
  if (!committedRefresh) {
    await family.act('notebook.apply', {
      action: { type, payload },
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    });
    committedRefresh = { intent, generation };
  }
  try {
    return await load();
  } catch (cause) {
    const error = new Error('修改已经保存，但列表刷新失败。请重新加载，不要重复保存。');
    error.committed = true;
    error.code = 'COMMITTED_REFRESH_FAILED';
    throw error;
  }
}
module.exports = { load, dispatch, mode: 'cloud' };
