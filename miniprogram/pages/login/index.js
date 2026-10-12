const family = require('../../lib/family'),
  ui = require('../../lib/ui');

Page({
  data: {
    busy: false,
    error: '',
    loading: true,
    session: null,
    name: '',
    phone: '',
    token: '',
    role: 'elder',
    consent: false,
  },
  onLoad(q) {
    if (q.invite) this.setData({ token: q.invite });
  },
  onShow() {
    ui.show(this);
    this.refresh();
  },
  refresh() {
    return ui.run(this, async () => this.setData({ session: await family.request('session') }));
  },
  input: ui.input,
  choose(e) {
    this.setData({ role: e.currentTarget.dataset.role });
  },
  agree(e) {
    this.setData({ consent: e.detail.value.includes('yes') });
  },
  enter() {
    return ui.run(this, async () => {
      if (!this.data.consent) throw new Error('请先阅读并同意用途与隐私说明');
      const d = this.data;
      if (!d.session) throw new Error('云端未连接，请重试');
      if (!d.session.me) {
        if (d.session.isOwner && !d.session.exists)
          await family.act('family.create', { name: d.name, phone: d.phone, role: d.role });
        else
          await family.act('family.join', { name: d.name, phone: d.phone, token: d.token.trim() });
      }
      wx.switchTab({ url: '/pages/home/index' });
    });
  },
  go: ui.go,
});
