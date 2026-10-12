const family = require('../../lib/family'),
  ui = require('../../lib/ui');
Page({
  data: {
    session: null,
    elderIndex: 0,
    note: '',
    alerts: [],
    history: [],
    historyCount: 0,
    showHistory: false,
    busy: false,
    error: '',
    loading: true,
  },
  onShow() {
    ui.show(this);
    this.refresh();
  },
  onPullDownRefresh() {
    this.refresh();
  },
  refresh() {
    return ui.run(this, async () => this.applySession(await family.load()));
  },
  onFamilySnapshot(s) {
    this.applySession(family.decorate(s));
  },
  applySession(s) {
    const selected =
      this.data.session && (this.data.session.notebook.elders[this.data.elderIndex] || {}).id;
    const alerts = s.alerts.filter((a) => a.status === 'active'),
      history = s.alerts.filter((a) => a.status !== 'active');
    this.setData({
      session: s,
      alerts,
      alertCount: alerts.length,
      history,
      historyCount: history.length,
      elderIndex: Math.max(
        0,
        s.notebook.elders.findIndex((e) => e.id === selected),
      ),
    });
  },
  input: ui.input,
  choose(e) {
    this.setData({ elderIndex: Number(e.detail.value) });
  },
  toggleHistory() {
    this.setData({ showHistory: !this.data.showHistory });
  },
  raise() {
    return ui.run(this, async () => {
      const s = this.data.session,
        e = s.notebook.elders[this.data.elderIndex];
      if (!e) throw new Error('请先添加或绑定长辈');
      if (
        !(await ui.confirm(
          '向家庭内所有家人端成员发送求助？消息发送不代表家人已收到，请同时使用电话联系。',
        ))
      )
        return;
      await family.act('sos.raise', { elderId: e.id, note: this.data.note });
      this.applySession(await family.load());
      this.setData({ note: '' });
      wx.pageScrollTo({ scrollTop: 0 });
      ui.toast('求助记录已保存');
    });
  },
  ack(e) {
    return ui.run(this, async () => {
      await family.act('sos.ack', { id: e.currentTarget.dataset.id });
      this.applySession(await family.load());
    });
  },
  close(e) {
    return ui.run(this, async () => {
      if (!(await ui.confirm('确认这条求助不再需要继续处理？请先与家人核实。'))) return;
      await family.act('sos.close', {
        id: e.currentTarget.dataset.id,
        cancel: e.currentTarget.dataset.cancel === true,
      });
      this.applySession(await family.load());
    });
  },
  call: family.call,
  go: ui.go,
});
