const MARKER = "\ue000";
const instances = new WeakMap();
const templates = new WeakMap();
const pending = new Set();
let flushing = false;
let deferDOM = false;

// ── html template tag (cached) ─────────────────────────────────────

export function html(strings, ...values) {
  let tpl = templates.get(strings);
  if (!tpl) {
    tpl = buildTemplate(strings);
    templates.set(strings, tpl);
  }
  return createTree(tpl, values, deferDOM);
}

// `html.raw\`...\`` returns a trusted-HTML node that bypasses text
// escaping. Use only for content you control; everything user-supplied
// must flow through the default (escaped) `html\`\``.
html.raw = function raw(strings, ...values) {
  return wrapRaw(buildRawString(strings, values));
};

function buildTemplate(strings) {
  let s = "";
  for (let i = 0; i < strings.length; i++) {
    s += strings[i];
    if (i < strings.length - 1) s += MARKER;
  }
  const el = document.createElement("template");
  el.innerHTML = s;
  const bindings = [];
  const tree = buildDesc(el.content, bindings);
  return { tree, bindings };
}

function buildDesc(container, bindings) {
  const nodes = [];
  for (const n of Array.from(container.childNodes)) {
    if (n.nodeType === 1) {
      nodes.push(buildElDesc(n, bindings));
    } else if (n.nodeType === 3) {
      const t = n.textContent;
      if (t.includes(MARKER)) {
        const parts = t.split(MARKER);
        for (let j = 0; j < parts.length; j++) {
          if (j > 0) {
            bindings.push({ type: "text" });
            nodes.push({ type: "binding" });
          }
          if (parts[j] !== "") {
            nodes.push({ type: "text", value: parts[j] });
          }
        }
      } else if (t && t.trim()) {
        nodes.push({ type: "text", value: t });
      }
    }
  }
  return nodes;
}

function buildElDesc(el, bindings) {
  const tag = el.tagName.toLowerCase();
  const attrs = {};
  const events = {};
  let key = null;

  for (const a of Array.from(el.attributes)) {
    const name = a.name;
    const value = a.value;

    // key is special — never set as DOM attribute
    if (name === "key") {
      if (value.includes(MARKER)) {
        const parts = value.split(MARKER);
        for (let i = 0; i < parts.length - 1; i++) bindings.push({ type: "key" });
        key = { binding: true, parts };
      } else {
        key = value;
      }
      continue;
    }

    // event bindings: on* with marker inside
    const isOnEvent = name.startsWith("on");
    if (value.includes(MARKER) && isOnEvent) {
      const ev = name.slice(2);
      const parts = value.split(MARKER);
      // expect exactly one marker for event handler
      for (let i = 0; i < parts.length - 1; i++) bindings.push({ type: "event", name: ev });
      events[ev] = { binding: true };
      continue;
    }
    // static on* attribute (unlikely) treat as event string
    if (isOnEvent && !value.includes(MARKER)) {
      events[name.slice(2)] = value;
      continue;
    }

    // dynamic attribute interpolations (including prefix/suffix and multiple markers)
    if (value.includes(MARKER)) {
      const parts = value.split(MARKER);
      for (let i = 0; i < parts.length - 1; i++) bindings.push({ type: "attr", name });
      attrs[name] = { binding: true, parts };
    } else {
      attrs[name] = value;
    }
  }

  return {
    type: "element",
    tag,
    attrs,
    events,
    key,
    children: buildDesc(el, bindings),
  };
}

// ── tree creation (clone cached desc + inject values) ──────────────

function createTree(tpl, values, deferDOM) {
  return { type: "fragment", children: createNodes(tpl.tree, values, { vi: 0 }, deferDOM) };
}

function createNodes(descs, values, state, deferDOM) {
  const out = [];
  for (const d of descs) pushNodes(cloneNode(d, values, state, deferDOM), out);
  return out;
}

function pushNodes(node, out) {
  if (node.type === "fragment") {
    for (const c of node.children) pushNodes(c, out);
  } else {
    out.push(node);
  }
}

function cloneNode(d, values, state, deferDOM) {
  if (d.type === "text") {
    if (deferDOM) return { type: "text", value: d.value };
    return { type: "text", value: d.value, dom: document.createTextNode(d.value) };
  }
  if (d.type === "binding") {
    const v = values[state.vi++];
    return resolveBinding(v, deferDOM);
  }
  if (d.type === "element") {
    let resolvedKey = d.key;

    // resolve dynamic key
    if (d.key && d.key.binding) {
      const parts = d.key.parts;
      if (parts.length === 2 && parts[0] === "" && parts[1] === "") {
        resolvedKey = values[state.vi++];
        // normalize to string for map lookup but keep original
        if (resolvedKey != null) resolvedKey = String(resolvedKey);
      } else {
        let out = "";
        for (let i = 0; i < parts.length; i++) {
          out += parts[i];
          if (i < parts.length - 1) out += String(values[state.vi++] ?? "");
        }
        resolvedKey = out;
      }
    }

    const attrs = {};
    for (const k in d.attrs) {
      const v = d.attrs[k];
      if (v && v.binding) {
        const parts = v.parts;
        if (parts.length === 2 && parts[0] === "" && parts[1] === "") {
          attrs[k] = values[state.vi++];
        } else {
          let out = "";
          for (let i = 0; i < parts.length; i++) {
            out += parts[i];
            if (i < parts.length - 1) out += String(values[state.vi++] ?? "");
          }
          attrs[k] = out;
        }
      } else {
        attrs[k] = v;
      }
    }

    const events = {};
    for (const e in d.events) {
      const h = d.events[e];
      if (h && h.binding) {
        events[e] = values[state.vi++];
      } else {
        events[e] = h;
      }
    }

    const children = createNodes(d.children, values, state, deferDOM);

    if (deferDOM) {
      return { type: "element", tag: d.tag, attrs, events, key: resolvedKey, children };
    }

    const el = document.createElement(d.tag);
    for (const k in attrs) setProp(el, k, attrs[k]);
    for (const e in events) { if (events[e] != null) el.addEventListener(e, events[e]); }
    for (const c of children) el.appendChild(c.dom);

    return { type: "element", tag: d.tag, attrs, events, key: resolvedKey, children, dom: el };
  }
}

function resolveBinding(val, deferDOM) {
  if (val == null || val === false) {
    if (deferDOM) return { type: "text", value: "" };
    return { type: "text", value: "", dom: document.createTextNode("") };
  }
  if (Array.isArray(val)) {
    const nodes = [];
    for (const item of val) nodes.push(resolveBinding(item, deferDOM));
    return { type: "fragment", children: nodes };
  }
  if (val && val.type) {
    if (val.type === "fragment") return val;
    if (val.type === "raw") return materializeRaw(val);
    return val;
  }
  // primitive: escape before creating a text node
  const s = escapeText(String(val));
  if (deferDOM) return { type: "text", value: s };
  return { type: "text", value: s, dom: document.createTextNode(s) };
}

// ── text escaping (XSS defense) ────────────────────────────────────

const ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const ESCAPE_RE = /[&<>"']/g;

function escapeText(s) {
  return s.replace(ESCAPE_RE, (c) => ESCAPE_MAP[c]);
}

// ── html.raw (trusted strings) ─────────────────────────────────────

function buildRawString(strings, values) {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < strings.length - 1) {
      const v = values[i];
      out += v == null || v === false ? "" : Array.isArray(v) ? v.join("") : String(v);
    }
  }
  return out;
}

function wrapRaw(htmlString) {
  return { type: "raw", html: htmlString };
}

function materializeRaw(raw) {
  const tmpl = document.createElement("template");
  tmpl.innerHTML = raw.html;
  const children = buildDesc(tmpl.content, []);
  return { type: "fragment", children: createNodes(children, [], { vi: 0 }) };
}

// ── materialize deferred descriptors ────────────────────────────────

function materializeNode(node) {
  if (node.dom) return;
  if (node.type === "text") {
    node.dom = document.createTextNode(node.value);
  } else if (node.type === "element") {
    const el = document.createElement(node.tag);
    for (const k in node.attrs) setProp(el, k, node.attrs[k]);
    for (const e in node.events) { if (node.events[e] != null) el.addEventListener(e, node.events[e]); }
    for (const c of node.children) {
      materializeNode(c);
      el.appendChild(c.dom);
    }
    node.dom = el;
  } else if (node.type === "fragment") {
    for (const c of node.children) materializeNode(c);
  }
}

// ── DOM property helper ────────────────────────────────────────────

function setProp(el, k, v) {
  // handle form control properties specially
  if (k === "value") {
    if (v == null) {
      el.removeAttribute(k);
      el.value = "";
    } else {
      el.value = String(v);
      el.setAttribute(k, String(v));
    }
    return;
  }
  if (k === "checked") {
    const b = !!v && v !== "" && v !== "false" && v !== false;
    el.checked = b;
    if (b) el.setAttribute(k, "");
    else el.removeAttribute(k);
    return;
  }
  if (k === "selected" || k === "disabled" || k === "indeterminate") {
    const b = !!v && v !== "" && v !== false;
    el[k] = b;
    if (b) el.setAttribute(k, "");
    else el.removeAttribute(k);
    return;
  }
  if (v == null || v === false) {
    el.removeAttribute(k);
    // also clear property if exists
    try { if (k in el) el[k] = undefined; } catch {}
  } else if (v === true) {
    el.setAttribute(k, "");
    try { if (k in el) el[k] = true; } catch {}
  } else if (typeof v === "string") {
    el.setAttribute(k, v);
  } else {
    try { el[k] = v; } catch {}
    // also reflect as attribute if reasonable
    if (typeof v === "number" || typeof v === "boolean") {
      el.setAttribute(k, String(v));
    }
  }
}

// ── lifecycle hooks ────────────────────────────────────────────────

let pendingReady = null;
let pendingError = null;
const destroyCallbacks = new WeakMap();
const errorHandlers = new WeakMap();

export function onReady(cb) {
  if (!pendingReady) throw new Error("onReady() must be called synchronously inside define(..., setup)");
  pendingReady.push(cb);
}

// `onError(handler)` registers a callback for render / reconcile
// failures inside the current component. The handler signature is
// `(el, error, phase)` where phase is "render" or "reconcile".
// Multiple handlers may be registered; all are called.
export function onError(handler) {
  if (!pendingError) throw new Error("onError() must be called synchronously inside define(..., setup)");
  pendingError.push(handler);
}

// ── define ─────────────────────────────────────────────────────────

let currentEl = null;

export function define(tag, setup) {
  customElements.define(
    tag,
    class extends HTMLElement {
      connectedCallback() {
        const props = {};
        for (const a of this.attributes) props[a.name] = a.value;
        const prevReady = pendingReady;
        const prevError = pendingError;
        pendingReady = [];
        pendingError = [];
        currentEl = this;
        let render;
        let setupError = null;
        try {
          render = setup(this, props);
        } catch (err) {
          setupError = err;
        }
        currentEl = null;
        const cbs = pendingReady;
        const errs = pendingError;
        pendingReady = prevReady;
        pendingError = prevError;

        if (setupError) {
          mountErrorUI(this, setupError);
          instances.set(this, { errored: true });
          if (errs.length) errorHandlers.set(this, errs);
          for (const h of errs) safeCall(h, this, setupError, "setup");
          return;
        }

        try {
          const tree = render();
          this.textContent = "";
          for (const c of tree.children) this.appendChild(c.dom);
          instances.set(this, { render, tree, props, errored: false });
        } catch (err) {
          mountErrorUI(this, err);
          instances.set(this, { errored: true });
          if (errs.length) errorHandlers.set(this, errs);
          for (const h of errs) safeCall(h, this, err, "render");
          return;
        }

        for (const cb of cbs) {
          const cleanup = cb();
          if (typeof cleanup === "function") {
            let list = destroyCallbacks.get(this);
            if (!list) { list = []; destroyCallbacks.set(this, list); }
            list.push(cleanup);
          }
        }
        if (errs.length) errorHandlers.set(this, errs);
      }
      disconnectedCallback() {
        const cbs = destroyCallbacks.get(this);
        if (cbs) for (const cb of cbs) cb();
        destroyCallbacks.delete(this);
        instances.delete(this);
        pending.delete(this);
      }
    }
  );
}

// ── update (batched) ──────────────────────────────────────────────

export function update(el) {
  const inst = instances.get(el);
  if (!inst) return;
  pending.add(el);
  if (!flushing) {
    flushing = true;
    queueMicrotask(flush);
  }
}

export function flush() {
  flushing = false;
  const batch = [...pending];
  pending.clear();
  for (const el of batch) {
    const inst = instances.get(el);
    if (!inst) continue;
    if (inst.errored) continue;
    let newTree;
    try {
      deferDOM = true;
      newTree = inst.render();
      deferDOM = false;
    } catch (err) {
      deferDOM = false;
      mountErrorUI(el, err);
      inst.errored = true;
      const handlers = errorHandlers.get(el);
      if (handlers) for (const h of handlers) safeCall(h, el, err, "render");
      continue;
    }
    try {
      reconcile(inst.tree, newTree, el);
    } catch (err) {
      mountErrorUI(el, err);
      inst.errored = true;
      const handlers = errorHandlers.get(el);
      if (handlers) for (const h of handlers) safeCall(h, el, err, "reconcile");
      continue;
    }
    inst.tree = newTree;
  }
}

// ── mount ──────────────────────────────────────────────────────────

export function mount(el, tag) {
  el.textContent = "";
  const child = document.createElement(tag);
  el.appendChild(child);
  return child;
}

// ── error fallback ─────────────────────────────────────────────────

function mountErrorUI(el, err) {
  // Best-effort inline error. If even this throws, the host page is
  // already broken — there's nothing more we can do.
  try {
    el.textContent = "";
    const box = document.createElement("div");
    box.setAttribute("data-micro-ui-error", "");
    const msg = err && err.message ? String(err.message) : String(err);
    const pre = document.createElement("pre");
    pre.style.whiteSpace = "pre-wrap";
    pre.style.margin = "0";
    pre.textContent = msg;
    box.appendChild(pre);
    el.appendChild(box);
  } catch {
    /* swallow */
  }
}

function safeCall(fn, el, err, phase) {
  try {
    fn(el, err, phase);
  } catch (e) {
    console.error(
      `[micro-ui] onError handler threw while processing ${phase} error on <${el.tagName?.toLowerCase?.() || "?"}>:`,
      e && e.message ? e.message : e
    );
  }
}

// ── reconciliation ─────────────────────────────────────────────────

function reconcile(old, next, parent) {
  if (old.type !== next.type) {
    materializeNode(next);
    parent.replaceChild(next.dom, old.dom);
    return;
  }
  if (old.type === "text") {
    if (String(old.value) !== String(next.value)) old.dom.nodeValue = String(next.value);
    next.dom = old.dom;
    return;
  }
  if (old.type === "fragment") {
    patchLists(old.children, next.children, parent);
    return;
  }
  if (old.type === "element") {
    if (old.tag !== next.tag) {
      materializeNode(next);
      parent.replaceChild(next.dom, old.dom);
      return;
    }
    // same tag: reuse old DOM, discard the throwaway
    const dom = old.dom;
    next.dom = dom;
    patchAttrs(dom, old.attrs, next.attrs);
    patchEvents(dom, old.events, next.events);
    // sync props for child micro-ui components
    const inst = instances.get(dom);
    if (inst && inst.props) {
      let changed = false;
      for (const k in next.attrs) {
        if (inst.props[k] !== String(next.attrs[k])) changed = true;
        inst.props[k] = next.attrs[k] == null ? undefined : String(next.attrs[k]);
      }
      for (const k in inst.props) {
        if (!(k in next.attrs)) { delete inst.props[k]; changed = true; }
      }
      // also handle removed attrs via patchAttrs already
      if (changed) update(dom);
    }
    patchLists(old.children, next.children, dom);
  }
}

// ── keyed list reconciliation ──────────────────────────────────────

function patchLists(oldCh, newCh, parent) {
  if (newCh.length === 1 && oldCh.length === 1) {
    const o = oldCh[0];
    const n = newCh[0];
    if (o.type === n.type) {
      reconcile(o, n, parent);
      return;
    }
    // type mismatch: materialize the new one, then replace
    materializeNode(n);
    parent.replaceChild(n.dom, o.dom);
    return;
  }

  const hasKeys = newCh.some((n) => n.key != null) || oldCh.some((o) => o.key != null);
  if (hasKeys) {
    patchKeyed(oldCh, newCh, parent);
  } else {
    patchByIndex(oldCh, newCh, parent);
  }
}

function patchByIndex(oldCh, newCh, parent) {
  const len = Math.max(oldCh.length, newCh.length);
  for (let i = 0; i < len; i++) {
    const o = oldCh[i];
    const n = newCh[i];
    if (!o) {
      materializeNode(n);
      parent.appendChild(n.dom);
    } else if (!n) {
      o.dom.remove();
    } else {
      materializeNode(n);
      reconcile(o, n, parent);
    }
  }
}

function patchKeyed(oldCh, newCh, parent) {
  const oldMap = new Map();
  for (const o of oldCh) if (o.key != null) oldMap.set(String(o.key), o);
  let next = null;
  for (let i = newCh.length - 1; i >= 0; i--) {
    const n = newCh[i];
    const o = n.key != null ? oldMap.get(String(n.key)) : null;
    if (o && o.dom.parentNode === parent) {
      materializeNode(n);
      reconcile(o, n, parent);
      if (o.dom.nextSibling !== next) parent.insertBefore(o.dom, next);
      next = o.dom;
      oldMap.delete(String(n.key));
    } else {
      // fallback: non-keyed position or new key
      const fallback = n.key == null ? oldCh[i] : null;
      if (fallback && fallback.dom.parentNode === parent && fallback.key == null) {
        materializeNode(n);
        reconcile(fallback, n, parent);
        if (fallback.dom.nextSibling !== next) parent.insertBefore(fallback.dom, next);
        next = fallback.dom;
      } else {
        materializeNode(n);
        parent.insertBefore(n.dom, next);
        next = n.dom;
      }
    }
  }
  for (const o of oldMap.values()) if (o.dom.parentNode === parent) o.dom.remove();
}

function findDom(node, parent) {
  if (node.type === "fragment") {
    for (let i = node.children.length - 1; i >= 0; i--) {
      const d = findDom(node.children[i], parent);
      if (d && d.parentNode === parent) return d;
    }
    return null;
  }
  if (node.dom && node.dom.parentNode === parent) return node.dom;
  return null;
}

// ── attribute patching ─────────────────────────────────────────────

function patchAttrs(el, old, next) {
  for (const k in old) if (!(k in next)) setProp(el, k, null);
  for (const k in next)
    if (old[k] !== next[k]) setProp(el, k, next[k]);
}

function patchEvents(el, old, next) {
  for (const e in old)
    if (old[e] != null && (!(e in next) || next[e] !== old[e]))
      el.removeEventListener(e, old[e]);
  for (const e in next)
    if (next[e] != null && old[e] !== next[e]) el.addEventListener(e, next[e]);
}
