// URL attributes are the second door.
//
// A text interpolation cannot become markup — that is the XSS boundary this
// library is built on. An attribute is different: `href=${untrusted}` was
// written verbatim, so a `javascript:` URL from a database row ran on the next
// click, with the page's origin. These attributes are refused instead.
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";

const { define, html, update } = await import(
  `../../src/index.ts?url-attrs-${Date.now()}`
);
const uniq = (p) => `${p}-${Math.random().toString(36).slice(2, 10)}`;
const tick = () => new Promise((r) => queueMicrotask(r));

async function render(template) {
  const tag = uniq("x-url");
  let ref;
  define(tag, (el) => {
    ref = el;
    return template;
  });
  const el = document.createElement(tag);
  const realError = console.error;
  const logged = [];
  console.error = (...a) => logged.push(String(a[0]));
  document.body.appendChild(el);
  await tick();
  console.error = realError;
  return { el, logged, rerender: async () => (update(ref), await tick()) };
}

test("a javascript: href is refused and reported", async () => {
  const { el, logged } = await render(
    () => html`<a href=${"javascript:alert(1)"}>x</a>`,
  );
  assert.equal(el.querySelector("a").hasAttribute("href"), false);
  assert.ok(logged.some((l) => l.includes("refused to set href")));
});

test("the scheme is read the way the parser reads it", async () => {
  const dodgy = [
    "JaVaScRiPt:alert(1)",
    "  javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "java\u0000script:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
  ];
  for (const url of dodgy) {
    const { el } = await render(() => html`<a href=${url}>x</a>`);
    assert.equal(
      el.querySelector("a").hasAttribute("href"),
      false,
      `let through: ${JSON.stringify(url)}`,
    );
  }
});

test("every navigable attribute is covered", async () => {
  const { el } = await render(
    () => html`
      <div>
        <img src=${"javascript:alert(1)"} />
        <form action=${"javascript:alert(1)"}></form>
        <button formaction=${"javascript:alert(1)"}>go</button>
        <iframe srcdoc=${"javascript:alert(1)"}></iframe>
      </div>
    `,
  );
  assert.equal(el.querySelector("img").hasAttribute("src"), false);
  assert.equal(el.querySelector("form").hasAttribute("action"), false);
  assert.equal(el.querySelector("button").hasAttribute("formaction"), false);
  assert.equal(el.querySelector("iframe").hasAttribute("srcdoc"), false);
});

test("ordinary URLs are untouched", async () => {
  const fine = [
    "/about",
    "./x.png",
    "../up",
    "#anchor",
    "?q=1",
    "https://example.com/a?b=c#d",
    "mailto:ada@example.com",
    "tel:+15551234",
    "data:image/png;base64,iVBORw0KGgo=",
    "blob:https://example.com/1234",
    "/search?q=javascript:alert(1)",
    "https://example.com/javascript:alert(1)",
  ];
  for (const url of fine) {
    const { el, logged } = await render(() => html`<a href=${url}>x</a>`);
    assert.equal(
      el.querySelector("a").getAttribute("href"),
      url,
      `blocked: ${url}`,
    );
    assert.deepEqual(logged, [], `warned about: ${url}`);
  }
});

test("a static javascript: URL in the template is refused too", async () => {
  const { el } = await render(() => html`<a href="javascript:alert(1)">x</a>`);
  assert.equal(el.querySelector("a").hasAttribute("href"), false);
});

test("a href that turns dangerous on a later render is removed", async () => {
  const state = { url: "/safe" };
  const { el, rerender } = await render(() => html`<a href=${state.url}>x</a>`);
  assert.equal(el.querySelector("a").getAttribute("href"), "/safe");

  state.url = "javascript:alert(1)";
  const realError = console.error;
  console.error = () => {};
  await rerender();
  console.error = realError;
  assert.equal(el.querySelector("a").hasAttribute("href"), false);
});

test("an svg xlink:href is covered", async () => {
  const { el } = await render(
    () =>
      html`<svg><a xlink:href=${"javascript:alert(1)"}><circle r="5"></circle></a></svg>`,
  );
  assert.equal(el.querySelector("a").getAttribute("xlink:href"), null);
});
