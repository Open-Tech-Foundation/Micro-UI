// The on-page error box must not leak a thrown error's message unless the app
// explicitly opted in via mount(el, tag, { dev: true }). The full error always
// reaches the console and any onError handler either way.
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";

function uniqueTag(p) {
  return `${p}-${Math.random().toString(36).slice(2, 9)}`;
}
function tick() {
  return new Promise((r) => queueMicrotask(r));
}
// devMode is page-global by design — one app, one setting — and bun ignores
// the ?query on dynamic imports, so every suite in this process shares it.
// Each case therefore sets the mode it needs rather than assuming a default.
let n = 0;
function fresh() {
  return import(`../../src/index.ts?err-ui-${Date.now()}-${n++}`);
}
function setDev(mod, on) {
  mod.mount(document.createElement("div"), "x-dev-probe", { dev: on });
}

const SECRET = "GET /api?token=sk_live_a91f -> 500";

async function boom(mod, opts) {
  const tag = uniqueTag("x-err");
  const host = document.createElement("div");
  document.body.appendChild(host);
  mod.define(tag, () => {
    throw new Error(SECRET);
  });
  const el =
    opts === undefined
      ? (host.appendChild(document.createElement(tag)), host.firstChild)
      : mod.mount(host, tag, opts);
  await tick();
  return el;
}

test("error UI: the message is not rendered when the app has not opted in", async () => {
  const mod = await fresh();
  setDev(mod, false);
  const el = await boom(mod);
  const box = el.querySelector("[data-micro-ui-error]");
  assert.ok(box, "the error box still mounts");
  assert.equal(box.textContent, "Something went wrong.");
  assert.equal(el.textContent.includes("sk_live"), false, "no leak");
});

test("error UI: mount({ dev: true }) shows the real message", async () => {
  const mod = await fresh();
  const el = await boom(mod, { dev: true });
  assert.equal(el.querySelector("[data-micro-ui-error]").textContent, SECRET);
});

test("error UI: mount({ dev: false }) is explicit about staying quiet", async () => {
  const mod = await fresh();
  const el = await boom(mod, { dev: false });
  assert.equal(
    el.querySelector("[data-micro-ui-error]").textContent,
    "Something went wrong.",
  );
});

test("error UI: mount() with no dev option leaves the current mode alone", async () => {
  const mod = await fresh();
  setDev(mod, false);
  const el = await boom(mod, {});
  assert.equal(
    el.querySelector("[data-micro-ui-error]").textContent,
    "Something went wrong.",
  );
});

test("error UI: the full error always reaches the console", async () => {
  const mod = await fresh();
  setDev(mod, false);
  const real = console.error;
  const lines = [];
  console.error = (...a) => lines.push(a);
  try {
    await boom(mod);
  } finally {
    console.error = real;
  }
  const flat = lines.flat();
  assert.ok(
    flat.some((a) => a instanceof Error && a.message === SECRET),
    "the Error object itself is logged, not a redacted string",
  );
  assert.ok(
    lines.some((l) => String(l[0]).includes("{ dev: true }")),
    "and the developer is told how to see it in the page",
  );
});

test("error UI: onError receives the real error regardless of dev mode", async () => {
  const mod = await fresh();
  setDev(mod, false);
  const tag = uniqueTag("x-err-hook");
  let seen = null;
  mod.define(tag, () => {
    mod.onError((_el, err, phase) => {
      seen = { message: err.message, phase };
    });
    return () => {
      throw new Error(SECRET);
    };
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();

  assert.equal(seen.message, SECRET, "reporting hooks are never redacted");
  assert.equal(seen.phase, "render");
  assert.equal(el.textContent, "Something went wrong.", "but the page is");
});

test("error UI: mount still clears the host and returns the child", async () => {
  const mod = await fresh();
  const host = document.createElement("div");
  host.innerHTML = "<span>placeholder</span>";
  document.body.appendChild(host);
  const tag = uniqueTag("x-mount-ok");
  mod.define(tag, () => () => mod.html`<i>ok</i>`);

  const child = mod.mount(host, tag, { dev: true });
  await tick();
  assert.equal(host.querySelector("span"), null, "host cleared");
  assert.equal(child.tagName.toLowerCase(), tag);
  assert.equal(child.parentNode, host);
  assert.equal(child.textContent, "ok");
});
