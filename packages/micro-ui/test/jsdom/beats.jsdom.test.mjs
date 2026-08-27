import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";

// Mock AudioContext for jsdom environment
if (!globalThis.AudioContext && !globalThis.window.AudioContext) {
  class MockAudioContext {
    state = "running";
    currentTime = 0;
    sampleRate = 44100;
    destination = {};
    resume() { this.state = "running"; }
    suspend() { this.state = "suspended"; }
    createBuffer() {
      return {
        getChannelData: () => new Float32Array(100),
      };
    }
    createBufferSource() {
      return {
        buffer: null,
        connect: () => {},
        start: () => {},
        stop: () => {},
      };
    }
    createOscillator() {
      return {
        type: "sine",
        frequency: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        connect: () => {},
        start: () => {},
        stop: () => {},
      };
    }
    createGain() {
      return {
        gain: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        connect: () => {},
      };
    }
    createBiquadFilter() {
      return {
        type: "lowpass",
        frequency: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        Q: { setValueAtTime: () => {} },
        connect: () => {},
      };
    }
  }
  globalThis.AudioContext = MockAudioContext;
  globalThis.window.AudioContext = MockAudioContext;
}

const { flush, mount, store } = await import("@opentf/micro-ui");
await import("../../../../demo/src/beats.ts");

function tick() {
  return new Promise((r) => queueMicrotask(r));
}

test("jsdom: x-beats initializes with 5 tracks and 16 steps per track", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const el = mount(container, "x-beats");
  await tick();
  flush();

  const tracks = el.querySelectorAll(".track-row");
  assert.equal(tracks.length, 5, "should render 5 instrument tracks");

  const stepBtns = el.querySelectorAll(".step-btn");
  assert.equal(stepBtns.length, 80, "should render 5 * 16 = 80 step buttons");

  const state = store.get("beats_state");
  assert.ok(state, "beats_state store should be initialized");
  assert.equal(state.bpm, 124);
  assert.equal(state.playing, false);

  container.remove();
  await tick();
});

test("jsdom: clicking step button toggles step state in store and DOM", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const el = mount(container, "x-beats");
  await tick();
  flush();

  const firstTrack = el.querySelectorAll(".track-row")[0];
  const secondStepBtn = firstTrack.querySelectorAll(".step-btn")[1];
  
  const initialState = store.get("beats_state");
  const wasActive = initialState.tracks[0].steps[1];
  assert.equal(wasActive, false, "step 1 on kick is initially false");

  secondStepBtn.click();
  await tick();
  flush();

  const afterState = store.get("beats_state");
  assert.equal(afterState.tracks[0].steps[1], true, "step 1 on kick should now be true");

  container.remove();
  await tick();
});

test("jsdom: muting track toggles muted flag in store", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const el = mount(container, "x-beats");
  await tick();
  flush();

  const firstMuteBtn = el.querySelector(".btn-mute");
  assert.ok(firstMuteBtn);

  firstMuteBtn.click();
  await tick();
  flush();

  const state = store.get("beats_state");
  assert.equal(state.tracks[0].muted, true, "track should be muted");

  // Unmute
  firstMuteBtn.click();
  await tick();
  flush();

  assert.equal(store.get("beats_state").tracks[0].muted, false, "track should be unmuted");

  container.remove();
  await tick();
});

test("jsdom: transport play/pause and presets", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const el = mount(container, "x-beats");
  await tick();
  flush();

  const playBtn = el.querySelector(".btn-play");
  assert.ok(playBtn);

  playBtn.click();
  await tick();
  flush();

  assert.equal(store.get("beats_state").playing, true);
  assert.ok(playBtn.className.includes("playing"));

  playBtn.click();
  await tick();
  flush();

  assert.equal(store.get("beats_state").playing, false);

  // Apply synthwave preset
  const presetButtons = el.querySelectorAll(".preset-group button");
  const synthwaveBtn = Array.from(presetButtons).find((b) => b.textContent === "Synthwave");
  assert.ok(synthwaveBtn);

  synthwaveBtn.click();
  await tick();
  flush();

  assert.equal(store.get("beats_state").bpm, 110);

  container.remove();
  await tick();
});
