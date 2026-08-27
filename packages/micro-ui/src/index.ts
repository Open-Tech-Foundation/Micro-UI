const MARKER = "\ue000";
const instances = new WeakMap<HTMLElement, InstanceRecord>();
const templates = new WeakMap<TemplateStringsArray, TemplateCache>();
const pending = new Set<HTMLElement>();
let flushing = false;
let deferDOM = false;

// ── types ──────────────────────────────────────────────────────────

type AttrValue = string | { binding: true; parts: string[] };
type EventValue = string | ((e: Event) => void) | { binding: true };

interface BindingDesc {
  type: "binding";
  binding: true;
  parts?: string[];
  name?: string;
}

interface TextDesc {
  type: "text";
  value: string;
}

interface ElementDesc {
  type: "element";
  tag: string;
  attrs: Record<string, AttrValue>;
  events: Record<string, EventValue>;
  key: string | BindingDesc | null;
  children: DescNode[];
}

type DescNode = TextDesc | BindingDesc | ElementDesc;

interface TextVNode {
  type: "text";
  value: string;
  dom?: Text;
}

interface ElementVNode {
  type: "element";
  tag: string;
  attrs: Record<string, unknown>;
  events: Record<string, unknown>;
  key: string | null | undefined;
  children: VNode[];
  dom?: Element;
}

interface FragmentVNode {
  type: "fragment";
  children: VNode[];
  dom?: undefined;
}

type VNode = TextVNode | ElementVNode | FragmentVNode;

interface RawVNode {
  type: "raw";
  html: string;
}

interface TemplateCache {
  tree: DescNode[];
  bindings: BindingDesc[];
}

interface InstanceRecord {
  render: () => VNode;
  tree: VNode;
  props: Record<string, string>;
  errored: boolean;
}

type ErrorPhase = "setup" | "render" | "reconcile";
type ErrorHandler = (el: HTMLElement, err: Error, phase: ErrorPhase) => void;
type ReadyCallback = () => (() => void) | undefined;
type CleanupFn = () => void;
type SetupFn = (el: HTMLElement, props: Record<string, string>) => () => VNode;

// ── html template tag (cached) ─────────────────────────────────────

export interface HtmlTag {
  (strings: TemplateStringsArray, ...values: unknown[]): VNode;
  raw(strings: TemplateStringsArray, ...values: unknown[]): RawVNode;
}

function htmlImpl(strings: TemplateStringsArray, ...values: unknown[]): VNode {
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
htmlImpl.raw = function raw(
  strings: TemplateStringsArray,
  ...values: unknown[]
): RawVNode {
  return wrapRaw(buildRawString(strings, values));
};

export const html: HtmlTag = htmlImpl;

function buildTemplate(strings: TemplateStringsArray): TemplateCache {
  let s = "";
  for (let i = 0; i < strings.length; i++) {
    s += strings[i];
    if (i < strings.length - 1) s += MARKER;
  }
  const el = document.createElement("template");
  el.innerHTML = s;
  const bindings: BindingDesc[] = [];
  const tree = buildDesc(el.content, bindings);
  return { tree, bindings };
}

function buildDesc(
  container: Element | DocumentFragment,
  bindings: BindingDesc[],
): DescNode[] {
  const nodes: DescNode[] = [];
  for (const n of Array.from(container.childNodes)) {
    if (n.nodeType === 1) {
      nodes.push(buildElDesc(n as Element, bindings));
    } else if (n.nodeType === 3) {
      const t = n.textContent ?? "";
      if (t.includes(MARKER)) {
        const parts = t.split(MARKER);
        for (let j = 0; j < parts.length; j++) {
          if (j > 0) {
            bindings.push({ type: "binding", binding: true });
            nodes.push({ type: "binding", binding: true });
          }
          if (parts[j] !== "") {
            nodes.push({ type: "text", value: parts[j] });
          }
        }
      } else if (t?.trim()) {
        nodes.push({ type: "text", value: t });
      }
    }
  }
  return nodes;
}

function buildElDesc(el: Element, bindings: BindingDesc[]): ElementDesc {
  const tag = el.tagName.toLowerCase();
  const attrs: Record<string, AttrValue> = {};
  const events: Record<string, EventValue> = {};
  let key: string | BindingDesc | null = null;

  for (const a of Array.from(el.attributes)) {
    const name = a.name;
    const value = a.value;

    // key is special — never set as DOM attribute
    if (name === "key") {
      if (value.includes(MARKER)) {
        const parts = value.split(MARKER);
        for (let i = 0; i < parts.length - 1; i++)
          bindings.push({ type: "binding", binding: true });
        key = { type: "binding", binding: true, parts };
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
      for (let i = 0; i < parts.length - 1; i++)
        bindings.push({ type: "binding", binding: true, name: ev });
      events[ev] = { type: "binding", binding: true };
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
      for (let i = 0; i < parts.length - 1; i++)
        bindings.push({ type: "binding", binding: true, name });
      attrs[name] = { type: "binding", binding: true, parts };
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

function createTree(
  tpl: TemplateCache,
  values: unknown[],
  deferDOM: boolean,
): VNode {
  return {
    type: "fragment",
    children: createNodes(tpl.tree, values, { vi: 0 }, deferDOM),
  };
}

function createNodes(
  descs: DescNode[],
  values: unknown[],
  state: { vi: number },
  deferDOM: boolean,
): VNode[] {
  const out: VNode[] = [];
  for (const d of descs) pushNodes(cloneNode(d, values, state, deferDOM), out);
  return out;
}

function pushNodes(node: VNode, out: VNode[]): void {
  if (node.type === "fragment") {
    for (const c of node.children) pushNodes(c, out);
  } else {
    out.push(node);
  }
}

function cloneNode(
  d: DescNode,
  values: unknown[],
  state: { vi: number },
  deferDOM: boolean,
): VNode {
  if (d.type === "text") {
    if (deferDOM) return { type: "text", value: d.value };
    return {
      type: "text",
      value: d.value,
      dom: document.createTextNode(d.value),
    };
  }
  if (d.type === "binding") {
    const v = values[state.vi++];
    return resolveBinding(v, deferDOM);
  }
  if (d.type === "element") {
    let resolvedKey: string | null | undefined =
      typeof d.key === "string" ? d.key : undefined;

    // resolve dynamic key
    if (d.key && typeof d.key === "object" && d.key.binding) {
      const parts = d.key.parts!;
      if (parts.length === 2 && parts[0] === "" && parts[1] === "") {
        resolvedKey = values[state.vi++] as string | undefined;
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

    const attrs: Record<string, unknown> = {};
    for (const k in d.attrs) {
      const v = d.attrs[k];
      if (v && typeof v === "object" && v.binding) {
        const parts = v.parts!;
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

    const events: Record<string, unknown> = {};
    for (const e in d.events) {
      const h = d.events[e];
      if (h && typeof h === "object" && h.binding) {
        events[e] = values[state.vi++];
      } else {
        events[e] = h;
      }
    }

    const children = createNodes(d.children, values, state, deferDOM);

    if (deferDOM) {
      return {
        type: "element",
        tag: d.tag,
        attrs,
        events,
        key: resolvedKey,
        children,
      };
    }

    const el = document.createElement(d.tag);
    for (const k in attrs) setProp(el, k, attrs[k]);
    for (const e in events) {
      if (events[e] != null) el.addEventListener(e, events[e] as EventListener);
    }
    for (const c of children) el.appendChild(c.dom!);

    return {
      type: "element",
      tag: d.tag,
      attrs,
      events,
      key: resolvedKey,
      children,
      dom: el,
    };
  }
}

function resolveBinding(val: unknown, deferDOM: boolean): VNode {
  if (val == null || val === false) {
    if (deferDOM) return { type: "text", value: "" };
    return { type: "text", value: "", dom: document.createTextNode("") };
  }
  if (Array.isArray(val)) {
    const nodes: VNode[] = [];
    for (const item of val) nodes.push(resolveBinding(item, deferDOM));
    return { type: "fragment", children: nodes };
  }
  if (val && typeof val === "object" && "type" in val) {
    const vnode = val as VNode | RawVNode;
    if (vnode.type === "fragment") return vnode as VNode;
    if (vnode.type === "raw") return materializeRaw(vnode as RawVNode);
    return vnode as VNode;
  }
  // primitive: escape before creating a text node
  const s = escapeText(String(val));
  if (deferDOM) return { type: "text", value: s };
  return { type: "text", value: s, dom: document.createTextNode(s) };
}

// ── text escaping (XSS defense) ────────────────────────────────────

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const ESCAPE_RE = /[&<>"']/g;

function escapeText(s: string): string {
  return s.replace(ESCAPE_RE, (c) => ESCAPE_MAP[c]);
}

// ── html.raw (trusted strings) ─────────────────────────────────────

function buildRawString(
  strings: TemplateStringsArray,
  values: unknown[],
): string {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < strings.length - 1) {
      const v = values[i];
      out +=
        v == null || v === false
          ? ""
          : Array.isArray(v)
            ? v.join("")
            : String(v);
    }
  }
  return out;
}

function wrapRaw(htmlString: string): RawVNode {
  return { type: "raw", html: htmlString };
}

function materializeRaw(raw: RawVNode): VNode {
  const tmpl = document.createElement("template");
  tmpl.innerHTML = raw.html;
  const children = buildDesc(tmpl.content, []);
  return {
    type: "fragment",
    children: createNodes(children, [], { vi: 0 }, false),
  };
}

// ── materialize deferred descriptors ────────────────────────────────

function materializeNode(node: VNode): void {
  if (node.dom) return;
  if (node.type === "text") {
    node.dom = document.createTextNode(node.value);
  } else if (node.type === "element") {
    const el = document.createElement(node.tag);
    for (const k in node.attrs) setProp(el, k, node.attrs[k]);
    for (const e in node.events) {
      if (node.events[e] != null)
        el.addEventListener(e, node.events[e] as EventListener);
    }
    for (const c of node.children) {
      materializeNode(c);
      el.appendChild(c.dom!);
    }
    node.dom = el;
  } else if (node.type === "fragment") {
    for (const c of node.children) materializeNode(c);
  }
}

// ── DOM property helper ────────────────────────────────────────────

function setProp(el: HTMLElement, k: string, v: unknown): void {
  // handle form control properties specially
  if (k === "value") {
    if (v == null) {
      el.removeAttribute(k);
      (el as HTMLInputElement).value = "";
    } else {
      (el as HTMLInputElement).value = String(v);
      el.setAttribute(k, String(v));
    }
    return;
  }
  if (k === "checked") {
    const b = !!v && v !== "" && v !== "false" && v !== false;
    (el as HTMLInputElement).checked = b;
    if (b) el.setAttribute(k, "");
    else el.removeAttribute(k);
    return;
  }
  if (k === "selected" || k === "disabled" || k === "indeterminate") {
    const b = !!v && v !== "" && v !== false;
    (el as HTMLSelectElement & HTMLInputElement)[
      k as "selected" | "disabled" | "indeterminate"
    ] = b as never;
    if (b) el.setAttribute(k, "");
    else el.removeAttribute(k);
    return;
  }
  if (v == null || v === false) {
    el.removeAttribute(k);
    // also clear property if exists
    try {
      if (k in el) (el as Record<string, unknown>)[k] = undefined;
    } catch {}
  } else if (v === true) {
    el.setAttribute(k, "");
    try {
      if (k in el) (el as Record<string, unknown>)[k] = true;
    } catch {}
  } else if (typeof v === "string") {
    el.setAttribute(k, v);
  } else {
    try {
      (el as Record<string, unknown>)[k] = v;
    } catch {}
    // also reflect as attribute if reasonable
    if (typeof v === "number" || typeof v === "boolean") {
      el.setAttribute(k, String(v));
    }
  }
}

// ── lifecycle hooks ────────────────────────────────────────────────

let pendingReady: ReadyCallback[] | null = null;
let pendingError: ErrorHandler[] | null = null;
const destroyCallbacks = new WeakMap<HTMLElement, CleanupFn[]>();
const errorHandlers = new WeakMap<HTMLElement, ErrorHandler[]>();

export function onReady(cb: ReadyCallback): void {
  if (!pendingReady)
    throw new Error(
      "onReady() must be called synchronously inside define(..., setup)",
    );
  pendingReady.push(cb);
}

// `onError(handler)` registers a callback for render / reconcile
// failures inside the current component. The handler signature is
// `(el, error, phase)` where phase is "render" or "reconcile".
// Multiple handlers may be registered; all are called.
export function onError(handler: ErrorHandler): void {
  if (!pendingError)
    throw new Error(
      "onError() must be called synchronously inside define(..., setup)",
    );
  pendingError.push(handler);
}

// ── define ─────────────────────────────────────────────────────────

export function define(tag: string, setup: SetupFn): void {
  customElements.define(
    tag,
    class extends HTMLElement {
      connectedCallback() {
        const props: Record<string, string> = {};
        for (const a of this.attributes) props[a.name] = a.value;
        const prevReady = pendingReady;
        const prevError = pendingError;
        pendingReady = [];
        pendingError = [];
        let render: (() => VNode) | undefined;
        let setupError: unknown = null;
        try {
          render = setup(this, props);
        } catch (err) {
          setupError = err;
        }
        const cbs = pendingReady;
        const errs = pendingError;
        pendingReady = prevReady;
        pendingError = prevError;

        if (setupError) {
          mountErrorUI(this, setupError);
          instances.set(this, {
            errored: true,
            render: () => ({ type: "fragment", children: [] }),
            tree: { type: "fragment", children: [] },
            props,
          });
          if (errs.length) errorHandlers.set(this, errs);
          for (const h of errs) safeCall(h, this, setupError as Error, "setup");
          return;
        }

        try {
          const tree = render!();
          this.textContent = "";
          for (const c of tree.children) this.appendChild(c.dom!);
          instances.set(this, { render: render!, tree, props, errored: false });
        } catch (err) {
          mountErrorUI(this, err);
          instances.set(this, {
            errored: true,
            render: () => ({ type: "fragment", children: [] }),
            tree: { type: "fragment", children: [] },
            props,
          });
          if (errs.length) errorHandlers.set(this, errs);
          for (const h of errs) safeCall(h, this, err as Error, "render");
          return;
        }

        for (const cb of cbs) {
          const cleanup = cb();
          if (typeof cleanup === "function") {
            let list = destroyCallbacks.get(this);
            if (!list) {
              list = [];
              destroyCallbacks.set(this, list);
            }
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
    },
  );
}

// ── update (batched) ──────────────────────────────────────────────

export function update(el: HTMLElement): void {
  const inst = instances.get(el);
  if (!inst) return;
  pending.add(el);
  if (!flushing) {
    flushing = true;
    queueMicrotask(flush);
  }
}

export function flush(): void {
  flushing = false;
  const batch = [...pending];
  pending.clear();
  for (const el of batch) {
    const inst = instances.get(el);
    if (!inst) continue;
    if (inst.errored) continue;
    let newTree: VNode;
    try {
      deferDOM = true;
      newTree = inst.render();
      deferDOM = false;
    } catch (err) {
      deferDOM = false;
      mountErrorUI(el, err);
      inst.errored = true;
      const handlers = errorHandlers.get(el);
      if (handlers)
        for (const h of handlers) safeCall(h, el, err as Error, "render");
      continue;
    }
    try {
      reconcile(inst.tree, newTree, el);
    } catch (err) {
      mountErrorUI(el, err);
      inst.errored = true;
      const handlers = errorHandlers.get(el);
      if (handlers)
        for (const h of handlers) safeCall(h, el, err as Error, "reconcile");
      continue;
    }
    inst.tree = newTree;
  }
}

// ── mount ──────────────────────────────────────────────────────────

export function mount(el: HTMLElement, tag: string): HTMLElement {
  el.textContent = "";
  const child = document.createElement(tag);
  el.appendChild(child);
  return child;
}

// ── error fallback ─────────────────────────────────────────────────

function mountErrorUI(el: HTMLElement, err: unknown): void {
  // Best-effort inline error. If even this throws, the host page is
  // already broken — there's nothing more we can do.
  try {
    el.textContent = "";
    const box = document.createElement("div");
    box.setAttribute("data-micro-ui-error", "");
    const msg =
      err && typeof err === "object" && "message" in err
        ? String((err as Error).message)
        : String(err);
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

function safeCall(
  fn: ErrorHandler,
  el: HTMLElement,
  err: Error,
  phase: ErrorPhase,
): void {
  try {
    fn(el, err, phase);
  } catch (e) {
    console.error(
      `[micro-ui] onError handler threw while processing ${phase} error on <${el.tagName?.toLowerCase?.() || "?"}>:`,
      e && typeof e === "object" && "message" in e ? (e as Error).message : e,
    );
  }
}

// ── reconciliation ─────────────────────────────────────────────────

function reconcile(
  old: VNode,
  next: VNode,
  parent: HTMLElement | Element | DocumentFragment,
): void {
  if (old.type !== next.type) {
    materializeNode(next);
    parent.replaceChild(next.dom!, old.dom!);
    return;
  }
  if (old.type === "text") {
    if (String(old.value) !== String(next.value))
      old.dom!.nodeValue = String(next.value);
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
      parent.replaceChild(next.dom!, old.dom!);
      return;
    }
    // same tag: reuse old DOM, discard the throwaway
    const dom = old.dom!;
    next.dom = dom;
    patchAttrs(dom as HTMLElement, old.attrs, next.attrs);
    patchEvents(dom as HTMLElement, old.events, next.events);
    // sync props for child micro-ui components
    const inst = instances.get(dom as HTMLElement);
    if (inst?.props) {
      let changed = false;
      for (const k in next.attrs) {
        if (inst.props[k] !== String(next.attrs[k])) changed = true;
        inst.props[k] =
          next.attrs[k] == null ? undefined! : String(next.attrs[k]);
      }
      for (const k in inst.props) {
        if (!(k in next.attrs)) {
          delete inst.props[k];
          changed = true;
        }
      }
      // also handle removed attrs via patchAttrs already
      if (changed) update(dom as HTMLElement);
    }
    patchLists(old.children, next.children, dom);
  }
}

// ── keyed list reconciliation ──────────────────────────────────────

function patchLists(
  oldCh: VNode[],
  newCh: VNode[],
  parent: HTMLElement | Element | DocumentFragment,
): void {
  if (newCh.length === 1 && oldCh.length === 1) {
    const o = oldCh[0];
    const n = newCh[0];
    if (o.type === n.type) {
      reconcile(o, n, parent);
      return;
    }
    // type mismatch: materialize the new one, then replace
    materializeNode(n);
    parent.replaceChild(n.dom!, o.dom!);
    return;
  }

  const hasKeys =
    newCh.some((n) => n.key != null) || oldCh.some((o) => o.key != null);
  if (hasKeys) {
    patchKeyed(oldCh, newCh, parent);
  } else {
    patchByIndex(oldCh, newCh, parent);
  }
}

function patchByIndex(
  oldCh: VNode[],
  newCh: VNode[],
  parent: HTMLElement | Element | DocumentFragment,
): void {
  const len = Math.max(oldCh.length, newCh.length);
  for (let i = 0; i < len; i++) {
    const o = oldCh[i];
    const n = newCh[i];
    if (!o) {
      materializeNode(n);
      parent.appendChild(n.dom!);
    } else if (!n) {
      o.dom!.remove();
    } else {
      materializeNode(n);
      reconcile(o, n, parent);
    }
  }
}

function patchKeyed(
  oldCh: VNode[],
  newCh: VNode[],
  parent: HTMLElement | Element | DocumentFragment,
): void {
  const oldMap = new Map<string, VNode>();
  for (const o of oldCh) if (o.key != null) oldMap.set(String(o.key), o);
  let next: Node | null = null;
  for (let i = newCh.length - 1; i >= 0; i--) {
    const n = newCh[i];
    const o = n.key != null ? oldMap.get(String(n.key)) : null;
    if (o && o.dom?.parentNode === parent) {
      materializeNode(n);
      reconcile(o, n, parent);
      if (o.dom!.nextSibling !== next) parent.insertBefore(o.dom!, next);
      next = o.dom;
      oldMap.delete(String(n.key));
    } else {
      // fallback: non-keyed position or new key
      const fallback = n.key == null ? oldCh[i] : null;
      if (
        fallback &&
        fallback.dom?.parentNode === parent &&
        fallback.key == null
      ) {
        materializeNode(n);
        reconcile(fallback, n, parent);
        if (fallback.dom!.nextSibling !== next)
          parent.insertBefore(fallback.dom!, next);
        next = fallback.dom;
      } else {
        materializeNode(n);
        parent.insertBefore(n.dom!, next);
        next = n.dom;
      }
    }
  }
  for (const o of oldMap.values())
    if (o.dom?.parentNode === parent) o.dom!.remove();
}

// ── attribute patching ─────────────────────────────────────────────

function patchAttrs(
  el: HTMLElement,
  old: Record<string, unknown>,
  next: Record<string, unknown>,
): void {
  for (const k in old) if (!(k in next)) setProp(el, k, null);
  for (const k in next) if (old[k] !== next[k]) setProp(el, k, next[k]);
}

function patchEvents(
  el: HTMLElement,
  old: Record<string, unknown>,
  next: Record<string, unknown>,
): void {
  for (const e in old)
    if (old[e] != null && (!(e in next) || next[e] !== old[e]))
      el.removeEventListener(e, old[e] as EventListener);
  for (const e in next)
    if (next[e] != null && old[e] !== next[e])
      el.addEventListener(e, next[e] as EventListener);
}
