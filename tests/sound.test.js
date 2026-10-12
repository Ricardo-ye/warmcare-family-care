const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { createSound } = require('../miniprogram/lib/sound');
test('sound respects local off setting, reuses one non-looping player, and errors remain nonfatal', () => {
  let enabled = true,
    created = 0,
    played = 0,
    stopped = 0,
    errorHandler,
    reported = '';
  const player = {
    stop() {
      stopped++;
    },
    play() {
      played++;
    },
    onError(f) {
      errorHandler = f;
    },
  };
  const sound = createSound({
    getStorageSync: () => enabled,
    createInnerAudioContext() {
      created++;
      return player;
    },
  });
  assert(sound.play((x) => (reported = x)));
  assert.equal(player.loop, false);
  assert.equal(player.src, '/assets/message-chime.wav');
  sound.play();
  assert.equal(created, 1);
  enabled = false;
  assert.equal(sound.play(), false);
  assert.equal(played, 2);
  sound.stop();
  assert(stopped >= 3);
  enabled = true;
  sound.play((x) => (reported = x));
  errorHandler();
  assert.match(reported, /提示音未能播放/);
});
