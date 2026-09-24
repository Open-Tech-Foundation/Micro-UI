const DEMO_TAGS = [
  "x-micro-ui-kanban",
  "x-micro-ui-canvas-pad",
  "x-micro-ui-gradient-mixer",
  "x-micro-ui-gravity-lab",
  "x-micro-ui-poll-board",
  "x-micro-ui-hero-preview",
];

const MICRO_UI_CDN = "https://esm.sh/@opentf/micro-ui?min";

async function registerMicroUiDemos() {
  if (DEMO_TAGS.every((tag) => customElements.get(tag))) return;

  const { define, html, onReady, update } = await import(MICRO_UI_CDN);

  if (!customElements.get(DEMO_TAGS[0])) {
    define(DEMO_TAGS[0], (el) => {
      // ── Kanban: keyed cards moving across columns ──────────────────────
      // One keyed list per column; a card moving ‹ › keeps its node while its
      // parent changes, which is the reconciler behavior this card exists to
      // show. New cards land in Now.
      let draft = "";
      let nextId = 6;
      let columns = [
        {
          id: "now",
          title: "Now",
          cards: [
            { id: 1, label: "Ship a focused interaction" },
            { id: 2, label: "Keep the bundle easy to understand" },
          ],
        },
        {
          id: "next",
          title: "Next",
          cards: [
            { id: 3, label: "Let the browser do the work" },
            { id: 4, label: "Write the release notes" },
          ],
        },
        { id: "done", title: "Done", cards: [{ id: 5, label: "Define the API" }] },
      ];

      const count = () => columns.reduce((n, c) => n + c.cards.length, 0);
      const addCard = () => {
        const label = draft.trim();
        if (!label) return;
        columns = columns.map((c) =>
          c.id === "now" ? { ...c, cards: [...c.cards, { id: nextId++, label }] } : c,
        );
        draft = "";
        update(el);
      };
      const moveCard = (id, dir) => {
        const at = columns.findIndex((c) => c.cards.some((k) => k.id === id));
        const to = at + dir;
        if (at === -1 || to < 0 || to >= columns.length) return;
        const card = columns[at].cards.find((k) => k.id === id);
        columns = columns.map((c, i) => {
          if (i === at) return { ...c, cards: c.cards.filter((k) => k.id !== id) };
          if (i === to) return { ...c, cards: [...c.cards, card] };
          return c;
        });
        update(el);
      };
      const removeCard = (id) => {
        columns = columns.map((c) => ({ ...c, cards: c.cards.filter((k) => k.id !== id) }));
        update(el);
      };

      return () => html`
        <section class="micro-demo-card kanban-demo" aria-label="Kanban micro-app">
          <div class="micro-demo-topline">
            <div>
              <span class="micro-demo-kicker">Keyed lists</span>
              <h3>Kanban</h3>
            </div>
            <span class="micro-demo-count">${count()} cards</span>
          </div>
          <form class="micro-demo-form" onsubmit=${(event) => { event.preventDefault(); addCard(); }}>
            <input aria-label="New card" placeholder="Add a card to Now..." value=${draft} oninput=${(event) => { draft = event.currentTarget.value; }} />
            <button type="submit">Add</button>
          </form>
          <div class="kanban-cols">
            ${columns.map((col, ci) => html`
              <div class="kanban-col" key=${col.id}>
                <div class="kanban-col-head"><span>${col.title}</span><em>${col.cards.length}</em></div>
                <ul class="kanban-list">
                  ${col.cards.length
                    ? col.cards.map((card) => html`
                        <li key=${card.id}>
                          <span>${card.label}</span>
                          <span class="kanban-moves">
                            <button type="button" aria-label=${`Move ${card.label} left`} disabled=${ci === 0} onclick=${() => moveCard(card.id, -1)}>‹</button>
                            <button type="button" aria-label=${`Move ${card.label} right`} disabled=${ci === columns.length - 1} onclick=${() => moveCard(card.id, 1)}>›</button>
                            <button type="button" aria-label=${`Remove ${card.label}`} onclick=${() => removeCard(card.id)}>×</button>
                          </span>
                        </li>
                      `)
                    : html`<li class="kanban-empty">Empty.</li>`}
                </ul>
              </div>
            `)}
          </div>
        </section>
      `;
    });
  }

  if (!customElements.get(DEMO_TAGS[1])) {
    define(DEMO_TAGS[1], (el) => {
      let strokes = 0;
      let color = "#ff9672";
      let brushSize = 4;
      const palette = ["#ff9672", "#75e2f2", "#8af2b8", "#c9bcff", "#fff2a8"];

      onReady(() => {
        const canvas = el.querySelector("canvas");
        const context = canvas.getContext("2d");
        let drawing = false;

        const point = (event) => {
          const bounds = canvas.getBoundingClientRect();
          return {
            x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
            y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
          };
        };
        const start = (event) => {
          drawing = true;
          canvas.setPointerCapture?.(event.pointerId);
          const { x, y } = point(event);
          context.beginPath();
          context.moveTo(x, y);
        };
        const draw = (event) => {
          if (!drawing) return;
          const { x, y } = point(event);
          context.lineTo(x, y);
          context.strokeStyle = color;
          context.lineWidth = brushSize;
          context.lineCap = "round";
          context.stroke();
        };
        const end = () => {
          if (!drawing) return;
          drawing = false;
          strokes += 1;
          update(el);
        };

        canvas.addEventListener("pointerdown", start);
        canvas.addEventListener("pointermove", draw);
        canvas.addEventListener("pointerup", end);
        canvas.addEventListener("pointercancel", end);
        return () => {
          canvas.removeEventListener("pointerdown", start);
          canvas.removeEventListener("pointermove", draw);
          canvas.removeEventListener("pointerup", end);
          canvas.removeEventListener("pointercancel", end);
        };
      });

      const clear = () => {
        const canvas = el.querySelector("canvas");
        canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
        strokes = 0;
        update(el);
      };

      return () => html`
        <section class="micro-demo-card canvas-demo" aria-label="Canvas sketchpad micro-app">
          <div class="micro-demo-topline">
            <div><span class="micro-demo-kicker">Canvas + lifecycle</span><h3>Sketchpad</h3></div>
            <span class="micro-demo-count">${strokes} strokes</span>
          </div>
          <canvas class="sketch-canvas" width="500" height="180" aria-label="Draw on the canvas"></canvas>
          <div class="sketch-tools">
            <div class="sketch-palette" role="group" aria-label="Ink color">
              <span>Ink</span>
              ${palette.map((ink) => html`<button type="button" class=${color === ink ? "is-active" : ""} style=${`--swatch:${ink}`} aria-label=${`Use ${ink} ink`} aria-pressed=${color === ink} onclick=${() => { color = ink; update(el); }} />`)}
            </div>
            <div class="brush-sizes" role="group" aria-label="Brush size">
              <span>Brush</span>
              ${[2, 5, 10].map((size) => html`<button type="button" class=${brushSize === size ? "is-active" : ""} aria-label=${`Use ${size}px brush`} aria-pressed=${brushSize === size} onclick=${() => { brushSize = size; update(el); }}>${size}</button>`)}
            </div>
            <button type="button" onclick=${clear}>Clear</button>
          </div>
          <p class="micro-demo-caption">Pick an ink, change the brush, and draw directly on the native canvas.</p>
        </section>
      `;
    });
  }

  if (!customElements.get(DEMO_TAGS[2])) {
    define(DEMO_TAGS[2], (el) => {
      let start = "#ff6b35";
      let end = "#536dfe";
      let angle = 135;

      return () => html`
          <section class="micro-demo-card gradient-demo" aria-label="Gradient mixer micro-app">
            <div class="micro-demo-topline">
              <div><span class="micro-demo-kicker">Inputs + derived style</span><h3>Gradient mixer</h3></div>
              <span class="micro-demo-count">${angle}°</span>
            </div>
            <div class="gradient-preview" style=${`background:linear-gradient(${angle}deg,${start},${end})`}><span>live preview</span></div>
            <div class="gradient-fields">
              <label>Start <input type="color" value=${start} aria-label="Gradient start color" oninput=${(event) => { start = event.currentTarget.value; update(el); }} /></label>
              <label>End <input type="color" value=${end} aria-label="Gradient end color" oninput=${(event) => { end = event.currentTarget.value; update(el); }} /></label>
            </div>
            <label class="gradient-angle">Angle <input type="range" min="0" max="360" value=${angle} oninput=${(event) => { angle = Number(event.currentTarget.value); update(el); }} /><output>${angle}°</output></label>
            <code class="gradient-code">linear-gradient(${angle}deg, ${start}, ${end})</code>
            <p class="micro-demo-caption">Two native color inputs and one range derive the preview and CSS string.</p>
          </section>
        `;
    });
  }

  if (!customElements.get(DEMO_TAGS[3])) {
    define(DEMO_TAGS[3], (el) => {
      // ── Gravity lab: real-time particle physics on canvas ──────────────
      // Semi-implicit Euler at a fixed 120 Hz step with an accumulator, so the
      // simulation runs at the same speed on 60 Hz and 120 Hz displays.
      // Circle–circle impulse collisions, wall bounces with restitution, an
      // optional pointer attractor/repeller, and drag-to-fling. The canvas is
      // drawn imperatively every frame; update(el) only re-renders the HUD —
      // the reconciler keeps the canvas element (and its pixels) in place.
      const W = 520;
      const H = 200;
      const STEP = 1 / 120;
      const INKS = ["#b8f25a", "#ff9672", "#75e2f2", "#c9bcff"];
      const rand = (min, max) => min + Math.random() * (max - min);

      let gravity = 900;
      const restitution = 0.86;
      const trails = true;
      let running = true;
      let fps = 0;
      let particles = [];

      const spawn = (x, y, burst) => {
        const count = burst ? 6 : 1;
        for (let i = 0; i < count; i++) {
          const r = rand(5, 13);
          particles.push({
            x: x === undefined ? rand(r, W - r) : x + rand(-6, 6),
            y: y === undefined ? rand(r, H - r) : y + rand(-6, 6),
            vx: burst ? rand(-160, 160) : rand(-40, 40),
            vy: burst ? rand(-220, 20) : rand(-20, 20),
            r,
            m: r * r,
            color: INKS[(Math.random() * INKS.length) | 0],
          });
        }
        if (particles.length > 140) particles = particles.slice(-140);
      };
      const resetParticles = (n) => {
        particles = [];
        for (let i = 0; i < n; i++) spawn();
      };
      resetParticles(42);

      const stepWorld = () => {
        for (const p of particles) {
          p.vy += gravity * STEP;
          const drag = 1 - 0.12 * STEP;
          p.vx *= drag;
          p.vy *= drag;
          p.x += p.vx * STEP;
          p.y += p.vy * STEP;
          if (p.x < p.r) { p.x = p.r; p.vx = -p.vx * restitution; }
          if (p.x > W - p.r) { p.x = W - p.r; p.vx = -p.vx * restitution; }
          if (p.y < p.r) { p.y = p.r; p.vy = -p.vy * restitution; }
          if (p.y > H - p.r) { p.y = H - p.r; p.vy = -p.vy * restitution; }
        }
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const a = particles[i];
            const b = particles[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy);
            const min = a.r + b.r;
            if (dist === 0 || dist >= min) continue;
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = (min - dist) / 2;
            a.x -= nx * overlap;
            a.y -= ny * overlap;
            b.x += nx * overlap;
            b.y += ny * overlap;
            const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (rel >= 0) continue;
            const impulse = (-(1 + restitution) * rel) / (1 / a.m + 1 / b.m);
            a.vx -= (impulse / a.m) * nx;
            a.vy -= (impulse / a.m) * ny;
            b.vx += (impulse / b.m) * nx;
            b.vy += (impulse / b.m) * ny;
          }
        }
      };

      onReady(() => {
        const canvas = el.querySelector("canvas");
        const context = canvas.getContext("2d");
        let raf = 0;
        let last = performance.now();
        let acc = 0;
        let frames = 0;
        let meterAt = last;
        let dragged = null;
        let pointer = null;
        let pointerPrev = null;

        const toWorld = (event) => {
          const bounds = canvas.getBoundingClientRect();
          return {
            x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
            y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
          };
        };
        const onDown = (event) => {
          const at = toWorld(event);
          canvas.setPointerCapture?.(event.pointerId);
          dragged = null;
          for (let i = particles.length - 1; i >= 0; i--) {
            if (Math.hypot(particles[i].x - at.x, particles[i].y - at.y) <= particles[i].r + 4) {
              dragged = particles[i];
              break;
            }
          }
          pointer = at;
          pointerPrev = at;
          if (!dragged) {
            spawn(at.x, at.y, true);
            update(el);
          }
        };
        const onMove = (event) => {
          const at = toWorld(event);
          pointerPrev = pointer;
          pointer = at;
          if (dragged && pointerPrev) {
            dragged.x = at.x;
            dragged.y = at.y;
            dragged.vx = ((at.x - pointerPrev.x) / STEP) * 0.12;
            dragged.vy = ((at.y - pointerPrev.y) / STEP) * 0.12;
          }
        };
        const onUp = () => {
          dragged = null;
          pointer = null;
        };
        canvas.addEventListener("pointerdown", onDown);
        canvas.addEventListener("pointermove", onMove);
        canvas.addEventListener("pointerup", onUp);
        canvas.addEventListener("pointercancel", onUp);

        const frame = (now) => {
          raf = requestAnimationFrame(frame);
          const dt = Math.min((now - last) / 1000, 0.05);
          last = now;
          frames += 1;
          if (now - meterAt >= 500) {
            fps = Math.round((frames * 1000) / (now - meterAt));
            frames = 0;
            meterAt = now;
            update(el);
          }
          if (!running) return;
          acc += dt;
          let n = 0;
          while (acc >= STEP && n < 5) {
            stepWorld();
            acc -= STEP;
            n += 1;
          }
          context.fillStyle = "rgba(16, 20, 24, 0.28)";
          context.fillRect(0, 0, W, H);
          for (const p of particles) {
            context.beginPath();
            context.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            context.fillStyle = p.color;
            context.fill();
          }
        };
        context.fillStyle = "#101418";
        context.fillRect(0, 0, W, H);
        raf = requestAnimationFrame(frame);

        return () => {
          cancelAnimationFrame(raf);
          canvas.removeEventListener("pointerdown", onDown);
          canvas.removeEventListener("pointermove", onMove);
          canvas.removeEventListener("pointerup", onUp);
          canvas.removeEventListener("pointercancel", onUp);
        };
      });

      return () => html`
        <section class="micro-demo-card physics-demo" aria-label="Gravity lab micro-app">
          <div class="micro-demo-topline">
            <div><span class="micro-demo-kicker">Canvas + real physics</span><h3>Gravity lab</h3></div>
            <span class="micro-demo-count">${particles.length} · ${fps}fps</span>
          </div>
          <canvas class="gravity-canvas" width="520" height="200" aria-label="Particle physics sandbox. Drag to fling, click to burst."></canvas>
          <div class="physics-controls" role="group" aria-label="Simulation controls">
            <button type="button" class=${running ? "is-active" : ""} aria-pressed=${running} onclick=${() => { running = !running; update(el); }}>${running ? "Pause" : "Run"}</button>
            <button type="button" onclick=${() => { spawn(W / 2, 40, true); update(el); }}>Burst</button>
            <button type="button" onclick=${() => { resetParticles(42); update(el); }}>Reset</button>
          </div>
          <label class="physics-slider">Gravity <input type="range" min="0" max="2000" step="50" value=${gravity} oninput=${(event) => { gravity = Number(event.currentTarget.value); update(el); }} /><output>${gravity}</output></label>
          <p class="micro-demo-caption">Drag a particle to fling it, click empty space for a burst — integrated live at 120 Hz.</p>
        </section>
      `;
    });
  }

  if (!customElements.get(DEMO_TAGS[4])) {
    define(DEMO_TAGS[4], (el) => {
      // ── Poll board: votes, derived bars, live ranks ────────────────────
      // Every vote re-sorts the options, so the keyed rows visibly move while
      // keeping their nodes; the bars and percentages derive from the total.
      let draft = "";
      let nextId = 5;
      let options = [
        { id: 1, label: "Realtime canvas", votes: 12 },
        { id: 2, label: "Form toolkit", votes: 8 },
        { id: 3, label: "DevTools panel", votes: 5 },
        { id: 4, label: "Docs search", votes: 3 },
      ];

      const total = () => options.reduce((n, o) => n + o.votes, 0);
      const ranked = () => [...options].sort((a, b) => b.votes - a.votes);

      const castVote = (id) => {
        options = options.map((o) => (o.id === id ? { ...o, votes: o.votes + 1 } : o));
        update(el);
      };
      const addOption = () => {
        const label = draft.trim();
        if (!label || options.length >= 6) return;
        options = [...options, { id: nextId++, label, votes: 0 }];
        draft = "";
        update(el);
      };

      return () => {
        const votes = total();
        return html`
          <section class="micro-demo-card poll-demo" aria-label="Poll board micro-app">
            <div class="micro-demo-topline">
              <div><span class="micro-demo-kicker">Votes + derived bars</span><h3>Poll board</h3></div>
              <span class="micro-demo-count">${votes} votes</span>
            </div>
            <p class="poll-question">What should we build next?</p>
            <ul class="poll-list">
              ${ranked().map((o, rank) => {
                const pct = votes ? Math.round((o.votes / votes) * 100) : 0;
                return html`
                  <li key=${o.id}>
                    <div class="poll-row">
                      <span class="poll-rank" aria-hidden="true">${rank + 1}</span>
                      <span class="poll-label">${o.label}</span>
                      <span class="poll-pct">${pct}%</span>
                      <button type="button" aria-label=${`Vote for ${o.label}`} onclick=${() => castVote(o.id)}>+1</button>
                    </div>
                    <div class="poll-track" role="img" aria-label=${`${o.label}: ${o.votes} votes, ${pct} percent`}>
                      <span class="poll-fill" style=${`width:${pct}%`} />
                    </div>
                  </li>
                `;
              })}
            </ul>
            <form class="micro-demo-form" onsubmit=${(event) => { event.preventDefault(); addOption(); }}>
              <input aria-label="New poll option" placeholder="Add an option..." value=${draft} oninput=${(event) => { draft = event.currentTarget.value; }} />
              <button type="submit">Add</button>
            </form>
            <p class="micro-demo-caption">Tap +1 — bars, percentages, and ranks update live.</p>
          </section>
        `;
      };
    });
  }

  if (!customElements.get(DEMO_TAGS[5])) {
    define(DEMO_TAGS[5], (el) => {
      let tasks = [
        { id: 1, label: "Keep the API clear", done: true },
        { id: 2, label: "Ship one interaction", done: true },
        { id: 3, label: "Let the browser work", done: false },
      ];

      const toggleTask = (id) => {
        tasks = tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task));
        update(el);
      };

      return () => {
        const completed = tasks.filter((task) => task.done).length;
        const progress = Math.round((completed / tasks.length) * 100);

        return html`
          <div class="hero-mini-app">
            <div class="hero-mini-app__header">
              <span class="hero-mini-app__window"><i /><i /><i /></span>
              <span>micro-app / queue</span>
              <strong>LIVE</strong>
            </div>
            <div class="hero-mini-app__title">Build queue</div>
            <div class="hero-mini-app__progress"><span style=${`width:${progress}%`} /></div>
            <div class="hero-mini-app__stats"><span>${tasks.length} tasks</span><strong>${progress}%</strong></div>
            <ul class="hero-mini-app__tasks">
              ${tasks.map((task) => html`
                <li key=${task.id}>
                  <button type="button" aria-label=${`${task.done ? "Mark incomplete" : "Complete"}: ${task.label}`} onclick=${() => toggleTask(task.id)}>
                    <span class=${task.done ? "is-done" : "is-active"}>${task.done ? "✓" : "•"}</span>
                    <span>${task.label}</span>
                  </button>
                </li>
              `)}
            </ul>
            <span class="hero-mini-app__caption">Micro-UI micro-app · live preview</span>
          </div>
        `;
      };
    });
  }
}

// SSG renders the host elements without browser globals. The custom elements
// register only in the client and upgrade the already-rendered hosts.
if (typeof window !== "undefined") void registerMicroUiDemos();

export function MicroUiShowcase() {
  return <x-micro-ui-kanban />;
}

// Every gallery app lives inside an OS-style window frame: traffic lights and
// a title bar drawn by the site, the Micro-UI element as the window body. One
// wrapper for all six keeps the chrome identical without touching the demo
// definitions above.
export function AppWindow({ title, children }) {
  return (
    <div className="os-window" role="group" aria-label={`${title} micro-app window`}>
      <div className="os-window-bar" aria-hidden="true">
        <span className="os-window-lights"><i /><i /><i /></span>
        <span className="os-window-title">{title}</span>
      </div>
      <div className="os-window-body">{children}</div>
    </div>
  );
}

export default function MicroAppsGallery() {
  return (
    <div className="micro-apps-grid">
      <article className="micro-app-card micro-app-card--wide micro-app-card--kanban">
        <AppWindow title="Kanban">
          <MicroUiShowcase />
        </AppWindow>
        <div className="micro-app-caption"><strong>01 / Kanban</strong><span>Keyed cards · columns · moves</span></div>
      </article>
      <article className="micro-app-card micro-app-card--canvas">
        <AppWindow title="Sketchpad">
          <x-micro-ui-canvas-pad />
        </AppWindow>
        <div className="micro-app-caption"><strong>02 / Sketchpad</strong><span>Canvas · brushes · color palette</span></div>
      </article>
      <article className="micro-app-card micro-app-card--gradient">
        <AppWindow title="Gradient mixer">
          <x-micro-ui-gradient-mixer />
        </AppWindow>
        <div className="micro-app-caption"><strong>03 / Gradient mixer</strong><span>Color inputs · ranges · derived CSS</span></div>
      </article>
      <article className="micro-app-card micro-app-card--physics">
        <AppWindow title="Gravity lab">
          <x-micro-ui-gravity-lab />
        </AppWindow>
        <div className="micro-app-caption"><strong>04 / Gravity lab</strong><span>Real physics · canvas loop · fling</span></div>
      </article>
      <article className="micro-app-card micro-app-card--poll">
        <AppWindow title="Poll board">
          <x-micro-ui-poll-board />
        </AppWindow>
        <div className="micro-app-caption"><strong>05 / Poll board</strong><span>Votes · live bars · ranks</span></div>
      </article>
    </div>
  );
}
