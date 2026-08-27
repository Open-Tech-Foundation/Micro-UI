import { assert, assertEquals, test } from "runtime:test";
import { setupDOM } from "./helpers/dom.mjs";

let tagCounter = 0;
function uniqueTag(prefix) { return `${prefix}-${++tagCounter}-${Date.now()}-${Math.floor(Math.random()*1e6)}`; }
async function fresh() { return await import(`../src/index.ts?${Date.now()}-${Math.random()}`); }
const delay = (n=10) => new Promise(r => setTimeout(r, n));
const micro = () => new Promise(r => queueMicrotask(r));

// ── html/text ──────────────────────────────────────────────────────
test("html: single text interpolation", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-text");
  define(tag, () => () => html`<p>${"hello"}</p>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("p").textContent, "hello");
});
test("html: multiple text interpolations with static", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-multi-text");
  define(tag, () => { const a="World", n=42; return () => html`<p>Hello ${a}! count=${n}</p>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("p").textContent, "Hello World! count=42");
});
test("html: number and boolean rendering", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-num");
  define(tag, () => () => html`<div>${0} ${false ? "no" : "yes"} ${true ? "y" : "n"}</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.textContent.includes("0")); assert(el.textContent.includes("yes"));
});
test("html: null/undefined/false renders empty", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-empty");
  define(tag, () => () => html`<div>a${null}b${undefined}c${false}d</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.textContent, "abcd");
});
test("html: array flattening", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-arr");
  define(tag, () => () => html`<ul>${[1,2,3].map(n => html`<li>${n}</li>`)}</ul>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelectorAll("li").length, 3);
  assert(el.textContent.includes("2"));
});
test("html: nested fragment", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-nest");
  define(tag, () => () => html`<div>${html`<span>a</span>`} ${html`<b>b</b>`}</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.querySelector("span") !== null); assert(el.querySelector("b") !== null);
});
test("html: conditional null inside element", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-cond"); let show=true; let ref;
  define(tag, el2 => { ref=el2; return () => html`<div>${show ? html`<span>yes</span>` : null}</div>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("span")?.textContent, "yes");
  show=false; update(ref); await micro(); flush(); await delay(5);
  assert(el.querySelector("span") === null);
  show=true; update(ref); await micro(); flush(); await delay(5);
  assertEquals(el.querySelector("span")?.textContent, "yes");
});

// ── attributes ─────────────────────────────────────────────────────
test("attributes: static + dynamic", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-attr");
  define(tag, () => () => html`<img src=${"a.jpg"} alt="photo">`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("img").getAttribute("src"), "a.jpg");
  assertEquals(el.querySelector("img").getAttribute("alt"), "photo");
});
test("attributes: prefix and suffix interpolation (style/class)", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-prefix");
  define(tag, () => () => html`<div style="color:${"red"};display:block" class="btn ${"primary"}"></div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("div").getAttribute("style"), "color:red;display:block");
  assertEquals(el.querySelector("div").getAttribute("class"), "btn primary");
});
test("attributes: multiple markers in one value", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-multi-attr");
  define(tag, () => () => html`<a href="/${"users"}/${123}">${"go"}</a>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("a").getAttribute("href"), "/users/123");
});
test("attributes: removal when null/false", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-attr-rem"); let title="hi"; let ref;
  define(tag, el2 => { ref=el2; return () => html`<div title=${title}></div>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("div").getAttribute("title"), "hi");
  title=null; update(ref); await micro(); flush(); await delay(5);
  assert(el.querySelector("div").getAttribute("title") === null);
  title=false; update(ref); await micro(); flush(); await delay(5);
  assert(el.querySelector("div").getAttribute("title") === null);
});
test("attributes: boolean disabled/selected sync", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-bool"); let dis=true; let ref;
  define(tag, el2 => { ref=el2; return () => html`<button disabled=${dis}>x</button>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.querySelector("button").getAttribute("disabled") !== null);
  dis=false; update(ref); await micro(); flush(); await delay(5);
  assert(el.querySelector("button").getAttribute("disabled") === null);
});
test("attributes: class toggle via update", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-class2"); let active=true; let ref;
  define(tag, el2 => { ref=el2; return () => html`<div class="base ${active?"on":"off"}"></div>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.querySelector("div").getAttribute("class").includes("on"));
  active=false; update(ref); await micro(); flush(); await delay(5);
  assert(el.querySelector("div").getAttribute("class").includes("off"));
});

// ── form props: value/checked ──────────────────────────────────────
test("props: value property syncs attribute + .value", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-val"); let val="hello"; let ref;
  define(tag, el2 => { ref=el2; return () => html`<input value=${val}>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("input").value, "hello");
  val="world"; update(ref); await micro(); flush(); await delay(5);
  assertEquals(el.querySelector("input").value, "world");
  val=null; update(ref); await micro(); flush(); await delay(5);
  assertEquals(el.querySelector("input").value, "");
});
test("props: checked boolean toggle", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-chk"); let v=true; let ref;
  define(tag, el2 => { ref=el2; return () => html`<input type="checkbox" checked=${v}>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.querySelector("input").checked===true);
  assert(el.querySelector("input").getAttribute("checked") !== null);
  v=false; update(ref); await micro(); flush(); await delay(5);
  assert(el.querySelector("input").checked===false);
  assert(el.querySelector("input").getAttribute("checked")===null);
});
test("props: value number coercion", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-val-num");
  define(tag, () => () => html`<input value=${42}>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("input").value, "42");
});

// ── events ─────────────────────────────────────────────────────────
test("events: onclick binding and update", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-evt"); let count=0;
  define(tag, el2 => () => html`<button onclick=${() => { count++; update(el2); }}>${count}</button>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  el.querySelector("button").click(); await micro(); flush(); await delay(5);
  assertEquals(el.querySelector("button").textContent, "1");
  el.querySelector("button").click(); await micro(); flush(); await delay(5);
  assertEquals(el.querySelector("button").textContent, "2");
});
test("events: oninput binding", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-input-evt"); let last="";
  define(tag, () => () => html`<input oninput=${e => { last=e.target.value; }}>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const inp = el.querySelector("input");
  inp.value="abc"; inp.dispatchEvent(new Event("input", { bubbles:true }));
  assertEquals(last, "abc");
});
test("events: handler replacement (old removed)", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-evt-replace"); let h1calls=0, h2calls=0;
  let h = () => h1calls++; let ref;
  define(tag, el2 => { ref=el2; return () => html`<button onclick=${h}>x</button>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  el.querySelector("button").click(); assertEquals(h1calls,1);
  h = () => h2calls++; update(ref); await micro(); flush(); await delay(5);
  el.querySelector("button").click(); assertEquals(h1calls,1); assertEquals(h2calls,1);
});
test("events: null handler does not throw", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-evt-null"); let fn=null; let ref;
  define(tag, el2 => { ref=el2; return () => html`<button onclick=${fn}>x</button>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  // should not throw on click with null
  el.querySelector("button").click();
  fn = () => {}; update(ref); await micro(); flush(); await delay(5);
  el.querySelector("button").click(); // no error
  assert(true);
});

// ── lists: keyed vs unkeyed ────────────────────────────────────────
test("lists: keyed remove single does not remove others (cart bug)", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-key-rem"); let items=[{id:1},{id:2},{id:3}]; let ref;
  define(tag, el2 => { ref=el2; return () => html`<ul>${items.map(i => html`<li key=${i.id}>${i.id}</li>`)}</ul>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelectorAll("li").length, 3);
  items=items.filter(i=>i.id!==2); update(ref); await micro(); flush(); await delay(5);
  assertEquals(el.querySelectorAll("li").length, 2);
  const ids=[...el.querySelectorAll("li")].map(n=>n.textContent);
  assert(ids.includes("1")); assert(ids.includes("3")); assert(!ids.includes("2"));
});
test("lists: keyed reorder preserves DOM order", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-key-reorder"); let items=[{id:1},{id:2},{id:3}]; let ref;
  define(tag, el2 => { ref=el2; return () => html`<ul>${items.map(i => html`<li key=${i.id}>${i.id}</li>`)}</ul>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  items=[{id:3},{id:1},{id:2}]; update(ref); await micro(); flush(); await delay(5);
  const order=[...el.querySelectorAll("li")].map(n=>n.textContent).join(",");
  assertEquals(order, "3,1,2");
});
test("lists: keyed add at beginning", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-key-add"); let items=[{id:1},{id:2}]; let ref;
  define(tag, el2 => { ref=el2; return () => html`<ul>${items.map(i => html`<li key=${i.id}>${i.id}</li>`)}</ul>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  items=[{id:0},{id:1},{id:2}]; update(ref); await micro(); flush(); await delay(5);
  assertEquals(el.querySelectorAll("li").length, 3);
  assertEquals([...el.querySelectorAll("li")][0].textContent, "0");
});
test("lists: unkeyed by index (append/remove)", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-nokey"); let items=["a","b"]; let ref;
  define(tag, el2 => { ref=el2; return () => html`<ul>${items.map(t => html`<li>${t}</li>`)}</ul>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelectorAll("li").length, 2);
  items=["a","b","c"]; update(ref); await micro(); flush(); await delay(5);
  assertEquals(el.querySelectorAll("li").length, 3);
  items=["a"]; update(ref); await micro(); flush(); await delay(5);
  assertEquals(el.querySelectorAll("li").length, 1);
});
test("lists: empty to filled and back", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-empty-list"); let items=[]; let ref;
  define(tag, el2 => { ref=el2; return () => html`<ul>${items.map(i => html`<li key=${i}>${i}</li>`)}</ul>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelectorAll("li").length, 0);
  items=[1,2]; update(ref); await micro(); flush(); await delay(5);
  assertEquals(el.querySelectorAll("li").length, 2);
  items=[]; update(ref); await micro(); flush(); await delay(5);
  assertEquals(el.querySelectorAll("li").length, 0);
});
test("lists: key prefix e.g. key=prefix-${id}", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-key-prefix"); let items=[{id:1},{id:2}]; let ref;
  define(tag, el2 => { ref=el2; return () => html`<ul>${items.map(it => html`<li key="row-${it.id}">${it.id}</li>`)}</ul>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelectorAll("li").length, 2);
  items=[{id:2}]; update(ref); await micro(); flush(); await delay(5);
  assertEquals(el.querySelectorAll("li").length, 1);
  assertEquals(el.querySelector("li").textContent, "2");
});

// ── define / props / isolation ─────────────────────────────────────
test("define: props from attributes", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-props");
  define(tag, (el, props) => () => html`<span>${props.foo}</span>`);
  const el = document.createElement(tag); el.setAttribute("foo","bar"); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("span").textContent, "bar");
});
test("define: multiple instances isolated (closure + props)", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-multi");
  define(tag, (el, props) => { let c=Number(props.start||0); return () => html`<div><span>${c}</span><button onclick=${()=>{c++;update(el);}}>+</button></div>`; });
  const a=document.createElement(tag); a.setAttribute("start","0");
  const b=document.createElement(tag); b.setAttribute("start","10");
  document.body.appendChild(a); document.body.appendChild(b); await delay();
  assertEquals(a.querySelector("span").textContent,"0"); assertEquals(b.querySelector("span").textContent,"10");
  a.querySelector("button").click(); await micro(); flush(); await delay(5);
  assertEquals(a.querySelector("span").textContent,"1"); assertEquals(b.querySelector("span").textContent,"10");
});

// ── onReady / mount / update / flush ───────────────────────────────
test("onReady: called on connect and cleanup on disconnect", async () => {
  setupDOM(); const { define, html, onReady } = await fresh();
  const tag = uniqueTag("t-ready"); let ready=false, cleanup=false;
  define(tag, () => { onReady(() => { ready=true; return () => { cleanup=true; }; }); return () => html`<div>hi</div>`; });
  const el=document.createElement(tag); document.body.appendChild(el); await delay();
  assert(ready===true); el.remove(); await delay(); assert(cleanup===true);
});
test("onReady: throws when called outside define", async () => {
  setupDOM(); const { onReady } = await fresh();
  let threw=false; try{ onReady(()=>{});} catch(e){ threw=true; assert(e.message.includes("onReady")); } assert(threw===true);
});
test("onReady: multiple callbacks", async () => {
  setupDOM(); const { define, html, onReady } = await fresh();
  const tag = uniqueTag("t-ready-multi"); let a=false,b=false;
  define(tag, () => { onReady(()=>{a=true;}); onReady(()=>{b=true;}); return () => html`<div></div>`; });
  const el=document.createElement(tag); document.body.appendChild(el); await delay();
  assert(a&&b);
});
test("update: batching coalesces multiple updates into one render", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag=uniqueTag("t-batch"); let c=0, renders=0, ref;
  define(tag, el2=>{ref=el2; return ()=>{renders++; return html`<span>${c}</span>`;};});
  const el=document.createElement(tag); document.body.appendChild(el); await delay();
  renders=0; c=1; update(ref); c=2; update(ref); c=3; update(ref);
  await micro(); flush(); await delay(5);
  assertEquals(renders,1); assertEquals(el.textContent,"3");
});
test("update: no-op for unknown element", async () => {
  setupDOM(); const { update } = await fresh();
  const fake = document.createElement("div");
  update(fake); // should not throw
  assert(true);
});
test("flush: no pending does not throw", async () => {
  setupDOM(); const { flush } = await fresh();
  flush(); flush(); assert(true);
});
test("mount: clears host and appends child", async () => {
  setupDOM(); const { define, html, mount } = await fresh();
  const tag=uniqueTag("t-mount-child");
  define(tag, ()=>()=>html`<span>child</span>`);
  const host=document.createElement("div"); host.textContent="old"; document.body.appendChild(host);
  const child=mount(host, tag); await delay();
  assert(host.textContent.includes("child")); assertEquals(host.childNodes.length,1); assert(child.tagName.toLowerCase()===tag);
});

// ── reconciliation specifics ───────────────────────────────────────
test("reconcile: tag mismatch replaces element", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag=uniqueTag("t-tag-swap"); let useDiv=true; let ref;
  define(tag, el2=>{ref=el2; return ()=> useDiv? html`<div>hi</div>` : html`<span>hi</span>`;});
  const el=document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.querySelector("div")!==null);
  useDiv=false; update(ref); await micro(); flush(); await delay(5);
  assert(el.querySelector("span")!==null); assert(el.querySelector("div")===null);
});
test("reconcile: text node update", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag=uniqueTag("t-text-upd"); let t="a"; let ref;
  define(tag, el2=>{ref=el2; return ()=> html`<p>${t}</p>`;});
  const el=document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("p").textContent,"a");
  t="b"; update(ref); await micro(); flush(); await delay(5);
  assertEquals(el.querySelector("p").textContent,"b");
});
test("reconcile: attribute patch removes old attr", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag=uniqueTag("t-attr-patch"); let withTitle=true; let ref;
  define(tag, el2=>{ref=el2; return ()=> withTitle? html`<div title="x">hi</div>` : html`<div>hi</div>`;});
  const el=document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.querySelector("div").getAttribute("title")==="x");
  withTitle=false; update(ref); await micro(); flush(); await delay(5);
  assert(el.querySelector("div").getAttribute("title")===null);
});
test("reconcile: queueMicrotask batch explicit flush idempotent", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag=uniqueTag("t-flush2"); let v=1; let ref;
  define(tag, el2=>{ref=el2; return ()=> html`<span>${v}</span>`;});
  const el=document.createElement(tag); document.body.appendChild(el); await delay();
  v=2; update(ref); flush(); flush();
  await delay(5);
  assertEquals(el.querySelector("span").textContent,"2");
});
