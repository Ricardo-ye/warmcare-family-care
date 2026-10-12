function createSound(wx) {
  let player = null,
    onError = null;
  function stop() {
    if (player)
      try {
        player.stop();
      } catch (e) {}
    onError = null;
  }
  function play(fail) {
    try {
      if (wx.getStorageSync('nxh.sound') === false) return false;
      if (!player) {
        player = wx.createInnerAudioContext();
        player.src = '/assets/message-chime.wav';
        player.loop = false;
        player.volume = 0.55;
        player.onError(() => {
          if (onError) onError('提示音未能播放，请检查手机音量或静音设置。');
        });
      }
      onError = fail || null;
      player.stop();
      player.play();
      return true;
    } catch (e) {
      if (fail) fail('当前设备未能播放提示音，文字提醒仍然可用。');
      return false;
    }
  }
  return { play, stop };
}
module.exports = { createSound };
