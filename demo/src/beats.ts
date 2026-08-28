import { define, html, onReady, store, update } from "@opentf/micro-ui";

// ── Types ──────────────────────────────────────────────────────────

type Track = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  muted: boolean;
  steps: boolean[];
};

type BeatsState = {
  bpm: number;
  playing: boolean;
  currentStep: number;
  volume: number;
  tracks: Track[];
};

// ── Web Audio Synthesizer (Zero external audio files) ──────────────

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const bufferSize = ctx.sampleRate * 0.5;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

let noiseBuffer: AudioBuffer | null = null;

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer) noiseBuffer = createNoiseBuffer(ctx);
  return noiseBuffer;
}

function playKick(ctx: AudioContext, time: number, vol: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(32, time + 0.22);

  gain.gain.setValueAtTime(1.0 * vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(time);
  osc.stop(time + 0.25);
}

function playSnare(ctx: AudioContext, time: number, vol: number) {
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(800, time);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.7 * vol, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.18);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);

  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(180, time);
  osc.frequency.exponentialRampToValueAtTime(45, time + 0.1);

  oscGain.gain.setValueAtTime(0.6 * vol, time);
  oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);

  noise.start(time);
  noise.stop(time + 0.18);
  osc.start(time);
  osc.stop(time + 0.1);
}

function playHiHat(ctx: AudioContext, time: number, vol: number) {
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(7000, time);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5 * vol, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(time);
  noise.stop(time + 0.05);
}

function playClap(ctx: AudioContext, time: number, vol: number) {
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1200, time);
  filter.Q.setValueAtTime(3, time);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.6 * vol, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(time);
  noise.stop(time + 0.2);
}

function playSynth(ctx: AudioContext, time: number, freq: number, vol: number) {
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(freq, time);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(400, time);
  filter.frequency.exponentialRampToValueAtTime(2400, time + 0.08);
  filter.frequency.exponentialRampToValueAtTime(300, time + 0.3);

  gain.gain.setValueAtTime(0.35 * vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.32);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(time);
  osc.stop(time + 0.32);
}

// ── Presets ────────────────────────────────────────────────────────

const SYNTH_NOTES = [
  261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 392.0, 329.63, 261.63, 293.66,
  329.63, 392.0, 440.0, 523.25, 587.33, 523.25,
];

function createDefaultTracks(): Track[] {
  return [
    {
      id: "kick",
      name: "Kick",
      emoji: "🥁",
      color: "#f87171",
      muted: false,
      steps: [
        true,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
      ],
    },
    {
      id: "snare",
      name: "Snare",
      emoji: "💥",
      color: "#fbbf24",
      muted: false,
      steps: [
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
      ],
    },
    {
      id: "hat",
      name: "Hi-Hat",
      emoji: "✨",
      color: "#38bdf8",
      muted: false,
      steps: [
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
      ],
    },
    {
      id: "clap",
      name: "Clap",
      emoji: "👏",
      color: "#a78bfa",
      muted: false,
      steps: [
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        true,
      ],
    },
    {
      id: "synth",
      name: "Synth",
      emoji: "🎹",
      color: "#4ade80",
      muted: false,
      steps: [
        true,
        false,
        true,
        false,
        false,
        true,
        false,
        true,
        true,
        false,
        true,
        false,
        false,
        true,
        false,
        true,
      ],
    },
  ];
}

const PRESETS: Record<string, { bpm: number; tracks: Track[] }> = {
  house: {
    bpm: 124,
    tracks: createDefaultTracks(),
  },
  synthwave: {
    bpm: 110,
    tracks: [
      {
        id: "kick",
        name: "Kick",
        emoji: "🥁",
        color: "#f87171",
        muted: false,
        steps: [
          true,
          false,
          false,
          false,
          false,
          false,
          true,
          false,
          true,
          false,
          false,
          false,
          false,
          false,
          true,
          false,
        ],
      },
      {
        id: "snare",
        name: "Snare",
        emoji: "💥",
        color: "#fbbf24",
        muted: false,
        steps: [
          false,
          false,
          false,
          false,
          true,
          false,
          false,
          false,
          false,
          false,
          false,
          false,
          true,
          false,
          false,
          false,
        ],
      },
      {
        id: "hat",
        name: "Hi-Hat",
        emoji: "✨",
        color: "#38bdf8",
        muted: false,
        steps: [
          false,
          false,
          true,
          false,
          false,
          false,
          true,
          false,
          false,
          false,
          true,
          false,
          false,
          false,
          true,
          true,
        ],
      },
      {
        id: "clap",
        name: "Clap",
        emoji: "👏",
        color: "#a78bfa",
        muted: false,
        steps: [
          false,
          false,
          false,
          false,
          true,
          false,
          false,
          false,
          false,
          false,
          false,
          false,
          true,
          false,
          false,
          false,
        ],
      },
      {
        id: "synth",
        name: "Synth",
        emoji: "🎹",
        color: "#4ade80",
        muted: false,
        steps: [
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
        ],
      },
    ],
  },
  trap: {
    bpm: 140,
    tracks: [
      {
        id: "kick",
        name: "Kick",
        emoji: "🥁",
        color: "#f87171",
        muted: false,
        steps: [
          true,
          false,
          false,
          true,
          false,
          false,
          false,
          false,
          true,
          false,
          true,
          false,
          false,
          false,
          false,
          false,
        ],
      },
      {
        id: "snare",
        name: "Snare",
        emoji: "💥",
        color: "#fbbf24",
        muted: false,
        steps: [
          false,
          false,
          false,
          false,
          false,
          false,
          false,
          false,
          true,
          false,
          false,
          false,
          false,
          false,
          false,
          false,
        ],
      },
      {
        id: "hat",
        name: "Hi-Hat",
        emoji: "✨",
        color: "#38bdf8",
        muted: false,
        steps: [
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
        ],
      },
      {
        id: "clap",
        name: "Clap",
        emoji: "👏",
        color: "#a78bfa",
        muted: false,
        steps: [
          false,
          false,
          false,
          false,
          true,
          false,
          false,
          false,
          false,
          false,
          false,
          false,
          true,
          false,
          false,
          false,
        ],
      },
      {
        id: "synth",
        name: "Synth",
        emoji: "🎹",
        color: "#4ade80",
        muted: false,
        steps: [
          true,
          false,
          false,
          false,
          false,
          false,
          true,
          false,
          false,
          false,
          true,
          false,
          false,
          true,
          false,
          false,
        ],
      },
    ],
  },
  clear: {
    bpm: 120,
    tracks: createDefaultTracks().map((t) => ({
      ...t,
      steps: new Array(16).fill(false),
    })),
  },
};

// ── Store Initialization ───────────────────────────────────────────

const STORE_KEY = "beats_state";

store.set<BeatsState>(STORE_KEY, {
  bpm: 124,
  playing: false,
  currentStep: 0,
  volume: 0.8,
  tracks: createDefaultTracks(),
});

// ── Sequencer Engine ───────────────────────────────────────────────

let timerId: number | null = null;
let stepCounter = 0;

function triggerStepSound(step: number) {
  const state = store.get<BeatsState>(STORE_KEY);
  if (!state) return;
  const ctx = getAudioContext();
  const time = ctx.currentTime;
  const vol = state.volume;

  for (const track of state.tracks) {
    if (track.muted || !track.steps[step]) continue;
    switch (track.id) {
      case "kick":
        playKick(ctx, time, vol);
        break;
      case "snare":
        playSnare(ctx, time, vol);
        break;
      case "hat":
        playHiHat(ctx, time, vol);
        break;
      case "clap":
        playClap(ctx, time, vol);
        break;
      case "synth":
        playSynth(ctx, time, SYNTH_NOTES[step] || 261.63, vol);
        break;
    }
  }
}

function startSequencer(onTick: () => void) {
  if (timerId !== null) return;
  getAudioContext();

  const runTick = () => {
    const state = store.get<BeatsState>(STORE_KEY);
    if (!state?.playing) return;

    stepCounter = (stepCounter + 1) % 16;
    store.set(STORE_KEY, stepCounter, { path: "currentStep" });
    triggerStepSound(stepCounter);
    onTick();

    const stepIntervalMs = (60 / state.bpm / 4) * 1000;
    timerId = window.setTimeout(runTick, stepIntervalMs);
  };

  const state = store.get<BeatsState>(STORE_KEY);
  const stepIntervalMs = (60 / (state?.bpm || 120) / 4) * 1000;
  triggerStepSound(stepCounter);
  timerId = window.setTimeout(runTick, stepIntervalMs);
}

function stopSequencer() {
  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }
}

// ── Components ─────────────────────────────────────────────────────

/**
 * 16-Step Beat & Synth Machine
 */
define("x-beats", (el) => {
  onReady(() => {
    const unsub = store.subscribe(STORE_KEY, () => update(el));
    return () => {
      stopSequencer();
      unsub();
    };
  });

  const togglePlay = () => {
    const state = store.get<BeatsState>(STORE_KEY);
    if (!state) return;
    const nextPlaying = !state.playing;
    store.set(STORE_KEY, nextPlaying, { path: "playing" });

    if (nextPlaying) {
      startSequencer(() => update(el));
    } else {
      stopSequencer();
      update(el);
    }
  };

  const toggleStep = (trackId: string, stepIdx: number) => {
    const state = store.get<BeatsState>(STORE_KEY);
    if (!state) return;
    const updatedTracks = state.tracks.map((t: Track) => {
      if (t.id === trackId) {
        const newSteps = [...t.steps];
        newSteps[stepIdx] = !newSteps[stepIdx];
        return { ...t, steps: newSteps };
      }
      return t;
    });
    store.set(STORE_KEY, updatedTracks, { path: "tracks" });
  };

  const toggleMute = (trackId: string) => {
    const state = store.get<BeatsState>(STORE_KEY);
    if (!state) return;
    const updatedTracks = state.tracks.map((t: Track) =>
      t.id === trackId ? { ...t, muted: !t.muted } : t,
    );
    store.set(STORE_KEY, updatedTracks, { path: "tracks" });
  };

  const clearTrack = (trackId: string) => {
    const state = store.get<BeatsState>(STORE_KEY);
    if (!state) return;
    const updatedTracks = state.tracks.map((t: Track) =>
      t.id === trackId ? { ...t, steps: new Array(16).fill(false) } : t,
    );
    store.set(STORE_KEY, updatedTracks, { path: "tracks" });
  };

  const applyPreset = (name: string) => {
    const preset = PRESETS[name];
    if (!preset) return;
    store.set(STORE_KEY, preset.bpm, { path: "bpm" });
    store.set(STORE_KEY, structuredClone(preset.tracks), { path: "tracks" });
  };

  const randomize = () => {
    const state = store.get<BeatsState>(STORE_KEY);
    if (!state) return;
    const updatedTracks = state.tracks.map((t: Track) => ({
      ...t,
      steps: Array.from({ length: 16 }, () => Math.random() > 0.65),
    }));
    store.set(STORE_KEY, updatedTracks, { path: "tracks" });
  };

  return () => {
    const state = store.get<BeatsState>(STORE_KEY) || {
      bpm: 124,
      playing: false,
      currentStep: 0,
      volume: 0.8,
      tracks: createDefaultTracks(),
    };

    return html`
      <div class="card beats-card">
        <div class="beats-header">
          <div>
            <h3>Beat Maker & Synthesizer</h3>
            <p class="tagline">16-step drum machine with Web Audio synthesis & reactive store.</p>
          </div>
          <div class="beats-transport">
            <button
              class="btn-play ${state.playing ? "playing" : ""}"
              onclick=${togglePlay}
            >
              ${state.playing ? "⏸ Pause" : "▶ Play"}
            </button>
            <button class="btn-rnd" onclick=${randomize}>🎲 Random</button>
          </div>
        </div>

        <div class="beats-toolbar">
          <div class="control-group">
            <label>
              BPM: <strong>${state.bpm}</strong>
              <input
                type="range"
                min="60"
                max="180"
                value=${state.bpm}
                oninput=${(e: InputEvent) => {
                  const val = Number((e.target as HTMLInputElement).value);
                  store.set(STORE_KEY, val, { path: "bpm" });
                }}
              />
            </label>
          </div>

          <div class="control-group">
            <label>
              Master Volume: <strong>${Math.round(state.volume * 100)}%</strong>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value=${state.volume}
                oninput=${(e: InputEvent) => {
                  const val = Number((e.target as HTMLInputElement).value);
                  store.set(STORE_KEY, val, { path: "volume" });
                }}
              />
            </label>
          </div>

          <div class="preset-group">
            <span class="preset-label">Presets:</span>
            <button onclick=${() => applyPreset("house")}>House</button>
            <button onclick=${() => applyPreset("synthwave")}>Synthwave</button>
            <button onclick=${() => applyPreset("trap")}>Trap</button>
            <button onclick=${() => applyPreset("clear")}>Clear</button>
          </div>
        </div>

        <div class="step-indicator-row">
          <div class="track-label-placeholder"></div>
          <div class="step-indicator-grid">
            ${Array.from(
              { length: 16 },
              (_, i) => html`
              <div
                key=${i}
                class="step-indicator ${state.currentStep === i && state.playing ? "active" : ""} ${i % 4 === 0 ? "beat-start" : ""}"
              >
                ${i + 1}
              </div>
            `,
            )}
          </div>
        </div>

        <div class="tracks-container">
          ${state.tracks.map(
            (track: Track) => html`
            <div key=${track.id} class="track-row ${track.muted ? "muted" : ""}">
              <div class="track-meta">
                <span class="track-emoji">${track.emoji}</span>
                <span class="track-name" style="color: ${track.color}">${track.name}</span>
                <div class="track-actions">
                  <button
                    class="btn-mute ${track.muted ? "is-muted" : ""}"
                    title="${track.muted ? "Unmute track" : "Mute track"}"
                    onclick=${() => toggleMute(track.id)}
                  >
                    ${track.muted ? "🔇" : "🔊"}
                  </button>
                  <button
                    class="btn-track-clear"
                    title="Clear track pattern"
                    onclick=${() => clearTrack(track.id)}
                  >
                    ×
                  </button>
                </div>
              </div>

              <div class="step-buttons-grid">
                ${track.steps.map(
                  (active: boolean, stepIdx: number) => html`
                  <button
                    key=${stepIdx}
                    class="step-btn ${active ? "active" : ""} ${state.currentStep === stepIdx && state.playing ? "playing" : ""} ${stepIdx % 4 === 0 ? "beat-accent" : ""}"
                    style="${active ? `background: ${track.color}; border-color: ${track.color};` : ""}"
                    onclick=${() => toggleStep(track.id, stepIdx)}
                  ></button>
                `,
                )}
              </div>
            </div>
          `,
          )}
        </div>

        <p class="hint">
          Web Audio API synthesis · 16 steps · 5 instruments · 0 external assets · 60fps playhead DOM diffing
        </p>
      </div>
    `;
  };
});

define("x-beats-page", () => {
  return () => html`<x-beats></x-beats>`;
});
