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
  const fo=el.querySelector("foreignobject");
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
