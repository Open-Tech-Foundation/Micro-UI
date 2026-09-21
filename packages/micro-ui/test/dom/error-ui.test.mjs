// The on-page error box must not leak a thrown error's message unless the app
// explicitly opted in via mount(el, tag, { dev: true }). The full error always
// reaches the console and any onError handler either way.
import { assert, assertEquals, test } from "runtime:test";

function uniqueTag(p) {
  return `${p}-${Math.random().toString(36).slice(2, 9)}`;
}
function tick() {
  return new Promise((r) => queueMicrotask(r));
}
// devMode is page-global by design — one app, one setting. Each case therefore
// sets the mode it needs rather than assuming a default.
// esdev resolves every import of index.ts to the same module instance — a query
// string cannot isolate one. Each case still sets the mode it needs.
function fresh() {
  return import("../../src/index.ts");
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
  assert(box, "the error box still mounts");
  assertEquals(box.textContent, "Something went wrong.");
  assertEquals(el.textContent.includes("sk_live"), false, "no leak");
});

test("error UI: mount({ dev: true }) shows the real message", async () => {
  const mod = await fresh();
  const el = await boom(mod, { dev: true });
  assertEquals(el.querySelector("[data-micro-ui-error]").textContent, SECRET);
});

test("error UI: mount({ dev: false }) is explicit about staying quiet", async () => {
  const mod = await fresh();
  const el = await boom(mod, { dev: false });
  assertEquals(
    el.querySelector("[data-micro-ui-error]").textContent,
    "Something went wrong.",
  );
});

test("error UI: mount() with no dev option leaves the current mode alone", async () => {
  const mod = await fresh();
  setDev(mod, false);
  const el = await boom(mod, {});
  assertEquals(
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
  assert(
    flat.some((a) => a instanceof Error && a.message === SECRET),
    "the Error object itself is logged, not a redacted string",
  );
  assert(
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

  assertEquals(seen.message, SECRET, "reporting hooks are never redacted");
  assertEquals(seen.phase, "render");
  assertEquals(el.textContent, "Something went wrong.", "but the page is");
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
  assertEquals(host.querySelector("span"), null, "host cleared");
  assertEquals(child.tagName.toLowerCase(), tag);
  assert(child.parentNode === host);
  assertEquals(child.textContent, "ok");
});