import { HTML_NS, resolveNS, SVG_NS, svgTagName } from "./ns.ts";
import { devMode } from "./state.ts";
import type { VNode } from "./types.ts";

export function correctVNodeNS(node: VNode, parentNS: string | null): void {
  if (node.type === "element") {
    const tag = node.tag;
    const expected = resolveNS(tag, parentNS);
    node.ns = expected;
    const childParentNS =
      expected === SVG_NS && tag === "foreignobject" ? HTML_NS : expected;
    // First correct children recursively (so their dom is fixed before we move them)
    for (const c of node.children) correctVNodeNS(c, childParentNS);
    // If DOM already exists with wrong namespace, recreate it and re-append corrected children
    if (node.dom) {
      const dom = node.dom;
      const isDomSvg = dom.namespaceURI === SVG_NS;
      const shouldBeSvg = expected === SVG_NS;
      if (isDomSvg !== shouldBeSvg) {
        const newEl = createEl(tag, expected);
        for (const k in node.attrs) setProp(newEl, k, node.attrs[k]);
        for (const e in node.events) {
          if (node.events[e] != null) setEventHandler(newEl, e, node.events[e]);
        }
        for (const c of node.children) {
          if (c.dom) newEl.appendChild(c.dom);
          else if (c.type === "text") {
            const txt = document.createTextNode(c.value);
            c.dom = txt;
            newEl.appendChild(txt);
          }
        }
        node.dom = newEl;
      }
    }
  } else if (node.type === "fragment") {
    for (const c of node.children) correctVNodeNS(c, parentNS);
  }
}

export function createEl(tag: string, ns: string | null): Element {
  return ns === SVG_NS
    ? document.createElementNS(SVG_NS, svgTagName(tag))
    : document.createElement(tag);
}

export function addListener(el: Element, type: string, handler: unknown): void {
  el.addEventListener(type, handler as EventListener);
}

/**
 * The current handler for each event type on an element.
 *
 * A handler written the idiomatic way — `onclick=${() => remove(item.id)}`,
 * the only way to close over the row it belongs to — is a fresh closure on
 * every render, so comparing handler identity says "changed" every time. Doing
 * that literally means a removeEventListener plus an addEventListener per row
 * per render: 2,000 listener operations to re-render a 1,000-row list, and
 * nothing about the page has actually changed.
 *
 * So the listener is bound once per element and event type and never removed;
 * it reads the current handler out of this map when the event fires. Updating
 * a handler is then a plain property write.
 */
const eventSlots: WeakMap<Element, Record<string, unknown>> = new WeakMap<
  Element,
  Record<string, unknown>
>();

/**
 * Point `el`'s `type` events at `handler`, binding a real listener the first
 * time. A nullish handler empties the slot; the listener stays, inert, because
 * re-binding costs more than the branch it saves.
 */
export function setEventHandler(
  el: Element,
  type: string,
  handler: unknown,
): void {
  let slots = eventSlots.get(el);
  if (!slots) {
    slots = {};
    eventSlots.set(el, slots);
    // `slots` is captured, not looked up again — the map lookup would run on
    // every dispatch for no benefit.
  }
  const bound = type in slots;
  slots[type] = handler;
  if (bound) return;
  const owner = slots;
  addListener(el, type, function dispatch(this: Element, e: Event) {
    const h = owner[type];
    if (typeof h === "function") {
      (h as (this: Element, e: Event) => void).call(el, e);
    } else if (
      h &&
      typeof (h as EventListenerObject).handleEvent === "function"
    ) {
      (h as EventListenerObject).handleEvent(e);
    }
  });
}

/**
 * Write an element's value without throwing the caret to the end.
 *
 * Assigning `.value` collapses the selection to the end of the field. That is
 * invisible while a binding only echoes what was typed — the strings match, so
 * nothing is written — but any input that *rewrites* what it is given (an
 * uppercase field, a currency or phone mask, a trim) writes a different string
 * on every keystroke, and the caret jumps to the end of each one.
 *
 * So: skip the write when the DOM already says this, and when the field is
 * focused, put the selection back where it was, clamped to the new length.
 */
function writeValue(el: HTMLInputElement, next: string): void {
  if (el.value === next) return;
  const focused = el.ownerDocument?.activeElement === el;
  let start: number | null = null;
  let end: number | null = null;
  if (focused) {
    // Throws on an input type that has no selection (number, email, ...).
    try {
      start = el.selectionStart;
      end = el.selectionEnd;
    } catch {}
  }
  el.value = next;
  if (start !== null) {
    try {
      el.setSelectionRange(
        Math.min(start, next.length),
        Math.min(end ?? start, next.length),
      );
    } catch {}
  }
}

/**
 * Attributes the browser will navigate to or submit to, where the value is
 * treated as a URL and a `javascript:` scheme executes.
 */
const URL_ATTRS = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  "ping",
  "srcdoc",
]);

/**
 * Whether a URL would run script if the browser followed it.
 *
 * The scheme is read the way the parser does: leading whitespace and C0
 * control characters are ignored, so `java\tscript:alert(1)` and a
 * newline-padded value are the same URL. Anything relative or with a normal
 * scheme has no colon before the first `/`, `?` or `#`, and passes.
 */
function isScriptURL(url: string): boolean {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
  const s = url.replace(/[\u0000-\u001F\u007F-\u009F\s]/g, "").toLowerCase();
  return (
    s.startsWith("javascript:") ||
    s.startsWith("vbscript:") ||
    s.startsWith("data:text/html")
  );
}

function setElProp(el: Element, k: string, v: unknown): void {
  try {
    (el as unknown as Record<string, unknown>)[k] = v;
  } catch {}
}
const XML_NS_MAP: Record<string, string> = {
  xlink: "http://www.w3.org/1999/xlink",
  xml: "http://www.w3.org/XML/1998/namespace",
};

const BOOLEAN_PROPS = new Set([
  "checked",
  "selected",
  "disabled",
  "indeterminate",
  "readonly",
  "required",
  "multiple",
  "autofocus",
  "hidden",
  "open",
  "inert",
  "itemscope",
]);

function isTruthyAttrVal(v: unknown): boolean {
  if (v == null || v === false) return false;
  if (v === true) return true;
  if (typeof v === "string")
    return v !== "" && v !== "false" && v !== "0" && v !== "off" && v !== "no";
  return !!v;
}

export function setProp(el: Element, k: string, v: unknown): void {
  const isSvg = el.namespaceURI === SVG_NS;
  // A text interpolation cannot become markup, but an attribute is a second
  // door: `href=${untrusted}` runs whatever `javascript:` it was handed, on a
  // click, with the page's origin. The attribute is refused rather than
  // written, because a half-written one still navigates.
  if (typeof v === "string" && URL_ATTRS.has(k) && isScriptURL(v)) {
    console.error(
      `[micro-ui] refused to set ${k}="${v.slice(0, 60)}" — that URL runs ` +
        "script when followed. If it came from user input, it is an injection; " +
        "if it is yours, use an onclick handler instead of a javascript: URL.",
    );
    el.removeAttribute(k);
    return;
  }
  if (!isSvg) {
    if (k === "value") {
      if (v == null) {
        el.removeAttribute(k);
        writeValue(el as HTMLInputElement, "");
      } else {
        writeValue(el as HTMLInputElement, String(v));
        el.setAttribute(k, String(v));
      }
      return;
    }
    if (BOOLEAN_PROPS.has(k)) {
      const b = isTruthyAttrVal(v);
      if (k === "checked") (el as HTMLInputElement).checked = b;
      else if (k === "selected") (el as HTMLOptionElement).selected = b;
      else if (k === "disabled") (el as HTMLInputElement).disabled = b;
      else if (k === "indeterminate")
        (el as HTMLInputElement).indeterminate = b;
      else if (k in el) setElProp(el, k, b);
      if (b) el.setAttribute(k, "");
      else el.removeAttribute(k);
      return;
    }
  }
  // ARIA attributes: always stringify booleans as "true"/"false" (not ""/removed)
  // e.g. aria-hidden={true} -> "true", aria-hidden={false} -> "false"
  if (k.startsWith("aria-") || k === "role") {
    if (v == null) {
      // removeAttribute already resets the reflected property. Writing
      // `undefined` would re-create the attribute as the string "undefined"
      // for any non-nullable reflected DOMString (title, src, href, ...).
      el.removeAttribute(k);
      return;
    }
    // Stringify booleans/numbers for aria/role; keep strings as-is
    const strVal = String(v);
    if (k.includes(":") && isSvg) {
      const [prefix] = k.split(":");
      const ns = XML_NS_MAP[prefix ?? ""];
      if (ns) {
        try {
          el.setAttributeNS(ns, k, strVal);
          return;
        } catch {}
      }
    }
    el.setAttribute(k, strVal);
    if (!isSvg && k in el) setElProp(el, k, strVal);
    return;
  }

  // SVG or generic path: attribute-only, handle namespaced attrs like xlink:href
  if (v == null || v === false) {
    el.removeAttribute(k);
    if (k.includes(":") && isSvg) {
      try {
        el.removeAttributeNS(null, k);
      } catch {}
    }
  } else if (v === true) {
    el.setAttribute(k, "");
    if (!isSvg && k in el) setElProp(el, k, true);
  } else if (typeof v === "string") {
    if (k.includes(":") && isSvg) {
      // For SVG namespaced attributes, use setAttributeNS if possible
      // xlink:href and xml:space etc.
      const [prefix] = k.split(":");
      const ns = XML_NS_MAP[prefix ?? ""];
      if (ns) {
        try {
          el.setAttributeNS(ns, k, v);
          return;
        } catch {}
      }
    }
    el.setAttribute(k, v);
  } else {
    // `el.class` and `el.style` are not writable, so an array or object here
    // sets nothing at all — the failure a dev is most likely to hit twice.
    if (
      devMode &&
      (k === "class" || k === "style") &&
      v != null &&
      typeof v === "object"
    ) {
      console.warn(
        `[micro-ui] ${k}=\${...} was given ${Array.isArray(v) ? "an array" : "an object"}, ` +
          `which the DOM ignores — the ${k} is left unset. Compose it first: ` +
          (k === "class"
            ? `class=\${cx("ui-btn", { "is-active": active })}`
            : `style=\${sx({ color: "red", marginTop: "8px" })}`) +
          ", imported from @opentf/micro-ui.",
      );
    }
    if (!isSvg) setElProp(el, k, v);
    if (typeof v === "number" || typeof v === "boolean") {
      el.setAttribute(k, String(v));
    } else if (isSvg && v != null) {
      el.setAttribute(k, String(v));
    } else {
      // An object or function lives on the element as a property, never as an
      // attribute. If the same binding was a string last render the attribute
      // is still there, stale — and on a child component it shadows the
      // property, because props is rebuilt from the element's attributes.
      el.removeAttribute(k);
    }
  }
}

/**
 * Re-apply `value` once the children exist.
 *
 * A `<select>`'s value is one of its options, so setting it before the options
 * are appended selects nothing and leaves the first option showing — which is
 * wrong exactly when the initial selection is not the first one. A `<textarea>`
 * has the same shape: its children are its value.
 */
export function applyDeferredValue(
  el: Element,
  attrs: Record<string, unknown>,
): void {
  const tag = el.tagName;
  if (tag !== "SELECT" && tag !== "TEXTAREA") return;
  const v = attrs.value;
  if (v == null || typeof v === "object" || typeof v === "function") return;
  setProp(el, "value", v);
}

export function materializeNode(
  node: VNode,
  parentNS: string | null = null,
): void {
  if (node.dom) return;
  if (node.type === "text") {
    node.dom = document.createTextNode(node.value);
  } else if (node.type === "element") {
    // Correct this node's ns based on parentNS if needed (for fragments inserted into SVG)
    if (parentNS !== null) {
      node.ns = resolveNS(node.tag, parentNS);
    }
    const el = createEl(node.tag, node.ns);
    for (const k in node.attrs) setProp(el, k, node.attrs[k]);
    for (const e in node.events) {
      if (node.events[e] != null) setEventHandler(el, e, node.events[e]);
    }
    const childParentNS =
      node.ns === SVG_NS && node.tag === "foreignobject" ? HTML_NS : node.ns;
    for (const c of node.children) {
      // Correct child NS before materializing
      if (c.type === "element" || c.type === "fragment")
        correctVNodeNS(c, childParentNS);
      materializeNode(c, childParentNS);
      el.appendChild(c.dom!);
    }
    applyDeferredValue(el, node.attrs);
    node.dom = el;
  } else if (node.type === "fragment") {
    for (const c of node.children) {
      if (c.type === "element" || c.type === "fragment")
        correctVNodeNS(c, parentNS);
      materializeNode(c, parentNS);
    }
  }
}
