const family = require('../../lib/family'),
  ui = require('../../lib/ui');
Page({
  data: {
    session: null,
    section: 'members',
    name: '',
    phone: '',
    token: '',
    inviteRole: 'guardian',
    inviteElderIndex: 0,
    inviteElders: [],
    pendingInvites: [],
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
  applySession(s) {
    s.notebook.elders = s.notebook.elders.map((e) => ({
      ...e,
      followed: s.me.following.includes(e.id),
    }));
    this.setData({
      session: s,
      name: s.me.name,
      phone: s.me.phone,
      inviteElderIndex: 0,
      inviteElders: [
        { id: '', name: '新建一位长辈' },
        ...s.notebook.elders.filter((e) => !s.members.some((m) => m.elderId === e.id)),
      ],
      pendingInvites: (s.pendingInvites || []).map((i) => ({
        ...i,
        expiresLabel: new Date(i.expiresAt + 8 * 3600000)
          .toISOString()
          .slice(5, 16)
          .replace('T', ' '),
      })),
      pendingCount: (s.pendingInvites || []).length,
    });
  },
  switchSection(e) {
    this.setData({ section: e.currentTarget.dataset.section });
  },
  input: ui.input,
  chooseInviteElder(e) {
    this.setData({ inviteElderIndex: Number(e.detail.value) });
  },
  save() {
    return ui.run(this, async () => {
      await family.act('profile.update', { name: this.data.name, phone: this.data.phone });
      this.applySession(await family.load());
      ui.toast('已保存');
    });
  },
  invite(e) {
    return ui.run(this, async () => {
      const r = await family.act('family.invite', {
        role: e.currentTarget.dataset.role,
        elderId:
          e.currentTarget.dataset.role === 'elder'
            ? (this.data.inviteElders[this.data.inviteElderIndex] || {}).id
            : '',
      });
      this.setData({ token: r.token, inviteRole: r.role });
      this.applySession(await family.load());
    });
  },
  copy() {
    wx.setClipboardData({ data: this.data.token });
  },
  onShareAppMessage() {
    return { title: '邀请你加入暖心护家庭', path: '/pages/login/index?invite=' + this.data.token };
  },
  follow(e) {
    return ui.run(this, async () => {
      const id = e.currentTarget.dataset.id,
        s = this.data.session,
        ids = s.me.following.includes(id)
          ? s.me.following.filter((x) => x !== id)
          : [...s.me.following, id];
      await family.act('family.follow', { elderIds: ids });
      this.applySession(await family.load());
    });
  },
  remove(e) {
    return ui.run(this, async () => {
      const member = this.data.session.members.find((m) => m.id === e.currentTarget.dataset.id);
      if (!member) return;
      if (
        !(await ui.confirm(
          '将“' +
            member.name +
            '”移出家庭？对方将不能查看或发送家庭消息。已有记录保留，需要新邀请才能重新加入。',
        ))
      )
        return;
      await family.act('family.remove', { id: member.id });
      this.applySession(await family.load());
      ui.toast('已移除成员');
    });
  },
  revokeOne(e) {
    return ui.run(this, async () => {
      if (!(await ui.confirm('撤销这份尚未使用的邀请？'))) return;
      await family.act('family.revokeInvite', { id: e.currentTarget.dataset.id });
      this.setData({ token: '' });
      this.applySession(await family.load());
    });
  },
  revoke() {
    return ui.run(this, async () => {
      if (!(await ui.confirm('撤销全部尚未使用的邀请码？'))) return;
      await family.act('family.revokeInvites');
      this.setData({ token: '' });
      this.applySession(await family.load());
      ui.toast('已撤销');
    });
  },
  call: family.call,
  go: ui.go,
  cleanupDeparted() {
    return ui.run(this, async () => {
      if (
        !(await ui.confirm(
          '删除已离开成员发送的旧留言、关联录音及其创建的共享生活记录？请先导出你有权查看的内容。此操作不可恢复，且不会向你开放定向留言内容。',
        ))
      )
        return;
      await family.act('family.cleanupDeparted', { confirm: 'DELETE_DEPARTED_CONTENT' });
      this.applySession(await family.load());
      ui.toast('离开成员内容已整理');
    });
  },
});
