const config = require('./config');
const family = require('./lib/family'),
  { createReminders } = require('./lib/reminders');
const { createSound } = require('./lib/sound');
App({
  onLaunch() {
    this.globalData = { large: Boolean(wx.getStorageSync('nxh.large')) };
    if (config.mode === 'cloud' && wx.cloud)
      wx.cloud.init({ env: config.cloudEnv, traceUser: false });
    if (wx.setInnerAudioOption)
      wx.setInnerAudioOption({ obeyMuteSwitch: true, mixWithOther: true, fail: () => {} });
    this.noticeSound = createSound(wx);
    this.reminders = createReminders({
      wx,
      sound: this.noticeSound,
      onInvalidSession: family.invalidateSession,
      request: family.request,
      currentPage: () => {
        const pages = getCurrentPages();
        return pages[pages.length - 1];
      },
      setInterval,
      clearInterval,
    });
  },
  onShow() {
    if (this.reminders) this.reminders.start();
  },
  onHide() {
    if (this.reminders) this.reminders.stop();
  },
});
