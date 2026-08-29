import test from "node:test";
import assert from "node:assert/strict";
import "../jsdom/setup.mjs";

const { define, html, update, flush } = await import(`../../src/index.ts?svg-jsdom-${Date.now()}`);
function uniqueTag(p){ return p+"-"+Math.random().toString(36).slice(2,8); }
function tick(){ return new Promise(r=>queueMicrotask(r)); }

test("svg jsdom: svg and circle are SVGElement", async () => {
  const tag=uniqueTag("svg-jsdom");
  define(tag,()=>()=>html`<svg width="100"><circle cx="50" r="10"></circle></svg>`);
  const el=document.createElement(tag); document.body.appendChild(el); await tick(); flush();
  const svg=el.querySelector("svg");
  const c=el.querySelector("circle");
  assert.equal(svg.namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(c.namespaceURI, "http://www.w3.org/2000/svg");
  assert.ok(c.namespaceURI === "http://www.w3.org/2000/svg");
});

test("svg jsdom: dynamic attr and identity", async () => {
  const tag=uniqueTag("svg-dyn");
  let cx="10"; let ref;
  define(tag, el2=>{ref=el2; return ()=>html`<svg><circle cx=${cx} r="10"></circle></svg>`});
  const el=document.createElement(tag); document.body.appendChild(el); await tick(); flush();
  const old=el.querySelector("circle");
  assert.equal(old.getAttribute("cx"), "10");
  cx="99"; update(ref); await tick(); flush();
  const cur=el.querySelector("circle");
  assert.equal(cur, old);
  assert.equal(cur.getAttribute("cx"), "99");
});

test("svg jsdom: foreignObject html", async () => {
  const tag=uniqueTag("svg-fo");
  define(tag,()=>()=>html`<svg><foreignObject width="100"><div>hi</div></foreignObject></svg>`);
  const el=document.createElement(tag); document.body.appendChild(el); await tick(); flush();
  const fo=el.querySelector("foreignobject") || el.querySelector("foreignObject");
  const div=el.querySelector("div");
  assert.equal(fo.namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(div.namespaceURI, "http://www.w3.org/1999/xhtml");
});

test("svg jsdom: keyed reorder", async () => {
  const tag=uniqueTag("svg-key");
  let items=[{id:1,x:10},{id:2,x:20},{id:3,x:30}]; let ref;
  define(tag, el2=>{ref=el2; return ()=>html`<svg>${items.map(it=>html`<circle key=${it.id} cx=${it.x} r="5"></circle>`)}</svg>`});
  const el=document.createElement(tag); document.body.appendChild(el); await tick(); flush();
  assert.equal(el.querySelectorAll("circle").length, 3);
  items=[{id:3,x:30},{id:1,x:10},{id:2,x:20}]; update(ref); await tick(); flush();
  const order=[...el.querySelectorAll("circle")].map(n=>n.getAttribute("cx")).join(",");
  assert.equal(order, "30,10,20");
});

test("svg jsdom: event on circle", async () => {
  const tag=uniqueTag("svg-evt");
  let clicked=false;
  define(tag,()=>()=>html`<svg><circle onclick=${()=>clicked=true} r="10"></circle></svg>`);
  const el=document.createElement(tag); document.body.appendChild(el); await tick(); flush();
  el.querySelector("circle").dispatchEvent(new Event("click",{bubbles:true}));
  assert.equal(clicked, true);
});

test("svg jsdom: viewBox and class", async () => {
  const tag=uniqueTag("svg-viewbox");
  define(tag,()=>()=>html`<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid"><circle class="a b" r="10"></circle></svg>`);
  const el=document.createElement(tag); document.body.appendChild(el); await tick(); flush();
  const svg=el.querySelector("svg");
  assert.equal(svg.getAttribute("viewBox"), "0 0 100 100");
  assert.equal(svg.getAttribute("preserveAspectRatio"), "xMidYMid");
  assert.equal(el.querySelector("circle").getAttribute("class"), "a b");
});

test("svg jsdom: HTML <a> stays in HTML namespace (not SVG)", async () => {
  const tag=uniqueTag("htm-a");
  define(tag,()=>()=>html`<div><a href="#x">link</a></div>`);
  const el=document.createElement(tag); document.body.appendChild(el); await tick(); flush();
  const a=el.querySelector("a");
  assert.equal(a.namespaceURI, "http://www.w3.org/1999/xhtml");
  assert.equal(a.getAttribute("href"), "#x");
});

test("svg jsdom: HTML <title> stays in HTML namespace", async () => {
  const tag=uniqueTag("htm-title");
  define(tag,()=>()=>html`<div><title>t</title></div>`);
  const el=document.createElement(tag); document.body.appendChild(el); await tick(); flush();
  const t=el.querySelector("title");
  assert.equal(t.namespaceURI, "http://www.w3.org/1999/xhtml");
});

test("svg jsdom: SVG <a> inside svg stays in SVG namespace", async () => {
  const tag=uniqueTag("svg-a");
  define(tag,()=>()=>html`<svg><a href="#y"><circle r="5"></circle></a></svg>`);
  const el=document.createElement(tag); document.body.appendChild(el); await tick(); flush();
  const a=el.querySelector("a");
  assert.equal(a.namespaceURI, "http://www.w3.org/2000/svg");
  const circle=el.querySelector("circle");
  assert.equal(circle.namespaceURI, "http://www.w3.org/2000/svg");
});

test("svg jsdom: HTML siblings around svg keep HTML namespace", async () => {
  const tag=uniqueTag("svg-mixed");
  define(tag,()=>()=>html`<div><p>before</p><svg><circle r="5"></circle></svg><p>after</p></div>`);
  const el=document.createElement(tag); document.body.appendChild(el); await tick(); flush();
  assert.equal(el.querySelector("p").namespaceURI, "http://www.w3.org/1999/xhtml");
  assert.equal(el.querySelector("svg").namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(el.querySelectorAll("p")[1].namespaceURI, "http://www.w3.org/1999/xhtml");
});

test("svg jsdom: dynamic fragment inside svg gets SVG namespace", async () => {
  const tag = uniqueTag("svg-dyn-frag");
  let show = true; let ref;
  define(tag, el2 => { ref = el2; return () => html`<svg width="100" height="100"><g id="static"><circle r="5"></circle></g>${show ? html`<g id="dyn"><line x1="0" y1="0" x2="10" y2="10"></line></g>` : null}</svg>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await tick(); flush();
  assert.equal(el.querySelector("#dyn").namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(el.querySelector("line").namespaceURI, "http://www.w3.org/2000/svg");
  show = false; update(ref); await tick(); flush();
  assert.equal(el.querySelector("#dyn"), null);
  show = true; update(ref); await tick(); flush();
  assert.equal(el.querySelector("#dyn").namespaceURI, "http://www.w3.org/2000/svg");
});

test("svg jsdom: keyed circles via html fragments inside svg are SVG", async () => {
  const tag = uniqueTag("svg-keyed-frag2");
  define(tag, () => () => html`<svg>${[1,2].map(id => html`<circle key=${id} id=${"k"+id} r="5"></circle>`)}</svg>`);
  const el = document.createElement(tag); document.body.appendChild(el); await tick(); flush();
  assert.equal(el.querySelector("#k1").namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(el.querySelector("#k2").namespaceURI, "http://www.w3.org/2000/svg");
});

test("svg jsdom: dynamic child inside foreignObject stays HTML after re-add", async () => {
  const tag = uniqueTag("svg-fo-dyn");
  let show = true; let ref;
  define(tag, el2 => { ref = el2; return () => html`<svg><foreignObject>${show ? html`<div id="fochild"><span>hi</span></div>` : null}</foreignObject></svg>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await tick(); flush();
  const fo = el.querySelector("foreignobject") || el.querySelector("foreignObject");
  assert.equal(fo.namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(el.querySelector("#fochild").namespaceURI, "http://www.w3.org/1999/xhtml");
  show = false; update(ref); await tick(); flush();
  assert.equal(el.querySelector("#fochild"), null);
  show = true; update(ref); await tick(); flush();
  assert.equal(el.querySelector("#fochild").namespaceURI, "http://www.w3.org/1999/xhtml");
  assert.equal(el.querySelector("#fochild span").namespaceURI, "http://www.w3.org/1999/xhtml");
});

test("svg jsdom: camelCase SVG elements keep canonical tag name (foreignObject/clipPath/linearGradient)", async () => {
  const tag=uniqueTag("svg-case");
  define(tag, () => () => html`<svg>
    <defs>
      <clipPath id="clip"><circle cx="50" cy="50" r="40"></circle></clipPath>
      <linearGradient id="grad"><stop offset="0" stop-color="red"></stop></linearGradient>
    </defs>
    <g clip-path="url(#clip)">
      <foreignObject id="fo" x="0" y="0" width="50" height="50"><div>hi</div></foreignObject>
    </g>
  </svg>`);
  const el=document.createElement(tag); document.body.appendChild(el); await tick(); flush();
  const cp=el.querySelector("clipPath") || el.querySelector("clippath");
  const lg=el.querySelector("linearGradient") || el.querySelector("lineargradient");
  const fo=el.querySelector("foreignObject") || el.querySelector("foreignobject");
  assert.equal(cp.namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(cp.tagName, "clipPath");
  assert.equal(lg.namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(lg.tagName, "linearGradient");
  assert.equal(fo.tagName, "foreignObject");
  assert.equal(fo.querySelector("div").namespaceURI, "http://www.w3.org/1999/xhtml");
});

test("svg jsdom: swapping foreignObject child type keeps HTML namespace", async () => {
  const tag = uniqueTag("svg-fo-swap");
  let kind = "p"; let ref;
  define(tag, el2 => { ref = el2; return () => html`<svg><foreignObject>${kind === "p" ? html`<p id="fc">a</p>` : html`<div id="fc">b</div>`}</foreignObject></svg>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await tick(); flush();
  assert.equal(el.querySelector("#fc").namespaceURI, "http://www.w3.org/1999/xhtml");
  kind = "div"; update(ref); await tick(); flush();
  assert.equal(el.querySelector("#fc").namespaceURI, "http://www.w3.org/1999/xhtml");
});

// ── additional ports from micro-ui.svg.test.mjs (complete coverage) ─────
test("svg jsdom: static svg and children are in SVG namespace (port)", async () => {
  const mod = await import(`../../src/index.ts?svg-static-${Date.now()}-${Math.random()}`);
  const tag = uniqueTag("svg-static");
  mod.define(tag, () => () => mod.html`<svg width="100" height="100"><circle cx="50" cy="50" r="10" fill="red"></circle></svg>`);
  const el = document.createElement(tag); document.body.appendChild(el); await tick(); mod.flush();
  const svg = el.querySelector("svg");
  const circle = el.querySelector("circle");
  assert.equal(svg.namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(circle.namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(svg.getAttribute("width"), "100");
  assert.equal(circle.getAttribute("fill"), "red");
});

test("svg jsdom: nested g/rect inherit SVG NS (port)", async () => {
  const mod = await import(`../../src/index.ts?svg-g-${Date.now()}-${Math.random()}`);
  const tag = uniqueTag("svg-g");
  mod.define(tag, () => () => mod.html`<svg><g><circle r="5"></circle><rect width="10"></rect></g></svg>`);
  const el = document.createElement(tag); document.body.appendChild(el); await tick(); mod.flush();
  assert.equal(el.querySelector("g").namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(el.querySelector("rect").namespaceURI, "http://www.w3.org/2000/svg");
});

test("svg jsdom: foreignObject child is SVG, inner div is HTML (port)", async () => {
  const mod = await import(`../../src/index.ts?svg-fo-port-${Date.now()}-${Math.random()}`);
  const tag = uniqueTag("svg-fo-port");
  mod.define(tag, () => () => mod.html`<svg><foreignObject width="100"><div>hi</div></foreignObject></svg>`);
  const el = document.createElement(tag); document.body.appendChild(el); await tick(); mod.flush();
  const fo = el.querySelector("foreignobject") || el.querySelector("foreignObject");
  const div = el.querySelector("div");
  assert.equal(fo.namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(div.namespaceURI, "http://www.w3.org/1999/xhtml");
  assert.equal(div.textContent, "hi");
});

test("svg jsdom: dynamic attrs patch and preserve DOM identity (port)", async () => {
  const mod = await import(`../../src/index.ts?svg-dyn-port-${Date.now()}-${Math.random()}`);
  const tag = uniqueTag("svg-dyn-port");
  let cx="10", fill="red"; let ref;
  mod.define(tag, el2=>{ref=el2; return ()=> mod.html`<svg><circle cx=${cx} fill=${fill} r="10"></circle></svg>`});
  const el = document.createElement(tag); document.body.appendChild(el); await tick(); mod.flush();
  const old = el.querySelector("circle");
  assert.equal(old.getAttribute("cx"), "10");
  cx="55"; fill="blue"; mod.update(ref); await tick(); mod.flush();
  const cur = el.querySelector("circle");
  assert.equal(cur, old);
  assert.equal(cur.getAttribute("cx"), "55");
  assert.equal(cur.getAttribute("fill"), "blue");
  assert.equal(cur.namespaceURI, "http://www.w3.org/2000/svg");
});

test("svg jsdom: events on circle and g (port)", async () => {
  const mod = await import(`../../src/index.ts?svg-evt2-${Date.now()}-${Math.random()}`);
  const tag = uniqueTag("svg-evt2");
  let clicked=false; let gClicked=false;
  mod.define(tag, () => () => mod.html`<svg><g onclick=${()=>gClicked=true}><circle onclick=${()=>clicked=true} r="10"></circle></g></svg>`);
  const el = document.createElement(tag); document.body.appendChild(el); await tick(); mod.flush();
  el.querySelector("circle").dispatchEvent(new Event("click", { bubbles: true }));
  assert.equal(clicked, true);
  // g event also test
  const tag2 = uniqueTag("svg-evt-g");
  let g2=false;
  mod.define(tag2, () => () => mod.html`<svg><g onclick=${()=>g2=true}><rect width="10" height="10"></rect></g></svg>`);
  const el2 = document.createElement(tag2); document.body.appendChild(el2); await tick(); mod.flush();
  el2.querySelector("g").dispatchEvent(new Event("click", { bubbles: true }));
  assert.equal(g2, true);
});

test("svg jsdom: mixed HTML+SVG namespaces (port)", async () => {
  const mod = await import(`../../src/index.ts?svg-mix-${Date.now()}-${Math.random()}`);
  const tag = uniqueTag("svg-mix-port");
  mod.define(tag, ()=>()=> mod.html`<div><h1>t</h1><svg><circle r="5"></circle></svg><p>after</p></div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await tick(); mod.flush();
  assert.equal(el.querySelector("div").namespaceURI, "http://www.w3.org/1999/xhtml");
  assert.equal(el.querySelector("svg").namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(el.querySelector("p").namespaceURI, "http://www.w3.org/1999/xhtml");
});

test("svg jsdom: xlink:href and viewBox preserve case (port)", async () => {
  const mod = await import(`../../src/index.ts?svg-xlink-${Date.now()}-${Math.random()}`);
  const tag = uniqueTag("svg-xlink");
  mod.define(tag, ()=>()=> mod.html`<svg viewBox="0 0 100 100"><use href="#a"></use><use xlink:href="#b"></use></svg>`);
  const el = document.createElement(tag); document.body.appendChild(el); await tick(); mod.flush();
  const uses=[...el.querySelectorAll("use")];
  assert.equal(uses[0].getAttribute("href"), "#a");
  assert.equal(uses[1].getAttribute("xlink:href"), "#b");
  assert.equal(el.querySelector("svg").getAttribute("viewBox"), "0 0 100 100");
});
