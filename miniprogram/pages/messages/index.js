const family = require('../../lib/family'),
  ui = require('../../lib/ui');
Page({
  data: {
    session: null,
    items: [],
    filter: 'all',
    query: '',
    audience: 'family',
    recipientIds: [],
    recipientOptions: [],
    composing: false,
    text: '',
    important: false,
    elderIndex: 0,
    elderOptions: [],
    draftPath: '',
    duration: 0,
    recording: false,
    seconds: 0,
    playingId: '',
    busy: false,
    error: '',
    loading: true,
  },
  onLoad() {
    this.tempFiles = [];
    this.recorder = wx.getRecorderManager();
    this.player = wx.createInnerAudioContext();
    this.started = () => {
      if (!this.visible) {
        this.discardRecording = true;
        this.recorder.stop();
        return;
      }
      this.setData({ recording: true, seconds: 0 });
      this.recordTimer = setInterval(
        () => this.setData({ seconds: Math.min(60, this.data.seconds + 1) }),
        1000,
      );
    };
    this.stopped = (r) => {
      clearInterval(this.recordTimer);
      this.setData({ recording: false });
      if (this.discardRecording) {
        this.discardRecording = false;
        return;
      }
      if (r.fileSize > 400000) {
        this.setData({ error: '语音超过400KB，请缩短录音后重试' });
        return;
      }
      this.setData({
        draftPath: r.tempFilePath,
        duration: Math.min(60, Math.max(1, Math.ceil(r.duration / 1000))),
      });
    };
    this.recordError = () => {
      clearInterval(this.recordTimer);
      this.setData({
        recording: false,
        error: '录音未完成，请检查麦克风授权；也可以直接输入文字。',
      });
    };
    this.recorder.onStart(this.started);
    this.recorder.onStop(this.stopped);
    this.recorder.onError(this.recordError);
    this.player.onEnded(() => this.setData({ playingId: '' }));
    this.player.onError(() => this.setData({ playingId: '', error: '语音播放失败，请重试' }));
  },
  onShow() {
    this.visible = true;
    ui.show(this);
    this.refresh();
  },
  onHide() {
    this.visible = false;
    if (this.data.recording) {
      this.discardRecording = true;
      this.recorder.stop();
    }
    this.player.stop();
    this.setData({ playingId: '' });
  },
  onUnload() {
    clearInterval(this.recordTimer);
    if (this.data.recording) this.recorder.stop();
    this.recorder.offStart(this.started);
    this.recorder.offStop(this.stopped);
    this.recorder.offError(this.recordError);
    this.player.destroy();
    for (const path of this.tempFiles)
      wx.getFileSystemManager().unlink({ filePath: path, fail: () => {} });
  },
  onSessionInvalidated() {
    this.visible = false;
    this.discardRecording = true;
    clearInterval(this.recordTimer);
    if (this.recorder && this.data.recording) this.recorder.stop();
    if (this.player) this.player.stop();
    for (const path of this.tempFiles || [])
      wx.getFileSystemManager().unlink({ filePath: path, fail: () => {} });
    this.tempFiles = [];
    this.uploadedMediaId = null;
  },
  onPullDownRefresh() {
    this.refresh();
  },
  onFamilySnapshot(s) {
    this.applySession(family.decorate(s));
  },
  applySession(s) {
    const selected = (this.data.elderOptions[this.data.elderIndex] || {}).id || '';
    const elderOptions = [{ id: '', name: '全家' }, ...s.notebook.elders];
    this.setData({
      session: s,
      elderOptions,
      elderIndex: Math.max(
        0,
        elderOptions.findIndex((e) => e.id === selected),
      ),
    });
    this.setData({
      recipientOptions: (s.members || [])
        .filter((m) => m.id !== s.me.id)
        .map((m) => ({ ...m, selected: this.data.recipientIds.includes(m.id) })),
    });
    this.filterItems();
  },
  filterItems() {
    const s = this.data.session;
    if (!s) return;
    const q = this.data.query.trim();
    const items = s.messages.filter(
      (m) =>
        (this.data.filter === 'unread'
          ? m.unread
          : this.data.filter === 'mine'
            ? m.mine
            : this.data.filter === 'important'
              ? m.important
              : true) &&
        (!q || (m.senderName + ' ' + m.text + ' ' + (m.audienceLabel || '')).includes(q)),
    );
    const limit = this.messageLimit || 30;
    this.setData({
      items: items.slice(0, limit),
      itemCount: items.length,
      hasMore: items.length > limit,
    });
  },
  search(e) {
    this.messageLimit = 30;
    this.setData({ query: e.detail.value });
    this.filterItems();
  },
  selectAudience(e) {
    this.setData({ audience: e.currentTarget.dataset.audience });
  },
  selectRecipients(e) {
    const ids = e.detail.value;
    this.setData({
      recipientIds: ids,
      recipientOptions: this.data.recipientOptions.map((m) => ({
        ...m,
        selected: ids.includes(m.id),
      })),
    });
  },
  filter(e) {
    this.messageLimit = 30;
    this.setData({ filter: e.currentTarget.dataset.filter });
    this.filterItems();
  },
  compose() {
    this.setData({ composing: true });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
  more() {
    this.messageLimit = (this.messageLimit || 30) + 30;
    this.filterItems();
  },
  backToMessages() {
    if (this.data.recording) {
      wx.showToast({ title: '请先结束录音', icon: 'none' });
      return;
    }
    this.setData({ composing: false });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
  async sync() {
    this.applySession(await family.load());
  },
  refresh() {
    return ui.run(this, () => this.sync());
  },
  input: ui.input,
  choose(e) {
    this.setData({ elderIndex: Number(e.detail.value) });
  },
  important(e) {
    this.setData({ important: e.detail.value });
  },
  record() {
    return ui.run(this, async () => {
      const generation = family.sessionVersion();
      if (this.data.draftPath) throw new Error('请先发送或取消上一段语音');
      if (wx.requirePrivacyAuthorize)
        await new Promise((resolve, reject) =>
          wx.requirePrivacyAuthorize({
            success: resolve,
            fail: () => reject(new Error('需同意麦克风用途后才能录音；文字留言仍可使用')),
          }),
        );
      await new Promise((resolve, reject) =>
        wx.authorize({
          scope: 'scope.record',
          success: resolve,
          fail: () => reject(new Error('未获得麦克风权限，请点击“麦克风设置”开启，或使用文字留言')),
        }),
      );
      if (!this.visible || generation !== family.sessionVersion())
        throw new Error('页面身份已变化，请重新进入后录音');
      if (getApp().noticeSound) getApp().noticeSound.stop();
      this.discardRecording = false;
      this.recorder.start({
        duration: 60000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 32000,
        format: 'mp3',
      });
    });
  },
  stop() {
    this.recorder.stop();
  },
  settings() {
    wx.openSetting({});
  },
  discard() {
    return ui.run(this, async () => {
      if (this.uploadedMediaId) {
        await family.act('media.clean');
        this.uploadedMediaId = null;
      }
      this.player.stop();
      this.setData({ draftPath: '', duration: 0, playingId: '' });
    });
  },
  preview() {
    this.player.src = this.data.draftPath;
    this.player.play();
    this.setData({ playingId: 'draft' });
  },
  send() {
    return ui.run(this, async () => {
      const d = this.data;
      if (!(d.session.capabilities || []).includes('message-audience'))
        throw new Error('云端尚未更新接收范围功能，请先完成云函数部署');
      if (d.audience === 'members' && !d.recipientIds.length)
        throw new Error('请至少选择一位接收成员');
      if (d.recording) throw new Error('请先结束录音');
      if (!d.text.trim() && !d.draftPath) throw new Error('请输入文字或录一段语音');
      if (d.draftPath && !this.uploadedMediaId) {
        const file = await new Promise((resolve, reject) =>
          wx.getFileSystemManager().readFile({
            filePath: d.draftPath,
            encoding: 'base64',
            success: resolve,
            fail: () => reject(new Error('读取语音失败，请重新录音')),
          }),
        );
        const r = await family.act('media.upload', { base64: file.data, duration: d.duration });
        this.uploadedMediaId = r.id;
      }
      await family.act('message.send', {
        text: d.text,
        mediaId: this.uploadedMediaId || '',
        important: d.important,
        audience: d.audience,
        recipientIds: d.audience === 'members' ? d.recipientIds : [],
      });
      this.uploadedMediaId = null;
      this.setData({
        text: '',
        draftPath: '',
        duration: 0,
        important: false,
        composing: false,
        filter: 'all',
      });
      await this.sync();
      wx.pageScrollTo({ scrollTop: 0, duration: 0 });
      ui.toast('留言已保存');
    });
  },
  play(e) {
    return ui.run(this, async () => {
      const id = e.currentTarget.dataset.id;
      if (this.data.playingId === id) {
        this.player.stop();
        this.setData({ playingId: '' });
        return;
      }
      const generation = family.sessionVersion();
      const r = await family.request('media.get', { id });
      const path = wx.env.USER_DATA_PATH + '/nxh-voice-' + Date.now() + '.mp3';
      await new Promise((resolve, reject) =>
        wx.getFileSystemManager().writeFile({
          filePath: path,
          data: r.base64,
          encoding: 'base64',
          success: resolve,
          fail: () => reject(new Error('本机语音缓存写入失败')),
        }),
      );
      if (!this.visible || generation !== family.sessionVersion()) {
        wx.getFileSystemManager().unlink({ filePath: path, fail: () => {} });
        throw new Error('页面身份已变化，已停止播放');
      }
      this.tempFiles.push(path);
      this.player.src = path;
      this.player.play();
      this.setData({ playingId: id });
    });
  },
  read(e) {
    return ui.run(this, async () => {
      await family.act('message.read', { id: e.currentTarget.dataset.id });
      await this.sync();
    });
  },
  ack(e) {
    return ui.run(this, async () => {
      await family.act('message.ack', { id: e.currentTarget.dataset.id });
      await this.sync();
    });
  },
  remove(e) {
    return ui.run(this, async () => {
      if (!(await ui.confirm('删除本人发送的这条留言和关联语音？家人已自行保存的副本无法撤回。')))
        return;
      await family.act('message.remove', { id: e.currentTarget.dataset.id });
      await this.sync();
    });
  },
  clean() {
    return ui.run(this, async () => {
      if (!(await ui.confirm('清理本人未发送或已删除留言的云端录音？'))) return;
      await family.act('media.clean');
      this.uploadedMediaId = null;
      ui.toast('清理完成');
    });
  },
  subscribe() {
    family.subscribe(this);
  },
});
