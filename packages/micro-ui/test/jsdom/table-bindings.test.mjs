// Bindings inside a <table>.
//
// The HTML parser foster-parents anything it does not expect inside a table:
// text between <tbody> and its <tr>s is moved *out*, to just before the
// <table>. The binding placeholder is spliced into the template as text, so
// `<tbody>${rows}</tbody>` used to put every row above the table and leave
// the tbody empty — silently, with no throw and nothing in the console. The
// placeholder is a comment now, which the parser leaves where it was written.
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";

const { define, html, update } = await import(
  `../../src/index.ts?table-bindings-${Date.now()}`
);

function uniqueTag(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
function tick() {
  return new Promise((r) => queueMicrotask(r));
}

// Mounts a component whose render function the test supplies, and hands back
// the element plus a way to re-render it.
async function mount(render) {
  const tag = uniqueTag("x-tbl");
  let ref;
  define(tag, (el) => {
    ref = el;
    return () => render();
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  return { el, rerender: async () => (update(ref), await tick()) };
}

test("rows interpolated into <tbody> land inside it", async () => {
  const rows = [
    { id: "a", cells: ["Ada", "$52.10"] },
    { id: "b", cells: ["Grace", "$28.50"] },
  ];
  const { el } = await mount(
    () => html`
      <table>
        <thead><tr><th>Person</th><th>Paid</th></tr></thead>
        <tbody>
          ${rows.map(
            (r) => html`<tr key=${r.id}>${r.cells.map((c) => html`<td>${c}</td>`)}</tr>`,
          )}
        </tbody>
      </table>
    `,
  );

  const tbody = el.querySelector("tbody");
  assert.equal(tbody.querySelectorAll("tr").length, 2);
  // Nothing was fostered out to sit beside the table.
  assert.equal(el.querySelectorAll("table > tr").length, 0);
  assert.equal(
    [...tbody.querySelectorAll("td")].map((td) => td.textContent).join("|"),
    "Ada|$52.10|Grace|$28.50",
  );
});

test("a row's cells interpolate into <tr>", async () => {
  const cells = ["one", "two", "three"];
  const { el } = await mount(
    () => html`<table><tbody><tr>${cells.map((c) => html`<td>${c}</td>`)}</tr></tbody></table>`,
  );
  const tr = el.querySelector("tr");
  assert.equal(tr.children.length, 3);
  assert.equal([...tr.children].every((c) => c.tagName === "TD"), true);
});

test("rows interpolated straight into <table>", async () => {
  const { el } = await mount(
    () => html`<table>${[1, 2].map((n) => html`<tr><td>${String(n)}</td></tr>`)}</table>`,
  );
  assert.equal(el.querySelectorAll("table tr").length, 2);
  assert.equal(el.querySelector("table").previousSibling, null);
});

test("a keyed tbody reorders in place", async () => {
  const items = { current: ["a", "b", "c"] };
  const { el, rerender } = await mount(
    () => html`
      <table><tbody>
        ${items.current.map((k) => html`<tr key=${k}><td>${k}</td></tr>`)}
      </tbody></table>
    `,
  );
  const tbody = el.querySelector("tbody");
  const first = tbody.querySelector("tr");

  items.current = ["c", "a", "b"];
  await rerender();

  assert.equal(
    [...tbody.querySelectorAll("td")].map((td) => td.textContent).join(""),
    "cab",
  );
  // The row was moved, not rebuilt.
  assert.equal(tbody.querySelectorAll("tr")[1], first);
});

test("a conditional inside <tbody> adds and removes rows", async () => {
  const state = { show: false };
  const { el, rerender } = await mount(
    () => html`
      <table><tbody>
        <tr><td>always</td></tr>
        ${state.show ? html`<tr><td>sometimes</td></tr>` : null}
      </tbody></table>
    `,
  );
  const tbody = el.querySelector("tbody");
  assert.equal(tbody.querySelectorAll("tr").length, 1);

  state.show = true;
  await rerender();
  assert.equal(tbody.querySelectorAll("tr").length, 2);
  assert.equal(tbody.querySelectorAll("td")[1].textContent, "sometimes");

  state.show = false;
  await rerender();
  assert.equal(tbody.querySelectorAll("tr").length, 1);
});

test("text and attributes inside a table cell still bind", async () => {
  const state = { cls: "is-up", text: "$126.72" };
  const { el, rerender } = await mount(
    () => html`<table><tbody><tr><td class=${state.cls}>${state.text}</td></tr></tbody></table>`,
  );
  const td = el.querySelector("td");
  assert.equal(td.className, "is-up");
  assert.equal(td.textContent, "$126.72");

  state.cls = "is-down";
  state.text = "-$41.93";
  await rerender();
  assert.equal(el.querySelector("td"), td, "the cell was patched, not replaced");
  assert.equal(td.className, "is-down");
  assert.equal(td.textContent, "-$41.93");
});

test("<colgroup> and <tfoot> hold their bindings too", async () => {
  const { el } = await mount(
    () => html`
      <table>
        <colgroup>${[1, 2].map(() => html`<col />`)}</colgroup>
        <tbody><tr><td>x</td></tr></tbody>
        <tfoot>${html`<tr><td>total</td></tr>`}</tfoot>
      </table>
    `,
  );
  assert.equal(el.querySelectorAll("colgroup col").length, 2);
  assert.equal(el.querySelector("tfoot td").textContent, "total");
});

// The placeholder is a comment everywhere except where a comment is not a
// comment: inside a raw-text element the parser reads `<!--` as literal text,
// so the marker has to stay a bare character there.
test("a binding inside <textarea> is still text, not a stray comment", async () => {
  const state = { value: "hello" };
  const { el, rerender } = await mount(
    () => html`<textarea>${state.value}</textarea>`,
  );
  const ta = el.querySelector("textarea");
  assert.equal(ta.textContent, "hello");
  assert.equal(ta.textContent.includes("<!--"), false);

  state.value = "goodbye";
  await rerender();
  assert.equal(ta.textContent, "goodbye");
});

test("a binding inside <title> and <style> is still text", async () => {
  const { el } = await mount(
    () => html`<div><title>${"a title"}</title><style>${".x { color: red }"}</style></div>`,
  );
  assert.equal(el.querySelector("title").textContent, "a title");
  assert.equal(el.querySelector("style").textContent, ".x { color: red }");
});

test("<select> keeps its interpolated options", async () => {
  const opts = ["ada", "grace"];
  const { el } = await mount(
    () => html`<select>${opts.map((o) => html`<option value=${o}>${o}</option>`)}</select>`,
  );
  assert.equal(el.querySelectorAll("select option").length, 2);
  assert.equal(el.querySelector("option").value, "ada");
});

test("an author's comment does not swallow a following binding", async () => {
  const { el } = await mount(
    () => html`<div><!-- a note --><span>${"after"}</span></div>`,
  );
  assert.equal(el.querySelector("span").textContent, "after");
});

test("markers in ordinary text, attributes and events are unaffected", async () => {
  let clicks = 0;
  const { el } = await mount(
    () => html`
      <div class="a ${"b"}" data-x=${"y"}>
        one ${"two"} three ${"four"}
        <button onclick=${() => clicks++}>go</button>
      </div>
    `,
  );
  const div = el.querySelector("div");
  assert.equal(div.className, "a b");
  assert.equal(div.getAttribute("data-x"), "y");
  assert.match(div.textContent.replace(/\s+/g, " "), /one two three four/);
  el.querySelector("button").click();
  assert.equal(clicks, 1);
});
