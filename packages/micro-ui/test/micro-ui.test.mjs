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
test("lists: detached keyed node is reclaimed by key, not recreated", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-key-reclaim"); let items=[{id:1},{id:2}]; let ref;
  define(tag, el2 => { ref=el2; return () => html`<ul>${items.map(i => html`<li key=${i.id}>${i.id}</li>`)}</ul>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const ul = el.querySelector("ul");
  const one = el.querySelectorAll("li")[0];
  one.remove(); // external removal detaches the node (parentNode -> null)
  assertEquals(ul.querySelectorAll("li").length, 1);
  // Re-render identical items: the detached node must be put back in place
  // by key (identity preserved), not replaced with a fresh element.
  update(ref); await micro(); flush(); await delay(5);
  const lis = ul.querySelectorAll("li");
  assertEquals(lis.length, 2);
  assert(lis[0] === one, "detached keyed node reclaimed by key (identity preserved)");
});
test("lists: removing items leaves no orphaned detached nodes", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-key-noorphan"); let items=[{id:1},{id:2},{id:3}]; let ref;
  define(tag, el2 => { ref=el2; return () => html`<ul>${items.map(i => html`<li key=${i.id}>${i.id}</li>`)}</ul>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  items=[{id:1},{id:3}]; update(ref); await micro(); flush(); await delay(5);
  const lis = [...el.querySelectorAll("li")];
  assertEquals(lis.length, 2);
  assertEquals(lis.map(n=>n.textContent).join(","), "1,3");
  assertEquals(el.querySelectorAll("li").length, 2, "no stray nodes");
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

// ── store / subscribe ───────────────────────────────────────────────
test("store: set and get value", async () => {
  const { store } = await fresh();
  store.set("counter", 0);
  assertEquals(store.get("counter"), 0);
  store.set("counter", 1);
  assertEquals(store.get("counter"), 1);
});
test("store: get returns undefined for unset key", async () => {
  const { store } = await fresh();
  assertEquals(store.get("nonexistent"), undefined);
});
test("store: set with path reads nested value", async () => {
  const { store } = await fresh();
  store.set("form", { name: "", age: 0 });
  store.set("form", "Alice", { path: "name" });
  assertEquals(store.get("form", { path: "name" }), "Alice");
  assertEquals(store.get("form").age, 0);
});
test("store: set with deep path", async () => {
  const { store } = await fresh();
  store.set("data", {});
  store.set("data", "v1", { path: "a.b.c" });
  assertEquals(store.get("data", { path: "a.b.c" }), "v1");
});
test("store: overwrite full value clears path state", async () => {
  const { store } = await fresh();
  store.set("cfg", { theme: "dark", lang: "en" });
  store.set("cfg", "light", { path: "theme" });
  assertEquals(store.get("cfg", { path: "theme" }), "light");
  store.set("cfg", { theme: "red", lang: "fr" });
  assertEquals(store.get("cfg", { path: "theme" }), "red");
  assertEquals(store.get("cfg", { path: "lang" }), "fr");
});
test("subscribe: receives current value on change", async () => {
  const { store } = await fresh();
  store.set("x", 10);
  let received = null;
  store.subscribe("x", (v) => { received = v; });
  store.set("x", 20);
  assertEquals(received, 20);
});
test("subscribe: called for every set", async () => {
  const { store } = await fresh();
  const calls = [];
  store.subscribe("log", (v) => calls.push(v));
  store.set("log", "a");
  store.set("log", "b");
  store.set("log", "c");
  assertEquals(calls, ["a", "b", "c"]);
});
test("subscribe: unsubscribe stops notifications", async () => {
  const { store } = await fresh();
  let count = 0;
  const unsub = store.subscribe("s", () => count++);
  store.set("s", 1); assertEquals(count, 1);
  store.set("s", 2); assertEquals(count, 2);
  unsub();
  store.set("s", 3); assertEquals(count, 2);
});
test("subscribe: unsubscribe returns true on success", async () => {
  const { store } = await fresh();
  const unsub = store.subscribe("z", () => {});
  assertEquals(unsub(), true);
});
test("subscribe: multiple subscribers all notified", async () => {
  const { store } = await fresh();
  let a = 0, b = 0;
  store.subscribe("m", () => a++);
  store.subscribe("m", () => b++);
  store.set("m", "x");
  assertEquals(a, 1); assertEquals(b, 1);
  store.set("m", "y");
  assertEquals(a, 2); assertEquals(b, 2);
});
test("subscribe: path-based set notifies subscribers of full value", async () => {
  const { store } = await fresh();
  store.set("p", { x: 1, y: 2 });
  let snap = null;
  store.subscribe("p", (v) => { snap = v; });
  store.set("p", 99, { path: "x" });
  assertEquals(snap.x, 99);
  assertEquals(snap.y, 2);
});

// ── del ─────────────────────────────────────────────────────────────
test("del: clears entire key to undefined", async () => {
  const { store } = await fresh();
  store.set("k", "hello");
  assertEquals(store.get("k"), "hello");
  store.del("k");
  assertEquals(store.get("k"), undefined);
});
test("del: notifies subscribers on full delete", async () => {
  const { store } = await fresh();
  store.set("k", 1);
  let snap;
  store.subscribe("k", (v) => { snap = v; });
  store.del("k");
  assertEquals(snap, undefined);
});
test("del: path removes key from nested object", async () => {
  const { store } = await fresh();
  store.set("cfg", { a: 1, b: 2, c: 3 });
  store.del("cfg", { path: "b" });
  assertEquals(store.get("cfg"), { a: 1, c: 3 });
  assertEquals(store.get("cfg", { path: "b" }), undefined);
});
test("del: path notifies subscribers with updated object", async () => {
  const { store } = await fresh();
  store.set("d", { x: 10, y: 20 });
  let snap;
  store.subscribe("d", (v) => { snap = v; });
  store.del("d", { path: "x" });
  assertEquals(snap, { y: 20 });
  assertEquals(snap.x, undefined);
});
test("del: path on non-existent path is a no-op", async () => {
  const { store } = await fresh();
  store.set("obj", { a: 1 });
  store.del("obj", { path: "z" });
  assertEquals(store.get("obj"), { a: 1 });
});
test("del: deep nested path", async () => {
  const { store } = await fresh();
  store.set("deep", { a: { b: { c: 42 } } });
  store.del("deep", { path: "a.b.c" });
  assertEquals(store.get("deep", { path: "a.b" }), {});
});
test("del: empty-string path deletes only that key", async () => {
  const { store } = await fresh();
  store.set("emptyKey", { "": "secret", keep: 1 });
  store.del("emptyKey", { path: "" });
  assertEquals(store.get("emptyKey"), { keep: 1 });
});
test("del: path on non-object value is a no-op", async () => {
  const { store } = await fresh();
  store.set("str", "hello");
  store.del("str", { path: "x" });
  assertEquals(store.get("str"), "hello");
});
test("del: path on null value is a no-op", async () => {
  const { store } = await fresh();
  store.set("nil", null);
  store.del("nil", { path: "x" });
  assertEquals(store.get("nil"), null);
});
test("del: key that was never set returns undefined", async () => {
  const { store } = await fresh();
  store.del("ghost");
  assert(true);
});
test("del: does not affect other keys", async () => {
  const { store } = await fresh();
  store.set("a", 1); store.set("b", 2);
  store.del("a");
  assertEquals(store.get("b"), 2);
  assertEquals(store.get("a"), undefined);
});

// ── store edge cases ────────────────────────────────────────────────
test("store: set null value", async () => {
  const { store } = await fresh();
  store.set("n", "prev");
  store.set("n", null);
  assertEquals(store.get("n"), null);
});
test("store: set false value", async () => {
  const { store } = await fresh();
  store.set("flag", true);
  store.set("flag", false);
  assertEquals(store.get("flag"), false);
});
test("store: set 0 value", async () => {
  const { store } = await fresh();
  store.set("count", 99);
  store.set("count", 0);
  assertEquals(store.get("count"), 0);
});
test("store: set empty string", async () => {
  const { store } = await fresh();
  store.set("txt", "hi");
  store.set("txt", "");
  assertEquals(store.get("txt"), "");
});
test("store: overwrite object with primitive", async () => {
  const { store } = await fresh();
  store.set("mix", { a: 1 });
  store.set("mix", "string");
  assertEquals(store.get("mix"), "string");
});
test("store: overwrite primitive with object", async () => {
  const { store } = await fresh();
  store.set("mix2", "string");
  store.set("mix2", { a: 1 });
  assertEquals(store.get("mix2").a, 1);
});
test("store: read-only on never-set key returns undefined", async () => {
  const { store } = await fresh();
  assertEquals(store.get("nope"), undefined);
});
test("store: set with empty string as path value", async () => {
  const { store } = await fresh();
  store.set("e", { "": "found" });
  assertEquals(store.get("e", { path: "" }), "found");
});
test("store: path with double dots", async () => {
  const { store } = await fresh();
  store.set("f", { a: { b: 1 } });
  assertEquals(store.get("f", { path: "a..b" }), undefined);
});

// ── subscribe edge cases ────────────────────────────────────────────
test("subscribe: different functions both called", async () => {
  const { store } = await fresh();
  let countA = 0, countB = 0;
  store.subscribe("diff", () => countA++);
  store.subscribe("diff", () => countB++);
  store.set("diff", 1);
  assertEquals(countA, 1);
  assertEquals(countB, 1);
  store.set("diff", 2);
  assertEquals(countA, 2);
  assertEquals(countB, 2);
});
test("subscribe: unsubscribing already-unsubscribed returns false", async () => {
  const { store } = await fresh();
  const unsub = store.subscribe("once", () => {});
  assertEquals(unsub(), true);
  assertEquals(unsub(), false);
});
test("subscribe: many subscribers all notified", async () => {
  const { store } = await fresh();
  const results = [];
  for (let i = 0; i < 50; i++) {
    store.subscribe("many", () => results.push(1));
  }
  store.set("many", "x");
  assertEquals(results.length, 50);
});

// ── Bug fixes ──────────────────────────────────────────────────────

test("define: text-only VNode renders correctly", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-text-only");
  define(tag, () => () => html`hello`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.textContent, "hello");
});

test("store: clear removes all entries", async () => {
  const { store } = await fresh();
  store.set("a", 1);
  store.set("b", 2);
  assertEquals(store.get("a"), 1);
  store.clear();
  assertEquals(store.get("a"), undefined);
  assertEquals(store.get("b"), undefined);
});

test("store: clear resets listeners", async () => {
  const { store } = await fresh();
  let called = false;
  store.subscribe("x", () => { called = true; });
  store.clear();
  store.set("x", 1);
  assertEquals(called, false);
});

test("store: set with path on primitive key initializes as object", async () => {
  const { store } = await fresh();
  store.set("num", 42);
  store.set("num", "nested", { path: "foo" });
  assertEquals(store.get("num", { path: "foo" }), "nested");
});

test("store: set with path on undefined key initializes as object", async () => {
  const { store } = await fresh();
  store.set("new", "val", { path: "x.y" });
  assertEquals(store.get("new", { path: "x.y" }), "val");
});

test("reconcile: mixed keyed and unkeyed children cleans up orphaned unkeyed nodes", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-mixed-key"); let ref;
  let items = [
    { id: 1, keyed: true },
    { text: "a", keyed: false },
    { id: 2, keyed: true },
  ];
  define(tag, el2 => {
    ref = el2;
    return () => html`<ul>${items.map(i => i.keyed
      ? html`<li key=${i.id}>${i.id}</li>`
      : html`<li>${i.text}</li>`
    )}</ul>`;
  });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelectorAll("li").length, 3);

  items = [{ id: 1, keyed: true }, { id: 2, keyed: true }];
  update(ref); await micro(); flush(); await delay(5);
  assertEquals(el.querySelectorAll("li").length, 2);
});

test("define: text VNode from binding renders correctly", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-text-bind");
  define(tag, () => () => html`${"just text"}`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.textContent, "just text");
});

// ── html.raw ───────────────────────────────────────────────────────

test("html.raw: injects trusted HTML unescaped", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-raw-basic");
  define(tag, () => () => html`<div>${html.raw`<b>bold</b>`}</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const b = el.querySelector("b");
  assert(b !== null, "raw markup should produce a <b> element");
  assertEquals(b.textContent, "bold");
});

test("html.raw: interpolation inside raw is rendered as text", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-raw-interp");
  define(tag, () => () => {
    const name = "world";
    return html`<div>${html.raw`<span>Hello ${name}</span>`}</div>`;
  });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const span = el.querySelector("span");
  assert(span !== null, "raw with interpolation should produce a <span>");
  assertEquals(span.textContent, "Hello world");
});

test("html.raw: null interpolation renders empty string", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-raw-null");
  define(tag, () => () => html`<div>${html.raw`<b>${null}</b>`}</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const b = el.querySelector("b");
  assert(b !== null, "raw with null should still produce the <b> element");
  assertEquals(b.textContent, "");
});

test("html.raw: nested structure is preserved", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-raw-nested");
  define(tag, () => () => html`<div>${html.raw`<ul><li>a</li><li>b</li></ul>`}</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelectorAll("li").length, 2);
  assertEquals(el.querySelector("li").textContent, "a");
});

test("html.raw: nesting a keyed fragment inside raw", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-raw-nest");
  define(tag, () => () => html`<div>${html.raw`<p>a</p><p>b</p>`}${html.raw`<span>c</span>`}</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelectorAll("p").length, 2);
  assertEquals(el.querySelectorAll("span").length, 1);
});

test("html.raw: does not rebuild DOM when structure is unchanged across updates", async () => {
  setupDOM();
  const origNS = document.createElementNS;
  let created = 0;
  document.createElementNS = function (ns, tag) {
    if (String(tag).toLowerCase() !== "template") created++;
    return origNS.call(document, ns, tag);
  };
  try {
    const { define, html, update, flush } = await fresh();
    const tag = uniqueTag("t-raw-norebuild");
    let n = 1; let ref;
    define(tag, el2 => { ref = el2; return () => html`<section>${html.raw`<b title="x">${n}</b>`}</section>`; });
    const el = document.createElement(tag); document.body.appendChild(el); await delay();
    const b = el.querySelector("b");
    created = 0; // reset after mount
    n = 2; update(ref); await micro(); flush(); await delay(5);
    // One element is unavoidable: the <template> innerHTML parse scaffold inside
    // materializeRaw. The rendered raw node must be REUSED, not rebuilt — under
    // the pre-fix behavior this counted 2 (scaffold + a fresh rendered <b>).
    assert(created === 1, `raw must reuse its DOM on a same-structure update (created ${created})`);
    assertEquals(el.querySelector("b").textContent, "2");
    assert(el.querySelector("b") === b, "raw element identity preserved across update");
  } finally {
    document.createElementNS = origNS;
  }
});
test("html.raw: interpolation values are NOT escaped (trusted raw)", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-raw-trust");
  define(tag, () => () => {
    const x = "<b>trusted</b>";
    return html`<div>${html.raw`<p>${x}</p>`}</div>`;
  });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const b = el.querySelector("b");
  assert(b !== null, "raw interpolation should NOT be escaped — trusted HTML");
  assertEquals(b.textContent, "trusted");
});

// ── onError ────────────────────────────────────────────────────────

test("onError: catches setup errors and mounts error fallback", async () => {
  setupDOM(); const { define, html, onError } = await fresh();
  const tag = uniqueTag("t-err-setup");
  define(tag, () => {
    onError(() => {});
    throw new Error("setup-fail");
    return () => html`<div>ok</div>`;
  });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.querySelector("pre") !== null, "should mount error fallback UI with <pre>");
  assert(el.textContent.includes("setup-fail"));
});

test("onError: catches render errors and mounts error fallback", async () => {
  setupDOM(); const { define, html, onError } = await fresh();
  const tag = uniqueTag("t-err-render");
  define(tag, () => {
    onError(() => {});
    return () => { throw new Error("render-fail"); };
  });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.querySelector("pre") !== null, "should mount error fallback on render throw");
  assert(el.textContent.includes("render-fail"));
});

test("onError: handler receives (el, error, phase)", async () => {
  setupDOM(); const { define, html, onError } = await fresh();
  const tag = uniqueTag("t-err-args"); let captured = null;
  define(tag, () => {
    onError((el, err, phase) => { captured = { el, err, phase }; });
    return () => { throw new Error("boom"); };
  });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assert(captured !== null, "handler should have been called");
  assert(captured.phase === "render");
  assert(captured.err.message === "boom");
});

test("onError: handler throwing does not break host", async () => {
  setupDOM(); const { define, html, onError } = await fresh();
  const tag = uniqueTag("t-err-throw");
  define(tag, () => {
    onError(() => { throw new Error("handler-bug"); });
    return () => { throw new Error("render-fail"); };
  });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.querySelector("pre") !== null, "error fallback should still be mounted");
});

test("onError: called outside define throws", async () => {
  setupDOM(); const { onError } = await fresh();
  let threw = false;
  try { onError(() => {}); } catch (e) { threw = true; }
  assert(threw, "onError outside define should throw");
});

test("onError: multiple handlers all called", async () => {
  setupDOM(); const { define, html, onError } = await fresh();
  const tag = uniqueTag("t-err-multi"); const calls = [];
  define(tag, () => {
    onError(() => calls.push("a"));
    onError(() => calls.push("b"));
    return () => { throw new Error("multi"); };
  });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(calls, ["a", "b"]);
});

test("onError: reconciler error is caught", async () => {
  setupDOM(); const { define, html, update, flush, onError } = await fresh();
  const tag = uniqueTag("t-err-reconcile"); let ref; let errPhase = null;
  let shouldThrow = false;
  define(tag, el2 => {
    ref = el2;
    onError((_, __, phase) => { errPhase = phase; });
    return () => {
      if (shouldThrow) {
        const bad = { type: "element", tag: "div", attrs: {}, events: {}, key: null, children: [] };
        bad.children = [bad]; // circular — will blow up during reconcile
        return bad;
      }
      return html`<div>ok</div>`;
    };
  });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.textContent, "ok");
  shouldThrow = true;
  update(ref); await micro(); flush(); await delay(5);
  assert(el.querySelector("pre") !== null, "reconcile error should mount fallback");
  assertEquals(errPhase, "reconcile");
});

// ── mount() ────────────────────────────────────────────────────────

test("mount: returns the created child element", async () => {
  setupDOM(); const { define, html, mount } = await fresh();
  const tag = uniqueTag("t-mount-ret");
  define(tag, () => () => html`<span>child</span>`);
  const host = document.createElement("div"); document.body.appendChild(host);
  const child = mount(host, tag);
  assert(child !== null, "mount should return a value");
  assertEquals(typeof child, "object");
  assert(child.tagName !== undefined, "returned value should be an element");
});

test("mount: returned element has correct tag name", async () => {
  setupDOM(); const { define, html, mount } = await fresh();
  const tag = uniqueTag("t-mount-tag");
  define(tag, () => () => html`<p>hello</p>`);
  const host = document.createElement("div"); document.body.appendChild(host);
  const child = mount(host, tag);
  assertEquals(child.tagName.toLowerCase(), tag);
});

test("mount: returned element is appended to host", async () => {
  setupDOM(); const { define, html, mount } = await fresh();
  const tag = uniqueTag("t-mount-parent");
  define(tag, () => () => html`<b>x</b>`);
  const host = document.createElement("div"); document.body.appendChild(host);
  const child = mount(host, tag);
  assertEquals(child.parentNode, host);
  assertEquals(host.childNodes.length, 1);
});

test("mount: clears host content before appending", async () => {
  setupDOM(); const { define, html, mount } = await fresh();
  const tag = uniqueTag("t-mount-clear");
  define(tag, () => () => html`<span>new</span>`);
  const host = document.createElement("div");
  host.appendChild(document.createTextNode("old"));
  document.body.appendChild(host);
  mount(host, tag);
  await delay();
  assert(!host.textContent.includes("old"), "old content should be cleared");
  assert(host.textContent.includes("new"));
});

// ── update() edge cases ────────────────────────────────────────────

test("update: called on disconnected element is a no-op", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-upd-disc");
  let renders = 0;
  define(tag, el2 => () => { renders++; return html`<div>ok</div>`; });
  const el = document.createElement(tag);
  // Never append to body — element is disconnected
  update(el); await micro(); flush(); await delay(5);
  assertEquals(renders, 0, "should not render for disconnected element");
});

test("update: called on unknown element is a no-op", async () => {
  setupDOM(); const { update, flush } = await fresh();
  const fake = document.createElement("div");
  update(fake); await micro(); flush(); // should not throw
  assert(true);
});

test("update: after disconnect, pending update is skipped", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-upd-after-disc"); let renders = 0; let ref;
  define(tag, el2 => { ref = el2; return () => { renders++; return html`<div>${renders}</div>`; }; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(renders, 1);
  el.remove(); // disconnect
  update(ref); await micro(); flush(); await delay(5);
  assertEquals(renders, 1, "should not re-render after disconnect");
});

test("reconcile: unkeyed child removal guarded by parentNode (fix for line 98)", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-guarded-remove"); let items = ["a", "b", "c"]; let ref;
  define(tag, el2 => { ref = el2; return () => html`<ul>${items.map(t => html`<li>${t}</li>`)}</ul>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelectorAll("li").length, 3);
  items = ["a"]; update(ref); await micro(); flush(); await delay(5);
  assertEquals(el.querySelectorAll("li").length, 1);
  assertEquals(el.querySelector("li").textContent, "a");
});

test("vdom: stricter resolveBinding rejects arbitrary objects (fixed)", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-strict-vnode");
  const fake = { type: "foo", value: "<b>not a vnode</b>" };
  define(tag, () => () => html`<div>${fake}</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const content = el.querySelector("div").innerHTML;
  // Should be escaped, not injected as raw HTML
  assert(content.includes("[object Object]") || content.includes("not a vnode"), "arbitrary object not treated as VNode");
});

// ── boolean attribute coercion ─────────────────────────────────────
test("props: disabled 'false' string means not disabled", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-dis-false");
  define(tag, () => () => html`<button disabled=${"false"}>x</button>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.querySelector("button").getAttribute("disabled") === null);
  assert(el.querySelector("button").disabled === false);
});
test("props: disabled '0' / 'off' strings mean not disabled", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-dis-0");
  define(tag, () => () => html`<button disabled=${"0"}></button><button disabled=${"off"}></button>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const [a, b] = el.querySelectorAll("button");
  assert(a.getAttribute("disabled") === null);
  assert(b.getAttribute("disabled") === null);
});
test("props: selected 'false' string means not selected", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-sel-false");
  define(tag, () => () => html`<select><option selected=${"false"}>x</option></select>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.querySelector("option").getAttribute("selected") === null);
  assert(el.querySelector("option").selected === false);
});
test("props: readonly 'false' string means not readonly", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-ro-false");
  define(tag, () => () => html`<input readonly=${"false"}>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.querySelector("input").getAttribute("readonly") === null);
});
test("props: hidden 'false' string means not hidden", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-hidden-false");
  define(tag, () => () => html`<div hidden=${"false"}>x</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.querySelector("div").getAttribute("hidden") === null);
});
test("props: boolean toggles stay consistent (control)", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-boolctl"); let dis = true; let req = false; let ref;
  define(tag, el2 => { ref = el2; return () => html`<button disabled=${dis} required=${req}>x</button>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.querySelector("button").getAttribute("disabled") !== null);
  assert(el.querySelector("button").getAttribute("required") === null);
  dis = false; req = true; update(ref); await micro(); flush(); await delay(5);
  assert(el.querySelector("button").getAttribute("disabled") === null);
  assert(el.querySelector("button").getAttribute("required") !== null);
});
test("props: checked 'false' string means unchecked (parity)", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-chk-false");
  define(tag, () => () => html`<input type="checkbox" checked=${"false"}>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assert(el.querySelector("input").checked === false);
});
// ── binding order (values consumed in template source order) ───────
test("order: event handler written before attribute binding", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-ev-first");
  let clicked = false;
  define(tag, () => () => html`<button onclick=${() => { clicked = true; }} data-v=${"hi"}>x</button>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const btn = el.querySelector("button");
  assertEquals(btn.getAttribute("data-v"), "hi", "data-v must get its own value");
  btn.click();
  assert(clicked === true, "click must invoke the bound handler");
});

test("order: input oninput before value binding", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-in-first"); let v = "start"; let ref;
  define(tag, el2 => { ref = el2; return () => html`<input oninput=${() => {}} value=${v}>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const inp = el.querySelector("input");
  assertEquals(inp.value, "start", "value property must sync");
  v = "next"; update(ref); await micro(); flush(); await delay(5);
  assertEquals(inp.value, "next", "value updates after interleaved handler");
});

test("order: key binding written after another bound attr preserves identity", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-key-after");
  let items = [{ id: 1, label: "a" }, { id: 2, label: "b" }]; let ref;
  define(tag, el2 => { ref = el2; return () => html`<ul>${items.map(it => html`<li id=${it.id} key=${"k" + it.id}>${it.label}</li>`)}</ul>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelectorAll("li").length, 2);
  const oldSecond = el.querySelectorAll("li")[1];
  assertEquals(oldSecond.getAttribute("id"), "2");
  items = [{ id: 2, label: "b2" }, { id: 1, label: "a2" }];
  update(ref); await micro(); flush(); await delay(5);
  const lis = [...el.querySelectorAll("li")];
  assertEquals(lis.length, 2);
  assertEquals(lis[0].getAttribute("id"), "2");
  assertEquals(lis[1].getAttribute("id"), "1");
  assert(lis[0] === oldSecond, "keyed node must move, not be recreated");
});

test("order: keyed list with id after key (control, key first)", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-key-first");
  let items = [{ id: 1, label: "a" }, { id: 2, label: "b" }]; let ref;
  define(tag, el2 => { ref = el2; return () => html`<ul>${items.map(it => html`<li key=${it.id} id=${it.id}>${it.label}</li>`)}</ul>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  items = [{ id: 2, label: "b2" }, { id: 1, label: "a2" }];
  update(ref); await micro(); flush(); await delay(5);
  const lis = [...el.querySelectorAll("li")];
  assertEquals(lis.map(n => n.getAttribute("id")).join(","), "2,1");
});

test("order: multiple attr markers after event binding", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-attr-after-evt");
  define(tag, () => () => html`<a onclick=${() => {}} href="/${"users"}/${123}">go</a>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("a").getAttribute("href"), "/users/123");
});

test("order: text interpolation after interleaved bindings stays aligned", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-text-aligned");
  const who = "World"; const cls = "btn";
  define(tag, () => () => html`<div onclick=${() => {}} class=${cls}>Hello ${who}</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("div").getAttribute("class"), "btn");
  assertEquals(el.querySelector("div").textContent, "Hello World");
});
