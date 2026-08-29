import { HTML_NS, resolveNS, SVG_NS, svgTagName } from "./ns.ts";
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
          if (node.events[e] != null) addListener(newEl, e, node.events[e]);
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

export function removeListener(
  el: Element,
  type: string,
  handler: unknown,
): void {
  el.removeEventListener(type, handler as EventListener);
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
  if (!isSvg) {
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
    if (!isSvg) setElProp(el, k, v);
    if (typeof v === "number" || typeof v === "boolean") {
      el.setAttribute(k, String(v));
    } else if (isSvg && v != null) {
      el.setAttribute(k, String(v));
    }
  }
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
      if (node.events[e] != null) addListener(el, e, node.events[e]);
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
    node.dom = el;
  } else if (node.type === "fragment") {
    for (const c of node.children) {
      if (c.type === "element" || c.type === "fragment")
        correctVNodeNS(c, parentNS);
      materializeNode(c, parentNS);
    }
  }
}
