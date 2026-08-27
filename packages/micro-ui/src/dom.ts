export function setProp(el: HTMLElement, k: string, v: unknown): void {
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
    if (typeof v === "number" || typeof v === "boolean") {
      el.setAttribute(k, String(v));
    }
  }
}

export function materializeNode(node: VNode): void {
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

import type { VNode } from "./types.ts";
