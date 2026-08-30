import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";
import { MARKER } from "../../src/template.ts";

function uniqueTag(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now()}`;
}
function tick() { return new Promise((r) => queueMicrotask(r)); }

// ── buildTemplate unit level ─────────────────────────────────────
test("adversarial: buildTemplate with malformed unclosed tags does not throw", async () => {
  const { buildTemplate } = await import(`../../src/template.ts?mal-unclosed-${Date.now()}`);
  assert.doesNotThrow(() => {
    const c = buildTemplate(["<div><span>unclosed"]);
    assert.ok(c.tree.length >= 1);
  });
  assert.doesNotThrow(() => {
    const c2 = buildTemplate(["<div></span></div>"]);
    assert.ok(c2.tree.length >= 1);
  });
  assert.doesNotThrow(() => {
    const c3 = buildTemplate(["<div title=foo>no quotes</div>"]);
    assert.ok(c3.tree.length >= 1);
  });
  assert.doesNotThrow(() => {
    const c4 = buildTemplate(["<<div>>"]);
    assert.ok(c4);
  });
  assert.doesNotThrow(() => {
    const c5 = buildTemplate(["<div> stray > in text </div>"]);
    assert.ok(c5);
  });
});

test("adversarial: buildTemplate with comments, script, style, doctype is inert", async () => {
  const { buildTemplate } = await import(`../../src/template.ts?comment-script-${Date.now()}`);
  // comments are text nodes with comment nodeType 8, not elements; buildDesc only handles 1 and 3, so comments ignored — should not throw and not create elements
  assert.doesNotThrow(() => {
    const c = buildTemplate(["<!-- comment --><div>hi</div>"]);
    assert.ok(c.tree.some(n => n.type === "element" && n.tag === "div"));
  });
  // script/style static — should be parsed as elements but not executed
  const mod = await import(`../../src/index.ts?script-inert-${Date.now()}`);
  const tag = uniqueTag("adv-script");
  let executed = false;
  globalThis.__advTest = () => { executed = true; };
  mod.define(tag, () => () => mod.html`<!-- <script>alert(1)</script> --><div>ok</div><style>body{color:red}</style>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  assert.equal(el.textContent.includes("ok"), true);
  assert.equal(executed, false);
  assert.equal(el.querySelector("script"), null); // comments hide it, and script tag via innerHTML in template is inert in jsdom
  assert.ok(el.querySelector("div") !== null);
  el.remove();
  delete globalThis.__advTest;
});

test("adversarial: buildTemplate with SVG static DOM is parsed with correct NS", async () => {
  const { buildTemplate } = await import(`../../src/template.ts?svg-ns-${Date.now()}`);
  const c = buildTemplate(["<svg><circle r=\"5\"></circle></svg>"]);
  assert.equal(c.tree[0].ns, "http://www.w3.org/2000/svg");
  assert.equal(c.tree[0].children[0].tag, "circle");
  assert.equal(c.tree[0].children[0].ns, "http://www.w3.org/2000/svg");
});

test("adversarial: buildTemplate with foreignObject resets to HTML", async () => {
  const { buildTemplate } = await import(`../../src/template.ts?fo-ns-${Date.now()}`);
  const c = buildTemplate(["<svg><foreignObject><div>hi</div></foreignObject></svg>"]);
  const svg = c.tree[0];
  const fo = svg.children[0];
  assert.equal(fo.tag, "foreignobject");
  assert.equal(fo.ns, "http://www.w3.org/2000/svg");
  assert.equal(fo.children[0].tag, "div");
  // HTML_NS is null in src/ns.ts (not XHTML); cache stores null for HTML
  assert.equal(fo.children[0].ns, null);
});

test("adversarial: static on* attribute without MARKER throws actionable error", async () => {
  // The message reaches the page only in dev mode, so this mounts in dev mode
  // rather than assuming it. It used to assume it, and passed only because a
  // `?static-on-${Date.now()}` import happened to land in the same
  // millisecond as another file's — sharing that file's module instance, and
  // with it the dev flag that file had set. Run alone, it failed.
  const mod = await import(`../../src/index.ts?static-on-${Date.now()}`);
  const tag = uniqueTag("adv-static-on");
  mod.define(tag, () => () => mod.html`<div onclick="alert(1)">x</div>`);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const el = mod.mount(host, tag, { dev: true });
  await tick();
  assert.ok(el.querySelector("[data-micro-ui-error]"), "static onclick should mount error UI");
  assert.ok(el.textContent.includes("onclick") && el.textContent.includes("interpolated"));
  host.remove();

  const mod2 = await import(`../../src/index.ts?static-onsvg-${Date.now()}`);
  const tag2 = uniqueTag("adv-static-onsvg");
  mod2.define(tag2, () => () => mod2.html`<svg onload="evil()" width="10"></svg>`);
  const el2 = document.createElement(tag2);
  document.body.appendChild(el2);
  await tick();
  assert.ok(el2.querySelector("[data-micro-ui-error]"));
  el2.remove();
});

test("adversarial: the same failure says nothing specific with dev off", async () => {
  // The other half of the contract, and the reason the test above has to ask
  // for dev mode: a thrown message can carry a URL, a token or an internal
  // path, and the box renders where the user is looking.
  const mod = await import(`../../src/index.ts?static-on-prod-${Date.now()}`);
  const tag = uniqueTag("adv-static-on-prod");
  mod.define(tag, () => () => mod.html`<div onclick="alert(1)">x</div>`);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const el = mod.mount(host, tag, { dev: false });
  await tick();
  assert.ok(el.querySelector("[data-micro-ui-error]"));
  assert.equal(el.textContent, "Something went wrong.");
  assert.equal(el.textContent.includes("onclick"), false);
  host.remove();
});

test("adversarial: static on* variations throw (onfocus, onmouseover, case-insensitive)", async () => {
  for (const attr of ["onfocus=\"x\"", "onmouseover=\"x\"", "ONCLICK=\"x\""]) {
    const mod = await import(`../../src/index.ts?static-on-${Date.now()}-${Math.random()}`);
    const tag = uniqueTag("adv-onvar");
    // html template literal with static on* — we need to inject via buildTemplate direct
    const { buildTemplate } = await import(`../../src/template.ts?static-on-var-${Date.now()}-${Math.random()}`);
    assert.throws(() => buildTemplate([`<div ${attr}>hi</div>`]), /Static "on.*?" attribute/);
  }
});

// ── MARKER injection ─────────────────────────────────────────────
test("adversarial: MARKER in static string splits into phantom binding (trusted-author boundary)", async () => {
  const { buildTemplate } = await import(`../../src/template.ts?marker-static-${Date.now()}`);
  const staticWithMarker = `<div>before${MARKER}after</div>`;
  const c = buildTemplate([staticWithMarker]);
  // static MARKER is treated as MARKER split — it produces a binding node where none was intended
  // This documents the trusted-author assumption: static template strings are author-controlled
  assert.ok(c.bindings.length === 1, "static MARKER creates phantom binding");
  assert.ok(c.tree[0].children.some(n => n.type === "binding"), "phantom binding present");
});

test("adversarial: MARKER in interpolated string value does NOT break attribute boundary", async () => {
  const mod = await import(`../../src/index.ts?marker-interp-${Date.now()}`);
  const tag = uniqueTag("adv-marker-interp");
  const evil = `"><svg onload="alert(1)"`;
  const evilMarker = `a${MARKER}b`;
  mod.define(tag, () => () => mod.html`<div title=${evil}></div><p>${evilMarker}</p>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  const div = el.querySelector("div");
  // attribute breakout must not happen — title is literal, svg not created
  assert.equal(div.getAttribute("title"), evil);
  assert.equal(el.querySelector("svg"), null);
  // MARKER in text interpolation is literal text, not template boundary
  const p = el.querySelector("p");
  assert.equal(p.textContent, evilMarker);
  assert.equal(p.querySelector("svg"), null);
  el.remove();
});

test("adversarial: attribute breakout via interpolations stays literal", async () => {
  const mod = await import(`../../src/index.ts?attr-breakout-${Date.now()}`);
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
    assert.equal(div.getAttribute("title"), p);
    assert.equal(div.getAttribute("data-x"), p);
    // must not create injected elements/attributes
    assert.equal(div.getAttribute("onmouseover"), null);
    assert.equal(div.hasAttribute("onmouseover"), false);
    assert.equal(el.querySelector("img"), null);
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
  assert.equal(el2.querySelector("a").hasAttribute("href"), false);
  assert.equal(el2.querySelector("a").textContent, "click");
  assert.ok(logged.some((l) => l.includes("refused to set href")));
  el2.remove();
});

// ── template parsing edge: empty/whitespace/boundary/many bindings ─
test("adversarial: empty, whitespace-only, single binding, many bindings boundaries", async () => {
  const { buildTemplate } = await import(`../../src/template.ts?boundary-${Date.now()}`);
  const empty = buildTemplate([""]);
  assert.equal(empty.tree.length, 0);
  assert.equal(empty.bindings.length, 0);

  const ws = buildTemplate(["   "]);
  // whitespace text node preserved as element? Actually <template> with just whitespace creates a text node
  assert.ok(ws.tree.length >= 0);

  const singleBinding = buildTemplate(["", ""]);
  // html`` with no strings? our wrapper uses strings.length; but html`${x}` where x is value -> strings ["", ""]
  assert.equal(singleBinding.bindings.length, 1);

  // 100 bindings
  const manyStrings = Array(101).fill("<span></span>"); // not real, need MARKER injection simulation
  // Instead test via html directly with 50 interpolations
  const mod = await import(`../../src/index.ts?many-bind-${Date.now()}`);
  const tag = uniqueTag("adv-many");
  const vals = Array.from({ length: 50 }, (_, i) => i);
  mod.define(tag, () => () => mod.html`<div>${vals.map(v => mod.html`<span>${v}</span>`)}</div>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  assert.equal(el.querySelectorAll("span").length, 50);
  el.remove();
});

test("adversarial: html text binding with script-like content stays literal", async () => {
  const mod = await import(`../../src/index.ts?script-literal-${Date.now()}`);
  const tag = uniqueTag("adv-script-lit");
  const payload = `<script>alert(1)</script><img src=x onerror="alert(2)">`;
  mod.define(tag, () => () => mod.html`<div>${payload}</div>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  const div = el.querySelector("div");
  assert.equal(div.querySelector("script"), null);
  assert.equal(div.querySelector("img"), null);
  assert.equal(div.textContent, payload);
  // also via attribute
  const tag2 = uniqueTag("adv-script-attr");
  mod.define(tag2, () => () => mod.html`<div title=${payload}>x</div>`);
  const el2 = document.createElement(tag2);
  document.body.appendChild(el2);
  await tick();
  assert.equal(el2.querySelector("div").getAttribute("title"), payload);
  assert.equal(el2.querySelector("script"), null);
  el.remove(); el2.remove();
});

// ── nested / raw with MARKER ─────────────────────────────────────
test("adversarial: nested html fragments and raw with MARKER literal", async () => {
  const mod = await import(`../../src/index.ts?nested-raw-${Date.now()}`);
  const tag = uniqueTag("adv-nested");
  mod.define(tag, () => () => mod.html`<div>${mod.html`<span>${MARKER}</span>`}</div><p>${mod.html.raw`<b>${MARKER}</b>`}</p>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  assert.equal(el.querySelector("span").textContent, MARKER);
  // raw with MARKER: buildRawString concatenates MARKER into raw.html, which is re-parsed via buildDesc.
  // That re-parse splits MARKER into a phantom binding with no value, so raw currently yields empty text.
  // This documents the trusted-author boundary: interpolated MARKER inside raw is not preserved as literal.
  // The important guarantee is that it does NOT create an element or execute.
  const b = el.querySelector("b");
  assert.ok(b !== null);
  assert.equal(b.textContent, "", "MARKER inside raw is currently a phantom binding -> empty");
  assert.equal(el.querySelector("span").textContent, MARKER, "MARKER via normal html stays literal");
  el.remove();
});

test("adversarial: unicode, null byte, case sensitivity", async () => {
  const { buildTemplate } = await import(`../../src/template.ts?unicode-${Date.now()}`);
  // null byte in static
  assert.doesNotThrow(() => buildTemplate(["<div>\u0000hi</div>"]));
  // MARKER char is \ue000, ensure different unicode not colliding
  assert.doesNotThrow(() => buildTemplate(["<div>\uE001</div>"]));
  // uppercase DIV
  const c = buildTemplate(["<DIV>hi</DIV>"]);
  assert.equal(c.tree[0].tag, "div");
  // svg case-sensitive attrs: viewBox should preserve case
  const mod = await import(`../../src/index.ts?case-svg-${Date.now()}`);
  const tag = uniqueTag("adv-case-svg");
  mod.define(tag, () => () => mod.html`<svg viewBox="0 0 10 10" preserveAspectRatio="xMidYMid"><circle></circle></svg>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  const svg = el.querySelector("svg");
  assert.equal(svg.getAttribute("viewBox"), "0 0 10 10");
  assert.equal(svg.getAttribute("preserveAspectRatio"), "xMidYMid");
  el.remove();
});

// ── NS adversarial: mathml inside svg, xlink with MARKER ─────────
test("adversarial: NS confusion — mathml inside svg and xlink:href with dynamic value", async () => {
  const mod = await import(`../../src/index.ts?ns-confuse-${Date.now()}`);
  const tag = uniqueTag("adv-ns-math");
  mod.define(tag, () => () => mod.html`<svg><g><foreignObject><div><math><mi>x</mi></math></div></foreignObject></g></svg>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  const mi = el.querySelector("mi");
  // jsdom may not support MathML NS, but should not crash and mi should be child of math
  assert.ok(mi !== null);
  assert.equal(mi.textContent, "x");
  el.remove();

  // xlink:href dynamic
  const tag2 = uniqueTag("adv-xlink-dyn");
  let href = "#a";
  let ref;
  mod.define(tag2, el2 => { ref = el2; return () => mod.html`<svg><use xlink:href=${href}></use></svg>`; });
  const el2 = document.createElement(tag2);
  document.body.appendChild(el2);
  await tick();
  assert.equal(el2.querySelector("use").getAttribute("xlink:href"), "#a");
  href = "#b"; mod.update(ref); await tick();
  assert.equal(el2.querySelector("use").getAttribute("xlink:href"), "#b");
  el2.remove();
});

test("adversarial: template with 3+ bindings in one element does not misalign", async () => {
  const mod = await import(`../../src/index.ts?multi-bind-${Date.now()}`);
  const tag = uniqueTag("adv-multi-bind");
  const a = "one", b = "two", c = "three";
  mod.define(tag, () => () => mod.html`<div data-a=${a} data-b=${b} data-c=${c} title="pre-${a}-${b}-${c}-post"></div>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  const div = el.querySelector("div");
  assert.equal(div.getAttribute("data-a"), "one");
  assert.equal(div.getAttribute("data-b"), "two");
  assert.equal(div.getAttribute("data-c"), "three");
  assert.equal(div.getAttribute("title"), "pre-one-two-three-post");
  el.remove();
});
