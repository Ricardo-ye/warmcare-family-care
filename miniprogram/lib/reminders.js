// Foreground hints only. These never acknowledge messages or send system push.
function summarize(s) {
  if (!s || !s.me) return { messages: [], alerts: [], acks: [] };
  const me = s.me;
  const messages = s.messages.filter(
    (m) => m.senderId !== me.id && !(m.receivers.find((r) => r.memberId === me.id) || {}).seenAt,
  );
  const alerts = s.alerts.filter(
    (a) =>
      a.status === 'active' &&
      a.senderId !== me.id &&
      me.role === 'guardian' &&
      !(a.receivers.find((r) => r.memberId === me.id) || {}).confirmedAt,
  );
  const acks = s.alerts
    .filter((a) => a.senderId === me.id)
    .flatMap((a) =>
      a.receivers
        .filter((r) => r.confirmedAt)
        .map((r) => ({
          key: 'ack:' + a.id + ':' + r.memberId,
          name: (s.members.find((m) => m.id === r.memberId) || {}).name || '家人',
        })),
    );
  return { messages, alerts, acks };
}
function createReminders({
  wx,
  request,
  currentPage,
  sound,
  onInvalidSession,
  setInterval: setTimer,
  clearInterval: clearTimer,
}) {
  let active = false,
    timer = null,
    inFlight = false,
    epoch = 0,
    modalOpen = false,
    memberId = '',
    seen = new Set();
  function invoke(name, options) {
    try {
      if (typeof wx[name] === 'function') {
        wx[name]({ ...options, fail: options.fail || (() => {}) });
        return true;
      }
    } catch (e) {}
    return false;
  }
  function remember(keys, owner = memberId) {
    if (owner !== memberId) return;
    keys.forEach((k) => seen.add(k));
    seen = new Set([...seen].slice(-2000));
    try {
      wx.setStorageSync('nxh.reminders.' + memberId, [...seen]);
    } catch (e) {}
  }
  function badge(index, count) {
    if (count) invoke('setTabBarBadge', { index, text: count > 99 ? '99+' : String(count) });
    else invoke('removeTabBarBadge', { index });
  }
  function consume(s, page) {
    if (s && page && page.data.session && s.revision < page.data.session.revision) return;
    const state = summarize(s);
    badge(1, state.messages.length);
    badge(0, state.alerts.length);
    if (!s || !s.me) {
      memberId = '';
      seen = new Set();
      if (page && page.route !== 'pages/login/index') {
        if (sound) sound.stop();
        modalOpen = false;
        epoch++;
        if (onInvalidSession) onInvalidSession();
        else {
          require('./session').clearPrivatePages([page]);
          invoke('reLaunch', { url: '/pages/login/index' });
        }
      }
      return;
    }
    if (memberId !== s.me.id) {
      memberId = s.me.id;
      try {
        const saved = wx.getStorageSync('nxh.reminders.' + memberId);
        seen = new Set(Array.isArray(saved) ? saved : []);
      } catch (e) {
        seen = new Set();
      }
    }
    if (
      !page ||
      page.route === 'pages/login/index' ||
      page.data.busy ||
      page.data.recording ||
      modalOpen
    )
      return;
    if (typeof page.onFamilySnapshot === 'function') page.onFamilySnapshot(s);
    const alerts = state.alerts.filter((a) => !seen.has('sos:' + a.id));
    const acks = state.acks.filter((a) => !seen.has(a.key));
    const messages = state.messages.filter((m) => !seen.has('message:' + m.id));
    if (alerts.length) {
      modalOpen = true;
      const keys = alerts.map((a) => 'sos:' + a.id),
        generation = epoch,
        owner = memberId;
      const shown = invoke('showModal', {
        title: '家人发来求助',
        content:
          alerts.length === 1
            ? alerts[0].senderName + '发来一条求助，请查看并联系家人。'
            : alerts.length + '条求助等待你确认，请查看并联系家人。',
        confirmText: '查看求助',
        cancelText: '稍后查看',
        success: (r) => {
          remember(keys, owner);
          if (
            r.confirm &&
            active &&
            epoch === generation &&
            (currentPage() || {}).route !== 'pages/sos/index'
          )
            invoke('navigateTo', { url: '/pages/sos/index' });
        },
        complete: () => {
          modalOpen = false;
        },
        fail: () => {
          modalOpen = false;
        },
      });
      if (!shown) modalOpen = false;
      else {
        invoke('vibrateShort', { type: 'heavy' });
        if (sound && !page.data.playingId) sound.play();
      }
    } else if (acks.length || messages.length) {
      const keys = acks.length ? acks.map((a) => a.key) : messages.map((m) => 'message:' + m.id),
        owner = memberId;
      const title = acks.length
        ? acks[0].name + '已确认收到求助'
        : messages.length === 1
          ? messages[0].senderName + '发来' + (messages[0].important ? '重要留言' : '新留言')
          : '有' + messages.length + '条未读家人留言';
      invoke('showToast', {
        title,
        icon: 'none',
        duration: 3500,
        success: () => remember(keys, owner),
      });
      invoke('vibrateShort', { type: acks.length ? 'heavy' : 'medium' });
      if (sound && !page.data.playingId) sound.play();
    }
  }
  async function tick() {
    if (!active || inFlight) return;
    const generation = epoch;
    inFlight = true;
    try {
      const s = await request('session');
      if (active && generation === epoch) {
        const page = currentPage();
        if (page) page.setData({ reminderError: '' });
        consume(s, page);
      }
    } catch (e) {
      if (active && generation === epoch) {
        const page = currentPage();
        if (page && page.route !== 'pages/login/index')
          page.setData({ reminderError: '新消息暂未更新，请检查网络后下拉刷新。' });
      }
    } finally {
      inFlight = false;
    }
  }
  return {
    start() {
      if (active) return;
      active = true;
      epoch++;
      tick();
      timer = setTimer(tick, 8000);
    },
    stop() {
      active = false;
      epoch++;
      if (timer !== null) clearTimer(timer);
      timer = null;
      if (sound) sound.stop();
    },
    refresh: tick,
  };
}
module.exports = { createReminders, summarize };
