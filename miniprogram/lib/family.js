const config = require('../config');
let queue = Promise.resolve(),
  sessionEpoch = 0,
  invalidating = false;
function invalidateSession() {
  if (invalidating) return;
  invalidating = true;
  sessionEpoch++;
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  require('./session').clearPrivatePages(pages);
  if (typeof getApp === 'function' && getApp().noticeSound) getApp().noticeSound.stop();
  try {
    wx.removeStorageSync('nxh.family.pending');
  } catch (e) {}
  if (wx.reLaunch)
    wx.reLaunch({
      url: '/pages/login/index',
      complete: () => {
        invalidating = false;
      },
    });
  else invalidating = false;
}
function id() {
  return (
    'f' +
    Date.now() +
    '-' +
    Math.random().toString(36).slice(2, 12) +
    '-' +
    Math.random().toString(36).slice(2, 12)
  );
}
async function request(operation, payload = {}, requestId) {
  if (!wx.cloud) throw new Error('请更新微信以使用家庭云同步');
  const generation = sessionEpoch;
  let response;
  try {
    response = await wx.cloud.callFunction({
      name: config.functionName,
      config: { env: config.cloudEnv },
      data: { operation, payload, requestId },
    });
  } catch (e) {
    throw new Error('未能连接家庭云端，请检查网络后重试。求助请同时使用电话联系家人。');
  }
  if (generation !== sessionEpoch) throw new Error('家庭身份已失效，请重新进入');
  const r = response.result;
  if (!r || !r.ok) {
    const error = new Error(
      (r && r.error && (r.error.message || r.error)) || '云端尚未部署家庭协作版',
    );
    error.code = r && r.error && r.error.code;
    if (error.code === 'MEMBERSHIP_REQUIRED') invalidateSession();
    throw error;
  }
  return r.data;
}
function signature(value) {
  let a = 2166136261,
    b = 3339675911;
  for (let i = 0; i < value.length; i++) {
    a = Math.imul(a ^ value.charCodeAt(i), 16777619);
    b = Math.imul(b ^ value.charCodeAt(i), 2246822519);
  }
  return (a >>> 0).toString(16) + ':' + (b >>> 0).toString(16) + ':' + value.length;
}
function act(operation, payload = {}) {
  const generation = sessionEpoch;
  const run = async () => {
    if (generation !== sessionEpoch) throw new Error('家庭身份已变化，请重新操作');
    const sig = signature(JSON.stringify([operation, payload])),
      key = 'nxh.family.pending',
      saved = wx.getStorageSync(key);
    let entries =
      saved && Array.isArray(saved.entries) ? saved.entries : saved && saved.sig ? [saved] : [];
    let pending = entries.find((x) => x.sig === sig);
    if (!pending) {
      if (entries.length >= 20) throw new Error('待确认操作过多，请联网后先重试未完成的操作');
      pending = { sig, id: id() };
      entries.push(pending);
    }
    wx.setStorageSync(key, { entries });
    const remove = () => {
      entries = entries.filter((x) => x.id !== pending.id);
      if (entries.length) wx.setStorageSync(key, { entries });
      else wx.removeStorageSync(key);
    };
    try {
      const result = await request(operation, payload, pending.id);
      remove();
      return result;
    } catch (e) {
      if (generation === sessionEpoch && e.code && e.code !== 'INTERNAL_ERROR') remove();
      throw e;
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}
async function load() {
  const s = await request('session');
  if (!s.me) {
    invalidateSession();
    throw new Error('请先加入本人家庭');
  }
  return decorate(s);
}
function decorate(s) {
  const name = (id) => (s.members.find((m) => m.id === id) || {}).name || '已离开的家人';
  const labels = {
    pending: '等待尝试微信通知',
    sending: '微信发送结果待确认',
    unconfigured: '未配置微信推送',
    submitted: '已提交微信，未代表已读',
    notSubscribed: '未取得可用订阅授权',
    failed: '微信通知失败',
    unknown: '微信发送结果未知',
    removed: '家人已离开',
    inApp: '小程序内留言',
  };
  for (const x of [...s.messages, ...s.alerts]) {
    x.time = new Date(Date.parse(x.createdAt) + 8 * 3600000)
      .toISOString()
      .slice(0, 16)
      .replace('T', ' ');
    x.elderName = (s.notebook.elders.find((e) => e.id === x.elderId) || {}).name || '全家';
    x.audienceLabel =
      x.audience === 'members'
        ? '仅 ' + x.recipientIds.map(name).join('、') + ' 与发送者可见'
        : x.audience === 'family'
          ? '全家可见'
          : x.elderName + ' · 原有留言';
    x.mine = x.senderId === s.me.id;
    x.receivers = x.receivers.map((r) => ({
      ...r,
      name: name(r.memberId),
      label: r.confirmedAt
        ? '已确认收到'
        : r.seenAt
          ? '已查看，未确认'
          : labels[r.status] || '状态待确认',
    }));
    x.receiverCount = x.receivers.length;
    x.confirmed = x.receivers.filter((r) => r.confirmedAt).length + (x.retiredConfirmedCount || 0);
    x.myReceipt = x.receivers.find((r) => r.memberId === s.me.id) || null;
    x.unread = !x.mine && (!x.myReceipt || !x.myReceipt.seenAt);
  }
  s.elderCount = s.notebook.elders.length;
  s.memberCount = s.members.length;
  s.contacts = s.members.filter((m) => m.id !== s.me.id && m.phone);
  s.contactCount = s.contacts.length;
  s.unread = s.messages.filter((x) => x.unread).length;
  return s;
}
function subscribe(page) {
  const templateId = page.data.session && page.data.session.templateId;
  if (!templateId) {
    page.setData({ error: '尚未配置微信订阅消息模板，当前只有小程序内消息。' });
    return;
  }
  wx.requestSubscribeMessage({
    tmplIds: [templateId],
    success: (r) =>
      wx.showToast({
        title: r[templateId] === 'accept' ? '本次已允许提醒' : '未允许提醒',
        icon: 'none',
      }),
    fail: () => page.setData({ error: '未取得订阅权限，请稍后重试。' }),
  });
}
function call(e) {
  const number = e.currentTarget.dataset.phone;
  if (number)
    wx.makePhoneCall({
      phoneNumber: String(number),
      fail: () => wx.showToast({ title: '未拨打电话', icon: 'none' }),
    });
}
module.exports = {
  request,
  act,
  load,
  decorate,
  subscribe,
  call,
  invalidateSession,
  sessionVersion: () => sessionEpoch,
};
