import { materializeNode, setProp } from "./dom.ts";
import { instances } from "./state.ts";
import type { VNode } from "./types.ts";
import { update } from "./update.ts";

export function reconcile(
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
    const dom = old.dom!;
    next.dom = dom;
    patchAttrs(dom as HTMLElement, old.attrs, next.attrs);
    patchEvents(dom as HTMLElement, old.events, next.events);
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
      if (changed) update(dom as HTMLElement);
    }
    patchLists(old.children, next.children, dom);
  }
}

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
