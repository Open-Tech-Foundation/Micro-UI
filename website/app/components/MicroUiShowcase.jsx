const DEMO_TAGS = [
  "x-micro-ui-build-queue",
  "x-micro-ui-focus-timer",
  "x-micro-ui-motion-lab",
  "x-micro-ui-canvas-pad",
  "x-micro-ui-gradient-mixer",
  "x-micro-ui-hero-preview",
];

const MICRO_UI_CDN = "https://esm.sh/@opentf/micro-ui?min";

async function registerMicroUiDemos() {
  if (DEMO_TAGS.every((tag) => customElements.get(tag))) return;

  const { define, html, onReady, update } = await import(MICRO_UI_CDN);

  if (!customElements.get(DEMO_TAGS[0])) {
    define(DEMO_TAGS[0], (el) => {
      let filter = "all";
      let draft = "";
      let nextId = 4;
      let items = [
        { id: 1, label: "Ship a focused interaction", done: true },
        { id: 2, label: "Keep the bundle easy to understand", done: false },
        { id: 3, label: "Let the browser do the work", done: false },
      ];

      const visibleItems = () =>
        items.filter((item) => filter === "all" || (filter === "done" ? item.done : !item.done));

      const addItem = () => {
        const label = draft.trim();
        if (!label) return;
        items = [...items, { id: nextId++, label, done: false }];
        draft = "";
        update(el);
      };

      const toggleItem = (id) => {
        items = items.map((item) => (item.id === id ? { ...item, done: !item.done } : item));
        update(el);
      };

      const removeItem = (id) => {
        items = items.filter((item) => item.id !== id);
        update(el);
      };

      return () => {
        const visible = visibleItems();
        const completed = items.filter((item) => item.done).length;

        return html`
          <section class="micro-demo-card" aria-label="Build queue micro-app">
            <div class="micro-demo-topline">
              <div>
                <span class="micro-demo-kicker">Keyed list</span>
                <h3>Build queue</h3>
              </div>
              <span class="micro-demo-count">${completed}/${items.length}</span>
            </div>
            <form class="micro-demo-form" onsubmit=${(event) => { event.preventDefault(); addItem(); }}>
              <input aria-label="New build queue item" placeholder="Add a small task..." value=${draft} oninput=${(event) => { draft = event.currentTarget.value; }} />
              <button type="submit">Add</button>
            </form>
            <div class="micro-demo-filters" role="group" aria-label="Filter build queue">
              ${["all", "active", "done"].map((name) => html`
                <button type="button" class=${filter === name ? "is-active" : ""} aria-pressed=${filter === name} onclick=${() => { filter = name; update(el); }}>${name}</button>
              `)}
            </div>
            <ul class="micro-demo-list">
              ${visible.length
                ? visible.map((item) => html`
                    <li class=${item.done ? "is-done" : ""} key=${item.id}>
                      <button class="micro-demo-check" type="button" aria-label=${item.done ? `Mark ${item.label} active` : `Complete ${item.label}`} onclick=${() => toggleItem(item.id)}>${item.done ? "✓" : ""}</button>
                      <span>${item.label}</span>
                      <button class="micro-demo-remove" type="button" aria-label=${`Remove ${item.label}`} onclick=${() => removeItem(item.id)}>×</button>
                    </li>
                  `)
                : html`<li class="micro-demo-empty">Nothing in this view yet.</li>`}
            </ul>
          </section>
        `;
      };
    });
  }

  if (!customElements.get(DEMO_TAGS[1])) {
    define(DEMO_TAGS[1], (el) => {
      let seconds = 25 * 60;
      let running = false;

      onReady(() => {
        const timer = setInterval(() => {
          if (!running || seconds === 0) return;
          seconds -= 1;
          if (seconds === 0) running = false;
          update(el);
        }, 1000);
        return () => clearInterval(timer);
      });

      const clock = () => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

      return () => html`
        <section class="micro-demo-card timer-demo" aria-label="Focus timer micro-app">
          <div class="micro-demo-topline">
            <div><span class="micro-demo-kicker">Lifecycle + updates</span><h3>Focus timer</h3></div>
            <span class="micro-demo-count">${running ? "running" : "paused"}</span>
          </div>
          <div class="timer-face">${clock()}</div>
          <div class="timer-actions">
            <button type="button" class="timer-primary" onclick=${() => { running = !running; update(el); }}>${running ? "Pause" : "Start"}</button>
            <button type="button" onclick=${() => { seconds = 25 * 60; running = false; update(el); }}>Reset</button>
          </div>
          <p class="micro-demo-caption">The interval is cleaned up when this element leaves the page.</p>
        </section>
      `;
    });
  }

  if (!customElements.get(DEMO_TAGS[2])) {
    define(DEMO_TAGS[2], (el) => {
      let running = true;
      let easing = "spring";
      let duration = 2.2;

      return () => html`
        <section class="micro-demo-card motion-demo" aria-label="Easing lab micro-app">
          <div class="micro-demo-topline">
            <div><span class="micro-demo-kicker">Animation + state</span><h3>Easing lab</h3></div>
            <span class="micro-demo-count">${running ? "playing" : "paused"}</span>
          </div>
          <div class=${`easing-stage easing-${easing} ${running ? "is-running" : ""}`} style=${`--easing-duration:${duration}s`}>
            <div class="easing-ruler"><i /><i /><i /><i /><i /></div>
            <div class="easing-track"><span class="easing-ball" /></div>
            <span class="easing-label">${easing} / ${duration}s</span>
          </div>
          <div class="motion-controls" role="group" aria-label="Animation controls">
            <button type="button" class=${`motion-toggle ${running ? "is-active" : ""}`} aria-label=${running ? "Pause animation" : "Play animation"} title=${running ? "Pause animation" : "Play animation"} onclick=${() => { running = !running; update(el); }}><span class="motion-control-icon" aria-hidden="true">${running ? "Ⅱ" : "▶"}</span><span>${running ? "Pause" : "Play"}</span></button>
            <button type="button" class=${easing === "spring" ? "is-active" : ""} onclick=${() => { easing = "spring"; running = true; update(el); }}>Spring</button>
            <button type="button" class=${easing === "ease" ? "is-active" : ""} onclick=${() => { easing = "ease"; running = true; update(el); }}>Ease</button>
            <button type="button" class=${easing === "steps" ? "is-active" : ""} onclick=${() => { easing = "steps"; running = true; update(el); }}>Steps</button>
          </div>
          <label class="motion-speed">Duration <input type="range" min="1" max="4" step=".1" value=${duration} oninput=${(event) => { duration = Number(event.currentTarget.value); update(el); }} /></label>
          <p class="micro-demo-caption">Swap easing curves and duration while the host keeps the animation local.</p>
        </section>
      `;
    });
  }

  if (!customElements.get(DEMO_TAGS[3])) {
    define(DEMO_TAGS[3], (el) => {
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

  if (!customElements.get(DEMO_TAGS[4])) {
    define(DEMO_TAGS[4], (el) => {
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
  return <x-micro-ui-build-queue />;
}

export default function MicroAppsGallery() {
  return (
    <div className="micro-apps-grid">
      <article className="micro-app-card micro-app-card--wide micro-app-card--queue">
        <MicroUiShowcase />
        <div className="micro-app-caption"><strong>01 / Build queue</strong><span>Keyed lists · filtering · forms</span></div>
      </article>
      <article className="micro-app-card micro-app-card--timer">
        <x-micro-ui-focus-timer />
        <div className="micro-app-caption"><strong>02 / Focus timer</strong><span>Lifecycle · intervals · cleanup</span></div>
      </article>
      <article className="micro-app-card micro-app-card--motion">
        <x-micro-ui-motion-lab />
        <div className="micro-app-caption"><strong>03 / Easing lab</strong><span>Animation · curves · range input</span></div>
      </article>
      <article className="micro-app-card micro-app-card--canvas">
        <x-micro-ui-canvas-pad />
        <div className="micro-app-caption"><strong>04 / Sketchpad</strong><span>Canvas · brushes · color palette</span></div>
      </article>
      <article className="micro-app-card micro-app-card--gradient">
        <x-micro-ui-gradient-mixer />
        <div className="micro-app-caption"><strong>05 / Gradient mixer</strong><span>Color inputs · ranges · derived CSS</span></div>
      </article>
    </div>
  );
}
