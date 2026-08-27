import { define, html, onReady, update } from "@opentf/micro-ui";

// ── simulation primitives ──────────────────────────────────────────

type Vec2 = { x: number; y: number };

type Body = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  color: string;
  trail: Vec2[];
  fixed: boolean;
};

type Sim = {
  bodies: Body[];
  G: number;
  damping: number;
  width: number;
  height: number;
  paused: boolean;
  lastT: number;
  nextId: number;
};

const W = 640;
const H = 400;

const PALETTE = [
  "#38bdf8",
  "#f472b6",
  "#fbbf24",
  "#4ade80",
  "#a78bfa",
  "#fb7185",
];

let nextId = 1;

function makeBody(
  x: number,
  y: number,
  vx: number,
  vy: number,
  mass: number,
  fixed = false,
): Body {
  return {
    id: nextId++,
    x,
    y,
    vx,
    vy,
    mass,
    color: PALETTE[(nextId - 1) % PALETTE.length]!,
    trail: [],
    fixed,
  };
}

function reset(sim: Sim, preset: string) {
  sim.bodies = [];
  sim.G = 1.2;
  sim.damping = 1;
  sim.paused = false;
  sim.lastT = 0;
  nextId = 1;

  const cx = W / 2;
  const cy = H / 2;

  if (preset === "binary") {
    sim.bodies.push(
      makeBody(cx - 80, cy, 0, 1.6, 40, true),
      makeBody(cx + 80, cy, 0, -1.6, 40, true),
      makeBody(cx, cy - 6, 1.4, 0, 2),
      makeBody(cx, cy + 6, -1.4, 0, 2),
    );
  } else if (preset === "orbit") {
    sim.bodies.push(makeBody(cx, cy, 0, 0, 200, true));
    sim.bodies.push(makeBody(cx + 140, cy, 0, 1.55, 2));
    sim.bodies.push(makeBody(cx + 220, cy, 0, 1.2, 1.5));
    sim.bodies.push(makeBody(cx - 180, cy, 0, -1.4, 3));
  } else if (preset === "cluster") {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const r = 90 + Math.random() * 30;
      sim.bodies.push(
        makeBody(
          cx + Math.cos(a) * r,
          cy + Math.sin(a) * r,
          -Math.sin(a) * 0.8,
          Math.cos(a) * 0.8,
          4 + Math.random() * 4,
        ),
      );
    }
  } else {
    // solar — sun + 3 planets
    sim.bodies.push(makeBody(cx, cy, 0, 0, 400, true));
    sim.bodies.push(makeBody(cx + 90, cy, 0, 2.2, 2));
    sim.bodies.push(makeBody(cx + 160, cy, 0, 1.6, 5));
    sim.bodies.push(makeBody(cx + 240, cy, 0, 1.3, 8));
  }
}

function step(sim: Sim, dt: number) {
  if (sim.paused) return;
  const bodies = sim.bodies;
  const ax = new Array(bodies.length).fill(0);
  const ay = new Array(bodies.length).fill(0);

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]!;
      const b = bodies[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy + 200; // softening to avoid singularities
      const d = Math.sqrt(d2);
      const f = (sim.G * a.mass * b.mass) / d2;
      const fx = (f * dx) / d;
      const fy = (f * dy) / d;
      ax[i] = ax[i]! + fx / a.mass;
      ay[i] = ay[i]! + fy / a.mass;
      ax[j] = ax[j]! - fx / b.mass;
      ay[j] = ay[j]! - fy / b.mass;
    }
  }

  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i]!;
    if (b.fixed) continue;
    b.vx = (b.vx + ax[i]! * dt) * sim.damping;
    b.vy = (b.vy + ay[i]! * dt) * sim.damping;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // trail
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 60) b.trail.shift();

    // wrap walls
    if (b.x < 0) b.x += W;
    else if (b.x > W) b.x -= W;
    if (b.y < 0) b.y += H;
    else if (b.y > H) b.y -= H;
  }
}

// ── shared sim instance (via store pattern) ────────────────────────

const sim: Sim = {
  bodies: [],
  G: 1.2,
  damping: 1,
  width: W,
  height: H,
  paused: false,
  lastT: 0,
  nextId: 1,
};
reset(sim, "solar");

// ── component: x-gravity (canvas + sim) ────────────────────────────

define("x-gravity", (el) => {
  let preset = "solar";
  let speed = 1;
  let showTrails = true;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let raf = 0;
  let lastFrame = performance.now();

  onReady(() => {
    canvas = el.querySelector("canvas") as HTMLCanvasElement | null;
    ctx = canvas?.getContext("2d") ?? null;
    sim.G = 1.2;
    sim.damping = 1;
    sim.paused = false;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - lastFrame) / 16.67) * speed;
      lastFrame = now;
      step(sim, dt);
      draw();
    };
    raf = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(raf);
  });

  const draw = () => {
    if (!ctx || !canvas) return;
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = "rgba(148,163,184,0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // trails
    if (showTrails) {
      for (const b of sim.bodies) {
        if (b.trail.length < 2) continue;
        const first = b.trail[0]!;
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < b.trail.length; i++) {
          const p = b.trail[i]!;
          ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = b.color + "55";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // bodies
    for (const b of sim.bodies) {
      const r = Math.max(3, Math.sqrt(b.mass) * 1.6);
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = b.fixed ? 18 : 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  };

  const applyPreset = (p: string) => {
    preset = p;
    reset(sim, p);
    update(el);
  };

  return () => html`
    <div class="card gravity-card">
      <h3>Gravity Simulator</h3>
      <p class="hint">N-body Newtonian gravity. Click on the canvas to add a body.</p>

      <canvas
        width=${W}
        height=${H}
        class="gravity-canvas"
        onclick=${(e: MouseEvent) => {
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const sx = W / rect.width;
          const sy = H / rect.height;
          const x = (e.clientX - rect.left) * sx;
          const y = (e.clientY - rect.top) * sy;
          sim.bodies.push(makeBody(x, y, 0, 0, 6));
          update(el);
        }}
      ></canvas>

      <div class="gravity-controls">
        <div class="btn-row">
          <button class="${preset === "solar" ? "active" : ""}" onclick=${() => applyPreset("solar")}>Solar</button>
          <button class="${preset === "orbit" ? "active" : ""}" onclick=${() => applyPreset("orbit")}>Orbits</button>
          <button class="${preset === "binary" ? "active" : ""}" onclick=${() => applyPreset("binary")}>Binary</button>
          <button class="${preset === "cluster" ? "active" : ""}" onclick=${() => applyPreset("cluster")}>Cluster</button>
        </div>

        <div class="gravity-row">
          <label>
            Speed
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value=${speed}
              oninput=${(e: InputEvent) => {
                speed = Number((e.target as HTMLInputElement).value);
                update(el);
              }}
            />
          </label>
          <label>
            Gravity G
            <input
              type="range"
              min="0"
              max="4"
              step="0.1"
              value=${sim.G}
              oninput=${(e: InputEvent) => {
                sim.G = Number((e.target as HTMLInputElement).value);
                update(el);
              }}
            />
          </label>
          <label>
            Damping
            <input
              type="range"
              min="0.98"
              max="1.001"
              step="0.001"
              value=${sim.damping}
              oninput=${(e: InputEvent) => {
                sim.damping = Number((e.target as HTMLInputElement).value);
                update(el);
              }}
            />
          </label>
        </div>

        <div class="btn-row">
          <button onclick=${() => {
            sim.paused = !sim.paused;
            update(el);
          }}>
            ${sim.paused ? "▶ Resume" : "⏸ Pause"}
          </button>
          <button onclick=${() => {
            showTrails = !showTrails;
            update(el);
          }}>
            ${showTrails ? "Hide trails" : "Show trails"}
          </button>
          <button onclick=${() => applyPreset(preset)}>↻ Reset</button>
          <button onclick=${() => {
            sim.bodies = [];
            update(el);
          }}>Clear</button>
        </div>

        <p class="hint">
          ${sim.bodies.length} body${sim.bodies.length !== 1 ? "s" : ""}
          · G=${sim.G.toFixed(2)}
          · speed=${speed.toFixed(1)}x
          · ${sim.paused ? "paused" : "running"}
        </p>
      </div>
    </div>
  `;
});

// ── page wrapper ───────────────────────────────────────────────────

define("x-gravity-page", (el) => {
  onReady(() => console.log("x-gravity-page ready", el));
  return () => html`<x-gravity></x-gravity>`;
});
