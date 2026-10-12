const family = require('../../lib/family'),
  ui = require('../../lib/ui');

Page({
  data: { session: null, busy: false, error: '', loading: true },
  onShow() {
    ui.show(this);
    this.setData({ sound: wx.getStorageSync('nxh.sound') !== false });
    this.refresh();
  },
  refresh() {
    return ui.run(this, async () => this.setData({ session: await family.load() }));
  },
  large(e) {
    try {
      wx.setStorageSync('nxh.large', e.detail.value);
      getApp().globalData.large = e.detail.value;
      this.setData({ large: e.detail.value });
    } catch (e) {
      this.setData({ error: '设置保存失败' });
    }
  },
  soundChanged(e) {
    try {
      wx.setStorageSync('nxh.sound', e.detail.value);
      this.setData({ sound: e.detail.value });
      if (!e.detail.value && getApp().noticeSound) getApp().noticeSound.stop();
    } catch (e) {
      this.setData({ error: '提示音设置保存失败' });
    }
  },
  testSound() {
    if (getApp().noticeSound)
      getApp().noticeSound.play((message) => this.setData({ error: message }));
  },
  exportData() {
    return ui.run(this, async () => {
      if (
        !(await ui.confirm(
          '导出可见的家庭文字记录到本机剪贴板？请只粘贴到信任的位置，导出不包含语音文件。',
        ))
      )
        return;
      const s = await family.load();
      const data = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          notebook: s.notebook,
          familyRecords: s.familyRecords || [],
          messages: s.messages,
          alerts: s.alerts,
        },
        null,
        2,
      );
      await new Promise((resolve, reject) =>
        wx.setClipboardData({ data, success: resolve, fail: () => reject(new Error('导出失败')) }),
      );
    });
  },
  subscribe() {
    family.subscribe(this);
  },
  logout() {
    wx.reLaunch({ url: '/pages/login/index' });
  },
  go: ui.go,
});
