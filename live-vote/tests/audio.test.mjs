import test from "node:test";
import assert from "node:assert/strict";
import { unlockAudio, playCheer, stopSound } from "../ui.mjs";

test("victory fanfare uses pitched notes and a chord, respects mute/volume and stops immediately", async () => {
  const notes = [],
    buses = [];
  const param = () => ({
    setValueAtTime(value) {
      this.value = value;
    },
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  class AudioContext {
    state = "suspended";
    currentTime = 3;
    destination = {};
    async resume() {
      this.state = "running";
    }
    createGain() {
      const node = {
        gain: param(),
        connect() {},
        disconnect() {
          this.disconnected = true;
        },
      };
      buses.push(node);
      return node;
    }
    createOscillator() {
      const node = {
        frequency: param(),
        connect() {},
        disconnect() {},
        start(at) {
          this.at = at;
        },
        stop(at) {
          this.end = at;
        },
      };
      notes.push(node);
      return node;
    }
  }
  globalThis.window = { AudioContext };
  try {
    await unlockAudio();
    playCheer({ sound: false, volume: 30 });
    assert.equal(notes.length, 0);
    playCheer({ sound: true, volume: 30 });
    assert.equal(notes.length, 14);
    assert.equal(buses[0].gain.value, 0.3);
    assert.ok(notes.every((n) => n.frequency.value > 0 && n.end > n.at));
    assert.equal(notes.filter((n) => n.at === 4.14).length, 5);
    assert.ok(notes.some((n) => n.type === "square"));
    assert.ok(notes.some((n) => n.type === "triangle"));
    stopSound();
    assert.equal(buses[0].disconnected, true);
    notes.forEach((n) => n.onended());
  } finally {
    globalThis.window = undefined;
  }
});
