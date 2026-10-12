function today() {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
}
function show(page) {
  page.setData({ large: !!getApp().globalData.large });
}
async function run(page, fn) {
  if (page.data.busy) return;
  page.setData({ busy: true, error: '' });
  try {
    return await fn();
  } catch (e) {
    if (e.committed) {
      if (page.reset) page.reset();
      page.setData({ refreshRequired: true });
    }
    page.setData({ error: e.message || '操作未完成，请重试' });
  } finally {
    page.setData({ busy: false, loading: false });
    wx.stopPullDownRefresh();
  }
}
function input(e) {
  const field = e.currentTarget.dataset.field;
  if (/^[a-zA-Z]+$/.test(field)) this.setData({ [field]: e.detail.value });
}
function go(e) {
  const name = e.currentTarget.dataset.page,
    url = '/pages/' + name + '/index';
  if (['home', 'messages', 'records', 'profile'].includes(name)) wx.switchTab({ url });
  else wx.navigateTo({ url });
}
function confirm(content) {
  return new Promise((resolve) =>
    wx.showModal({
      title: '请确认',
      content,
      confirmText: '确认',
      cancelText: '取消',
      success: (r) => resolve(r.confirm),
      fail: () => resolve(false),
    }),
  );
}
function toast(title) {
  wx.showToast({ title, icon: 'success' });
}
function names(state, rows) {
  return rows.map((r) => ({
    ...r,
    elderName: (state.elders.find((x) => x.id === r.elderId) || {}).name || '长辈',
  }));
}
module.exports = { today, show, run, input, go, confirm, toast, names };
