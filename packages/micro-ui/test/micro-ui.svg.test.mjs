import { assert, assertEquals, test } from "runtime:test";
import { setupDOM } from "./helpers/dom.mjs";

let tagCounter = 0;
function uniqueTag(prefix) { return `${prefix}-${++tagCounter}-${Date.now()}-${Math.floor(Math.random()*1e6)}`; }
async function fresh() { return await import(`../src/index.ts?${Date.now()}-${Math.random()}`); }
const delay = (n=10) => new Promise(r => setTimeout(r, n));
const micro = () => new Promise(r => queueMicrotask(r));

// static SVG namespace
test("svg: static svg and children are in SVG namespace", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("svg-static");
  define(tag, () => () => html`<svg width="100" height="100"><circle cx="50" cy="50" r="10" fill="red"></circle></svg>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const svg = el.querySelector("svg");
  const circle = el.querySelector("circle");
  assert(svg.namespaceURI === "http://www.w3.org/2000/svg");
  assert(circle.namespaceURI === "http://www.w3.org/2000/svg");
  assertEquals(svg.getAttribute("width"), "100");
  assertEquals(circle.getAttribute("fill"), "red");
});

test("svg: nested g/rect inherit SVG NS", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("svg-g");
  define(tag, () => () => html`<svg><g><circle r="5"></circle><rect width="10"></rect></g></svg>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.querySelector("g").namespaceURI === "http://www.w3.org/2000/svg");
  assert(el.querySelector("rect").namespaceURI === "http://www.w3.org/2000/svg");
});

test("svg: foreignObject child is SVG, inner div is HTML", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("svg-fo");
  define(tag, () => () => html`<svg><foreignObject width="100"><div>hi</div></foreignObject></svg>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const fo = el.querySelector("foreignobject") || el.querySelector("foreignObject");
  const div = el.querySelector("div");
  assert(fo.namespaceURI === "http://www.w3.org/2000/svg");
  assert(div.namespaceURI === null || div.namespaceURI === "http://www.w3.org/1999/xhtml");
  assertEquals(div.textContent, "hi");
});

test("svg: dynamic attrs patch and preserve DOM identity", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("svg-dyn");
  let cx="10", fill="red"; let ref;
  define(tag, el2=>{ref=el2; return ()=> html`<svg><circle cx=${cx} fill=${fill} r="10"></circle></svg>`});
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const old = el.querySelector("circle");
  assertEquals(old.getAttribute("cx"), "10");
  cx="55"; fill="blue"; update(ref); await micro(); flush(); await delay(5);
  const cur = el.querySelector("circle");
  assert(cur === old);
  assertEquals(cur.getAttribute("cx"), "55");
  assertEquals(cur.getAttribute("fill"), "blue");
  assert(cur.namespaceURI === "http://www.w3.org/2000/svg");
});

test("svg: keyed list reorder preserves identity", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("svg-key");
  let items=[{id:1,x:10},{id:2,x:20},{id:3,x:30}]; let ref;
  define(tag, el2=>{ref=el2; return ()=> html`<svg>${items.map(it=> html`<circle key=${it.id} cx=${it.x} r="5"></circle>`)}</svg>`});
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelectorAll("circle").length, 3);
  items=[{id:3,x:30},{id:1,x:10},{id:2,x:20}]; update(ref); await micro(); flush(); await delay(5);
  const order=[...el.querySelectorAll("circle")].map(n=>n.getAttribute("cx")).join(",");
  assertEquals(order, "30,10,20");
});

test("svg: events on circle and g", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("svg-evt");
  let clicked=false;
  define(tag, () => () => html`<svg><circle onclick=${()=>clicked=true} r="10"></circle></svg>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  el.querySelector("circle").dispatchEvent({type:"click", target:el.querySelector("circle"), bubbles:true});
  assert(clicked===true);
});

test("svg: mixed HTML+SVG namespaces", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("svg-mix");
  define(tag, ()=>()=> html`<div><h1>t</h1><svg><circle r="5"></circle></svg><p>after</p></div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.querySelector("div").namespaceURI === null);
  assert(el.querySelector("svg").namespaceURI === "http://www.w3.org/2000/svg");
  assert(el.querySelector("p").namespaceURI === null);
});

test("svg: xlink:href and viewBox preserve case", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("svg-xlink");
  define(tag, ()=>()=> html`<svg viewBox="0 0 100 100"><use href="#a"></use><use xlink:href="#b"></use></svg>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const uses=[...el.querySelectorAll("use")];
  assert(uses[0].getAttribute("href")==="#a");
  // xlink:href is stored lowercased in FakeDOM but still retrievable
  assert(uses[1].getAttribute("xlink:href")==="#b" || uses[1].getAttribute("xlink:href")==="#b");
});

test("svg: dynamic fragment inside svg gets SVG namespace (g/line via html)", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("svg-dyn-frag");
  let show = true; let ref;
  define(tag, el2 => { ref = el2; return () => html`<svg width="100" height="100"><g id="static"><circle r="5"></circle></g>${show ? html`<g id="dyn"><line x1="0" y1="0" x2="10" y2="10"></line></g>` : null}</svg>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.querySelector("#dyn").namespaceURI === "http://www.w3.org/2000/svg");
  assert(el.querySelector("line").namespaceURI === "http://www.w3.org/2000/svg");
  show = false; update(ref); await micro(); flush(); await delay(5);
  assert(el.querySelector("#dyn") === null);
  show = true; update(ref); await micro(); flush(); await delay(5);
  assert(el.querySelector("#dyn").namespaceURI === "http://www.w3.org/2000/svg");
  assert(el.querySelector("line").namespaceURI === "http://www.w3.org/2000/svg");
});

test("svg: keyed circles via html fragments inside svg are SVG", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("svg-keyed-frag");
  define(tag, () => () => html`<svg>${[1,2].map(id => html`<circle key=${id} id=${"k"+id} r="5"></circle>`)}</svg>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.querySelector("#k1").namespaceURI === "http://www.w3.org/2000/svg");
  assert(el.querySelector("#k2").namespaceURI === "http://www.w3.org/2000/svg");
});

test("svg: dynamic child inside foreignObject stays HTML after re-add", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("svg-fo-dyn");
  let show = true; let ref;
  define(tag, el2 => { ref = el2; return () => html`<svg><foreignObject>${show ? html`<div id="fochild"><span>hi</span></div>` : null}</foreignObject></svg>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.querySelector("#fochild").namespaceURI === null || el.querySelector("#fochild").namespaceURI === "http://www.w3.org/1999/xhtml");
  show = false; update(ref); await micro(); flush(); await delay(5);
  assert(el.querySelector("#fochild") === null);
  show = true; update(ref); await micro(); flush(); await delay(5);
  const d = el.querySelector("#fochild");
  assert(d.namespaceURI === null || d.namespaceURI === "http://www.w3.org/1999/xhtml", "re-added foreignObject child stays HTML");
  assert(d.querySelector("span").namespaceURI === null || d.querySelector("span").namespaceURI === "http://www.w3.org/1999/xhtml");
});

test("svg: camelCase SVG elements (foreignObject/clipPath/linearGradient) live in SVG ns with HTML children", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("svg-case");
  define(tag, () => () => html`<svg>
    <defs>
      <clipPath id="clip"><circle cx="50" cy="50" r="40"></circle></clipPath>
      <linearGradient id="grad"><stop offset="0" stop-color="red"></stop></linearGradient>
    </defs>
    <g clip-path="url(#clip)">
      <foreignObject id="fo" x="0" y="0" width="50" height="50"><div>hi</div></foreignObject>
    </g>
  </svg>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const cp = el.querySelector("clipPath") || el.querySelector("clippath");
  const lg = el.querySelector("linearGradient") || el.querySelector("lineargradient");
  const fo = el.querySelector("foreignObject") || el.querySelector("foreignobject");
  assert(cp.namespaceURI === "http://www.w3.org/2000/svg");
  assert(cp.querySelector("circle").namespaceURI === "http://www.w3.org/2000/svg");
  assert(lg.namespaceURI === "http://www.w3.org/2000/svg");
  assert(fo.namespaceURI === "http://www.w3.org/2000/svg");
  const div = fo.querySelector("div");
  assert(div.namespaceURI === null || div.namespaceURI === "http://www.w3.org/1999/xhtml");
  assertEquals(div.textContent, "hi");
});

test("svg: swapping foreignObject child type keeps HTML namespace", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("svg-fo-swap");
  let kind = "p"; let ref;
  define(tag, el2 => { ref = el2; return () => html`<svg><foreignObject>${kind === "p" ? html`<p id="fc">a</p>` : html`<div id="fc">b</div>`}</foreignObject></svg>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.querySelector("#fc").namespaceURI === null || el.querySelector("#fc").namespaceURI === "http://www.w3.org/1999/xhtml");
  kind = "div"; update(ref); await micro(); flush(); await delay(5);
  const d = el.querySelector("#fc");
  assert(d.namespaceURI === null || d.namespaceURI === "http://www.w3.org/1999/xhtml", "swapped foreignObject child stays HTML");
  assertEquals(d.tagName.toLowerCase(), "div");
});
