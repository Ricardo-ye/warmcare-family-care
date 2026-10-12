const family = require('../../lib/family'),
  ui = require('../../lib/ui');

Page({
  data: { session: null, busy: false, error: '', loading: true, active: [], pending: 0 },
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
    s.cared =
      s.me.role === 'elder'
        ? s.notebook.elders
        : s.notebook.elders.filter((e) => s.me.following.includes(e.id));
    s.caredCount = s.cared.length;
    this.setData({
      session: s,
      activeCount: s.alerts.filter((a) => a.status === 'active').length,
      active: s.alerts.filter((a) => a.status === 'active'),
      pending: s.notebook.todos.filter((t) => !t.done).length,
      latest: s.messages.find((m) => m.unread) || null,
    });
  },
  go: ui.go,
  subscribe() {
    family.subscribe(this);
  },
  call: family.call,
});
