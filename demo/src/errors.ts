import { define, html, onError, onReady, update } from "@opentf/micro-ui";

// ── shared log buffer so users can see what onError caught ─────────

const errorLog: Array<{
  tag: string;
  message: string;
  phase: string;
  at: number;
}> = [];

function logError(tag: string, err: Error, phase: string) {
  errorLog.unshift({ tag, message: err.message, phase, at: Date.now() });
  if (errorLog.length > 20) errorLog.length = 20;
}

// ── 1. Counter that can be made to throw on update ────────────────

define("x-throws-on-update", (el) => {
  let n = 0;
  let armNext = false;

  onError((target, err, phase) => {
    logError(target.tagName.toLowerCase(), err as Error, phase);
    // Re-render the demo page wrapper so the log list updates too.
    update(document.querySelector("x-errors-page") as HTMLElement);
  });

  onReady(() => {
    el.addEventListener("arm", () => {
      armNext = true;
    });
    el.addEventListener("reset", () => {
      n = 0;
      armNext = false;
      update(el);
    });
  });

  return () => {
    if (armNext) {
      armNext = false;
      throw new Error("intentional throw from x-throws-on-update");
    }
    return html`
      <div class="card">
        <h3>Throws on next update</h3>
        <p class="count">${n}</p>
        <div class="btn-row">
          <button class="ui-btn ui-btn-secondary" onclick=${() => {
            n++;
            update(el);
          }}>+1 (safe)</button>
          <button class="ui-btn ui-btn-danger" onclick=${() => el.dispatchEvent(new Event("arm"))}>
            Arm throw
          </button>
        </div>
        <p class="hint">armed counter will throw on the next render</p>
      </div>
    `;
  };
});

// ── 2. Counter that throws on every render after a kill switch ────

define("x-breaks-after-3", (el) => {
  let n = 0;

  onError((target, err, phase) => {
    logError(target.tagName.toLowerCase(), err as Error, phase);
    update(document.querySelector("x-errors-page") as HTMLElement);
  });

  onReady(() => {
    el.addEventListener("recover", () => {
      n = 0;
      // The library marks the instance errored after the throw, so
      // re-rendering wouldn't re-run our render. We rebuild via
      // remove + recreate to demonstrate full recovery.
      const parent = el.parentNode!;
      parent.removeChild(el);
      const fresh = document.createElement("x-breaks-after-3");
      parent.appendChild(fresh);
    });
  });

  return () => {
    if (n > 3) {
      throw new Error("n exceeded 3 — going down");
    }
    return html`
      <div class="card">
        <h3>Breaks after 3</h3>
        <p class="count">${n}</p>
        <div class="btn-row">
          <button class="ui-btn ui-btn-secondary" onclick=${() => {
            n++;
            update(el);
          }}>+1</button>
          <button class="ui-btn ui-btn-danger" onclick=${() => el.dispatchEvent(new Event("recover"))}>
            Recover
          </button>
        </div>
        <p class="hint">throws on the 4th render; recover rebuilds the element</p>
      </div>
    `;
  };
});

// ── 3. Plain counter — proves siblings keep updating ───────────────

define("x-isolation-proof", (el) => {
  let n = 0;
  onReady(() => {
    const id = setInterval(() => {
      n++;
      update(el);
    }, 1000);
    return () => clearInterval(id);
  });
  return () => html`
    <div class="card">
      <h3>Healthy sibling</h3>
      <p class="timer">${n}s</p>
      <p class="hint">this keeps ticking even if the other cards throw</p>
    </div>
  `;
});

// ── 4. Manual error trigger — forces a throw on the next render ────

define("x-throw-now", (el) => {
  let primed = false;
  onError((target, err, phase) => {
    logError(target.tagName.toLowerCase(), err as Error, phase);
    update(document.querySelector("x-errors-page") as HTMLElement);
  });
  onReady(() => {
    el.addEventListener("prime", () => {
      primed = true;
      update(el);
    });
  });
  return () => {
    if (primed) {
      primed = false;
      throw new Error("primed throw");
    }
    return html`
      <div class="card">
        <h3>One-shot throw</h3>
        <div class="btn-row">
          <button class="ui-btn ui-btn-danger" onclick=${() => el.dispatchEvent(new Event("prime"))}>
            Throw now
          </button>
        </div>
        <p class="hint">throws on the very next render</p>
      </div>
    `;
  };
});

// ── page wrapper ───────────────────────────────────────────────────

define("x-errors-page", (el) => {
  onReady(() => console.log("x-errors-page ready", el));

  const clearLog = () => {
    errorLog.length = 0;
    update(el);
  };

  return () => html`
    <section class="grid">
      <x-isolation-proof></x-isolation-proof>
      <x-throws-on-update></x-throws-on-update>
      <x-breaks-after-3></x-breaks-after-3>
      <x-throw-now></x-throw-now>
    </section>

    <section class="card error-log-card">
      <h3>onError log</h3>
      <p class="hint">
        Each card registers <code>onError((target, err, phase) =&gt; …)</code>
        and pushes the failure here. The host page keeps running.
      </p>
      <div class="btn-row" style="margin-bottom:.75rem">
        <button class="ui-btn ui-btn-ghost" onclick=${clearLog} disabled=${errorLog.length === 0}>Clear log</button>
        <span class="hint">${errorLog.length} entr${errorLog.length === 1 ? "y" : "ies"}</span>
      </div>
      ${
        errorLog.length === 0
          ? html`<p class="hint">no errors yet — try the buttons above</p>`
          : html`
          <ul class="error-log">
            ${errorLog.map(
              (e) => html`
              <li class="error-log-item" key=${String(e.at)}>
                <span class="error-tag">&lt;${e.tag}&gt;</span>
                <span class="error-phase">[${e.phase}]</span>
                <span class="error-msg">${e.message}</span>
              </li>
            `,
            )}
          </ul>
        `
      }
    </section>
  `;
});
