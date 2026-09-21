import { test, assert, assertEquals, assertThrows, expect } from "runtime:test";
import { MARKER } from "../../src/template.ts";

function uniqueTag(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now()}`;
}
function tick() { return new Promise((r) => queueMicrotask(r)); }

// ── buildTemplate unit level ─────────────────────────────────────
test("adversarial: buildTemplate with malformed unclosed tags does not throw", async () => {
  const { buildTemplate } = await import("../../src/template.ts");
  // esdev's strict innerHTML parser (template.ts sets `<template>.innerHTML`)
  // refuses genuinely malformed markup — unclosed/mismatched tags, a `<`
  // that cannot open a tag — with a SyntaxError before the library's own
  // code runs, where jsdom's parser recovered from it. The library's
  // robustness still matters for the slack-but-well-formed shapes the strict
  // parser accepts (unquoted attributes, stray `>` in text). (esdev --dom
  // strict-parser boundary.)
  assertThrows(() => buildTemplate(["<div><span>unclosed"]), SyntaxError);
  assertThrows(() => buildTemplate(["<div></span></div>"]), SyntaxError);
  assertThrows(() => buildTemplate(["<<div>>"]), SyntaxError);
  expect(() => {
    const c = buildTemplate(["<div title=foo>no quotes</div>"]);
    assert(c.tree.length >= 1);
  }).not.toThrow();
  expect(() => {
    const c5 = buildTemplate(["<div> stray > in text </div>"]);
    assert(c5);
  }).not.toThrow();
});

test("adversarial: buildTemplate with comments, script, style, doctype is inert", async () => {
  const { buildTemplate } = await import("../../src/template.ts");
  // comments are text nodes with comment nodeType 8, not elements; buildDesc only handles 1 and 3, so comments ignored — should not throw and not create elements
  expect(() => {
    const c = buildTemplate(["<!-- comment --><div>hi</div>"]);
    assert(c.tree.some(n => n.type === "element" && n.tag === "div"));
  }).not.toThrow();
  // script/style static — should be parsed as elements but not executed
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("adv-script");
  let executed = false;
  globalThis.__advTest = () => { executed = true; };
  mod.define(tag, () => () => mod.html`<!-- <script>alert(1)</script> --><div>ok</div><style>body{color:red}</style>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  assertEquals(el.textContent.includes("ok"), true);
  assertEquals(executed, false);
  assertEquals(el.querySelector("script"), null); // comments hide it, and script tag via innerHTML in template is inert in jsdom
  assert(el.querySelector("div") !== null);
  el.remove();
  delete globalThis.__advTest;
});

test("adversarial: buildTemplate with SVG static DOM is parsed with correct NS", async () => {
  const { buildTemplate } = await import("../../src/template.ts");
  const c = buildTemplate(["<svg><circle r=\"5\"></circle></svg>"]);
  assertEquals(c.tree[0].ns, "http://www.w3.org/2000/svg");
  assertEquals(c.tree[0].children[0].tag, "circle");
  assertEquals(c.tree[0].children[0].ns, "http://www.w3.org/2000/svg");
});

test("adversarial: buildTemplate with foreignObject resets to HTML", async () => {
  const { buildTemplate } = await import("../../src/template.ts");
  const c = buildTemplate(["<svg><foreignObject><div>hi</div></foreignObject></svg>"]);
  const svg = c.tree[0];
  const fo = svg.children[0];
  assertEquals(fo.tag, "foreignobject");
  assertEquals(fo.ns, "http://www.w3.org/2000/svg");
  assertEquals(fo.children[0].tag, "div");
  // HTML_NS is null in src/ns.ts (not XHTML); cache stores null for HTML
  assertEquals(fo.children[0].ns, null);
});

test("adversarial: static on* attribute without MARKER throws actionable error", async () => {
  // The message reaches the page only in dev mode, so this mounts in dev mode
  // rather than assuming it. It used to assume it, and passed only because a
  // `?static-on-${Date.now()}` import happened to land in the same
  // millisecond as another file's — sharing that file's module instance, and
  // with it the dev flag that file had set. Run alone, it failed.
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("adv-static-on");
  mod.define(tag, () => () => mod.html`<div onclick="alert(1)">x</div>`);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const el = mod.mount(host, tag, { dev: true });
  await tick();
  assert(el.querySelector("[data-micro-ui-error]"), "static onclick should mount error UI");
  assert(el.textContent.includes("onclick") && el.textContent.includes("interpolated"));
  host.remove();

  const tag2 = uniqueTag("adv-static-onsvg");
  mod.define(tag2, () => () => mod.html`<svg onload="evil()" width="10"></svg>`);
  const el2 = document.createElement(tag2);
  document.body.appendChild(el2);
  await tick();
  assert(el2.querySelector("[data-micro-ui-error]"));
  el2.remove();
});

test("adversarial: the same failure says nothing specific with dev off", async () => {
  // The other half of the contract, and the reason the test above has to ask
  // for dev mode: a thrown message can carry a URL, a token or an internal
  // path, and the box renders where the user is looking.
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("adv-static-on-prod");
  mod.define(tag, () => () => mod.html`<div onclick="alert(1)">x</div>`);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const el = mod.mount(host, tag, { dev: false });
  await tick();
  assert(el.querySelector("[data-micro-ui-error]"));
  assertEquals(el.textContent, "Something went wrong.");
  assertEquals(el.textContent.includes("onclick"), false);
  host.remove();
});

test("adversarial: static on* variations throw (onfocus, onmouseover, case-insensitive)", async () => {
  const { buildTemplate } = await import("../../src/template.ts");
  // esdev's strict parser refuses case-varied attribute names in HTML
  // (`ONCLICK=`, `onClick=`) with a SyntaxError before the library's
  // static-on* check runs, so the case variation is exercised inside SVG,
  // where attribute case is preserved. (esdev --dom strict-parser boundary.)
  for (const attr of ["onfocus=\"x\"", "onmouseover=\"x\""]) {
    assertThrows(() => buildTemplate([`<div ${attr}>hi</div>`]), /Static "on.*?" attribute/);
  }
  assertThrows(() => buildTemplate(["<svg><g onClick=\"x\"></g></svg>"]), /Static "on.*?" attribute/);
});

// ── MARKER injection ─────────────────────────────────────────────
test("adversarial: MARKER in static string splits into phantom binding (trusted-author boundary)", async () => {
  const { buildTemplate } = await import("../../src/template.ts");
  const staticWithMarker = `<div>before${MARKER}after</div>`;
  const c = buildTemplate([staticWithMarker]);
  // static MARKER is treated as MARKER split — it produces a binding node where none was intended
  // This documents the trusted-author assumption: static template strings are author-controlled
  assert(c.bindings.length === 1, "static MARKER creates phantom binding");
  assert(c.tree[0].children.some(n => n.type === "binding"), "phantom binding present");
});

test("adversarial: MARKER in interpolated string value does NOT break attribute boundary", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("adv-marker-interp");
  const evil = `"><svg onload="alert(1)"`;
  const evilMarker = `a${MARKER}b`;
  mod.define(tag, () => () => mod.html`<div title=${evil}></div><p>${evilMarker}</p>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  const div = el.querySelector("div");
  // attribute breakout must not happen — title is literal, svg not created
  assertEquals(div.getAttribute("title"), evil);
  assertEquals(el.querySelector("svg"), null);
  // MARKER in text interpolation is literal text, not template boundary
  const p = el.querySelector("p");
  assertEquals(p.textContent, evilMarker);
  assertEquals(p.querySelector("svg"), null);
  el.remove();
});

test("adversarial: attribute breakout via interpolations stays literal", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("adv-attr-break");
  const payloads = [
    `" onmouseover="alert(1)`,
    `' onmouseover='alert(1)`,
    `"><img src=x onerror=alert(1)>`,
    `" autofocus onfocus="alert(1)`,
  ];
  for (const p of payloads) {
    const t = uniqueTag("adv-break-inner");
    mod.define(t, () => () => mod.html`<div title=${p} data-x=${p}>hi</div>`);
    const el = document.createElement(t);
    document.body.appendChild(el);
    await tick();
    const div = el.querySelector("div");
    assertEquals(div.getAttribute("title"), p);
    assertEquals(div.getAttribute("data-x"), p);
    // must not create injected elements/attributes
    assertEquals(div.getAttribute("onmouseover"), null);
    assertEquals(div.hasAttribute("onmouseover"), false);
    assertEquals(el.querySelector("img"), null);
    el.remove();
  }
  // A javascript: URL is refused outright rather than written and left for a
  // click to run. This used to assert the opposite — that the attribute was
  // set verbatim, on the grounds that the text was never *parsed* as markup.
  // Text is the XSS boundary for content; an attribute the browser navigates
  // to is a second door, and it was open.
  const tag2 = uniqueTag("adv-href");
  const realError = console.error;
  const logged = [];
  console.error = (...a) => logged.push(String(a[0]));
  mod.define(tag2, () => () => mod.html`<a href=${"javascript:alert(1)"}>click</a>`);
  const el2 = document.createElement(tag2);
  document.body.appendChild(el2);
  await tick();
  console.error = realError;
  assertEquals(el2.querySelector("a").hasAttribute("href"), false);
  assertEquals(el2.querySelector("a").textContent, "click");
  assert(logged.some((l) => l.includes("refused to set href")));
  el2.remove();
});

// ── template parsing edge: empty/whitespace/boundary/many bindings ─
test("adversarial: empty, whitespace-only, single binding, many bindings boundaries", async () => {
  const { buildTemplate } = await import("../../src/template.ts");
  const empty = buildTemplate([""]);
  assertEquals(empty.tree.length, 0);
  assertEquals(empty.bindings.length, 0);

  const ws = buildTemplate(["   "]);
  // whitespace text node preserved as element? Actually <template> with just whitespace creates a text node
  assert(ws.tree.length >= 0);

  const singleBinding = buildTemplate(["", ""]);
  // html`` with no strings? our wrapper uses strings.length; but html`${x}` where x is value -> strings ["", ""]
  assertEquals(singleBinding.bindings.length, 1);

  // 100 bindings
  const manyStrings = Array(101).fill("<span></span>"); // not real, need MARKER injection simulation
  // Instead test via html directly with 50 interpolations
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("adv-many");
  const vals = Array.from({ length: 50 }, (_, i) => i);
  mod.define(tag, () => () => mod.html`<div>${vals.map(v => mod.html`<span>${v}</span>`)}</div>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  assertEquals(el.querySelectorAll("span").length, 50);
  el.remove();
});

test("adversarial: html text binding with script-like content stays literal", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("adv-script-lit");
  const payload = `<script>alert(1)</script><img src=x onerror="alert(2)">`;
  mod.define(tag, () => () => mod.html`<div>${payload}</div>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  const div = el.querySelector("div");
  assertEquals(div.querySelector("script"), null);
  assertEquals(div.querySelector("img"), null);
  assertEquals(div.textContent, payload);
  // also via attribute
  const tag2 = uniqueTag("adv-script-attr");
  mod.define(tag2, () => () => mod.html`<div title=${payload}>x</div>`);
  const el2 = document.createElement(tag2);
  document.body.appendChild(el2);
  await tick();
  assertEquals(el2.querySelector("div").getAttribute("title"), payload);
  assertEquals(el2.querySelector("script"), null);
  el.remove(); el2.remove();
});

// ── nested / raw with MARKER ─────────────────────────────────────
test("adversarial: nested html fragments and raw with MARKER literal", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("adv-nested");
  mod.define(tag, () => () => mod.html`<div>${mod.html`<span>${MARKER}</span>`}</div><p>${mod.html.raw`<b>${MARKER}</b>`}</p>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  assertEquals(el.querySelector("span").textContent, MARKER);
  // raw with MARKER: buildRawString concatenates MARKER into raw.html, which is re-parsed via buildDesc.
  // That re-parse splits MARKER into a phantom binding with no value, so raw currently yields empty text.
  // This documents the trusted-author boundary: interpolated MARKER inside raw is not preserved as literal.
  // The important guarantee is that it does NOT create an element or execute.
  const b = el.querySelector("b");
  assert(b !== null);
  assertEquals(b.textContent, "", "MARKER inside raw is currently a phantom binding -> empty");
  assertEquals(el.querySelector("span").textContent, MARKER, "MARKER via normal html stays literal");
  el.remove();
});

test("adversarial: unicode, null byte, case sensitivity", async () => {
  const { buildTemplate } = await import("../../src/template.ts");
  // null byte in static
  expect(() => buildTemplate(["<div>\u0000hi</div>"])).not.toThrow();
  // MARKER char is \ue000, ensure different unicode not colliding
  expect(() => buildTemplate(["<div>\uE001</div>"])).not.toThrow();
  // esdev's strict parser refuses all-uppercase tag names (`<DIV>`) with a
  // SyntaxError, so the library's lowercase normalization is guaranteed at
  // parse time and cannot be exercised with an all-caps tag. The camelCase
  // foreignObject/foreignobject normalization is covered above.
  // (esdev --dom strict-parser boundary.)
  // svg case-sensitive attrs: viewBox should preserve case
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("adv-case-svg");
  mod.define(tag, () => () => mod.html`<svg viewBox="0 0 10 10" preserveAspectRatio="xMidYMid"><circle></circle></svg>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  const svg = el.querySelector("svg");
  assertEquals(svg.getAttribute("viewBox"), "0 0 10 10");
  assertEquals(svg.getAttribute("preserveAspectRatio"), "xMidYMid");
  el.remove();
});

// ── NS adversarial: mathml inside svg, xlink with MARKER ─────────
test("adversarial: NS confusion — mathml inside svg and xlink:href with dynamic value", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("adv-ns-math");
  mod.define(tag, () => () => mod.html`<svg><g><foreignObject><div><math><mi>x</mi></math></div></foreignObject></g></svg>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  const mi = el.querySelector("mi");
  // jsdom may not support MathML NS, but should not crash and mi should be child of math
  assert(mi !== null);
  assertEquals(mi.textContent, "x");
  el.remove();

  // xlink:href dynamic
  const tag2 = uniqueTag("adv-xlink-dyn");
  let href = "#a";
  let ref;
  mod.define(tag2, el2 => { ref = el2; return () => mod.html`<svg><use xlink:href=${href}></use></svg>`; });
  const el2 = document.createElement(tag2);
  document.body.appendChild(el2);
  await tick();
  assertEquals(el2.querySelector("use").getAttribute("xlink:href"), "#a");
  href = "#b"; mod.update(ref); await tick();
  assertEquals(el2.querySelector("use").getAttribute("xlink:href"), "#b");
  el2.remove();
});

test("adversarial: template with 3+ bindings in one element does not misalign", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("adv-multi-bind");
  const a = "one", b = "two", c = "three";
  mod.define(tag, () => () => mod.html`<div data-a=${a} data-b=${b} data-c=${c} title="pre-${a}-${b}-${c}-post"></div>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  const div = el.querySelector("div");
  assertEquals(div.getAttribute("data-a"), "one");
  assertEquals(div.getAttribute("data-b"), "two");
  assertEquals(div.getAttribute("data-c"), "three");
  assertEquals(div.getAttribute("title"), "pre-one-two-three-post");
  el.remove();
});