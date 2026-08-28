import { SVG_NS } from "./ns.ts";
import type { VNode } from "./types.ts";

function createEl(tag: string, ns: string | null): Element {
  return ns === SVG_NS
    ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag);
}

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
      else if (k in el) (el as unknown as Record<string, unknown>)[k] = b;
      if (b) el.setAttribute(k, "");
      else el.removeAttribute(k);
      return;
    }
  }
  // SVG or generic path: attribute-only, handle namespaced attrs like xlink:href
  if (v == null || v === false) {
    el.removeAttribute(k);
    if (k.includes(":") && isSvg) {
      try {
        el.removeAttributeNS(null, k);
      } catch {}
    }
    if (!isSvg) {
      try {
        if (k in el) (el as unknown as Record<string, unknown>)[k] = undefined;
      } catch {}
    }
  } else if (v === true) {
    el.setAttribute(k, "");
    if (!isSvg) {
      try {
        if (k in el) (el as unknown as Record<string, unknown>)[k] = true;
      } catch {}
    }
  } else if (typeof v === "string") {
    if (k.includes(":") && isSvg) {
      // For SVG namespaced attributes, use setAttributeNS if possible
      // xlink:href and xml:space etc.
      const [prefix] = k.split(":");
      const nsMap: Record<string, string> = {
        xlink: "http://www.w3.org/1999/xlink",
        xml: "http://www.w3.org/XML/1998/namespace",
      };
      const ns = nsMap[prefix ?? ""];
      if (ns) {
        try {
          el.setAttributeNS(ns, k, v);
          return;
        } catch {}
      }
    }
    el.setAttribute(k, v);
  } else {
    if (!isSvg) {
      try {
        (el as unknown as Record<string, unknown>)[k] = v;
      } catch {}
    }
    if (typeof v === "number" || typeof v === "boolean") {
      el.setAttribute(k, String(v));
    } else if (isSvg && v != null) {
      el.setAttribute(k, String(v));
    }
  }
}

export function materializeNode(node: VNode): void {
  if (node.dom) return;
  if (node.type === "text") {
    node.dom = document.createTextNode(node.value);
  } else if (node.type === "element") {
    const el = createEl(node.tag, node.ns);
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
