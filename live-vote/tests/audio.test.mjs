import test from "node:test";
import assert from "node:assert/strict";
import { unlockAudio, playCheer, stopSound } from "../ui.mjs";

test("victory clip unlocks, respects mute/volume, and stops immediately", async () => {
  const originalDocument = globalThis.document;
  const playCalls = [];
  let pauseCalls = 0;
  const audio = {
    muted: false,
    volume: 1,
    currentTime: 4,
    async play() {
      playCalls.push({ muted: this.muted, volume: this.volume });
    },
    pause() {
      pauseCalls++;
    },
  };
  globalThis.document = {
    querySelector: (selector) => (selector === "#victory-audio" ? audio : null),
  };
  try {
    await unlockAudio();
    assert.deepEqual(playCalls[0], { muted: true, volume: 1 });
    assert.equal(pauseCalls, 1);
    assert.equal(audio.currentTime, 0);
    assert.equal(audio.muted, false);

    playCheer({ sound: false, volume: 30 });
    assert.equal(playCalls.length, 1);

    playCheer({ sound: true, volume: 30 });
    assert.deepEqual(playCalls[1], { muted: false, volume: 0.3 });
    assert.equal(pauseCalls, 2);

    audio.currentTime = 2;
    stopSound();
    assert.equal(pauseCalls, 3);
    assert.equal(audio.currentTime, 0);
  } finally {
    globalThis.document = originalDocument;
  }
});
