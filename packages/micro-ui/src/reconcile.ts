import {
  addListener,
  correctVNodeNS,
  materializeNode,
  removeListener,
  setProp,
} from "./dom.ts";
import { HTML_NS, SVG_NS } from "./ns.ts";
import { instances } from "./state.ts";
import type { ElementVNode, FragmentVNode, TextVNode, VNode } from "./types.ts";
import { update } from "./update.ts";

function getParentNS(
  parent: HTMLElement | Element | DocumentFragment,
): string | null {
  const el = parent as Element;
  if (!el.namespaceURI) return null;
  // Children of a <foreignObject> must revert to HTML even though the
  // foreignObject element itself lives in the SVG namespace.
  if (
    el.namespaceURI === SVG_NS &&
    el.tagName.toLowerCase() === "foreignobject"
  )
    return HTML_NS;
  return el.namespaceURI;
}

export function reconcile(
  old: VNode,
  next: VNode,
  parent: HTMLElement | Element | DocumentFragment,
): void {
  if (old.type !== next.type) {
    const parentNS = getParentNS(parent);
    if (next.type === "element" || next.type === "fragment")
      correctVNodeNS(next, parentNS);
    materializeNode(next, parentNS);
    parent.replaceChild(next.dom!, old.dom!);
    return;
  }
  if (old.type === "text") {
    const nxt = next as TextVNode;
    if (String(old.value) !== String(nxt.value))
      old.dom!.nodeValue = String(nxt.value);
    nxt.dom = old.dom;
    return;
  }
  if (old.type === "fragment") {
    patchLists(old.children, (next as FragmentVNode).children, parent);
    return;
  }
  if (old.type === "element") {
    const nxt = next as ElementVNode;
    if (old.tag !== nxt.tag || old.ns !== nxt.ns) {
      const parentNS = getParentNS(parent);
      if (nxt.type === "element" || nxt.type === "fragment")
        correctVNodeNS(nxt, parentNS);
      materializeNode(nxt, parentNS);
      parent.replaceChild(nxt.dom!, old.dom!);
      return;
    }
    const dom = old.dom!;
    nxt.dom = dom;
    patchAttrs(dom as Element, old.attrs, nxt.attrs);
    patchEvents(dom as Element, old.events, nxt.events);
    const inst = instances.get(dom as HTMLElement);
    if (inst?.props) {
      let changed = false;
      for (const k in nxt.attrs) {
        const v = nxt.attrs[k];
        // A nullish binding removes the attribute (see setProp), so the prop
        // must be absent too. Comparing against String(v) while storing
        // `undefined` made every pass report a change and re-render the child.
        if (v == null) {
          if (k in inst.props) {
            delete inst.props[k];
            changed = true;
          }
          continue;
        }
        const nextVal = String(v);
        if (inst.props[k] !== nextVal) {
          inst.props[k] = nextVal;
          changed = true;
        }
      }
      for (const k in inst.props) {
        if (!(k in nxt.attrs)) {
          delete inst.props[k];
          changed = true;
        }
      }
      if (changed) update(dom as HTMLElement);
    }
    patchLists(old.children, nxt.children, dom);
  }
}

function patchLists(
  oldCh: VNode[],
  newCh: VNode[],
  parent: HTMLElement | Element | DocumentFragment,
): void {
  if (newCh.length === 1 && oldCh.length === 1) {
    const o = oldCh[0]!;
    const n = newCh[0]!;
    if (o.type === n.type) {
      // For elements, also check key/tag/ns — single-item fast-path must not
      // reuse DOM when key changes (issue #4)
      if (o.type === "element" && n.type === "element") {
        if (o.key === n.key && o.tag === n.tag && o.ns === n.ns) {
          reconcile(o, n, parent);
          // re-insert if externally detached
          if (o.dom && o.dom.parentNode !== parent) parent.appendChild(o.dom);
          return;
        }
      } else {
        // text / fragment with same type can be reconciled
        reconcile(o, n, parent);
        if (o.dom && o.dom.parentNode !== parent) parent.appendChild(o.dom);
        return;
      }
    }
    const parentNS2 = getParentNS(parent);
    if (n.type === "element" || n.type === "fragment")
      correctVNodeNS(n, parentNS2);
    materializeNode(n, parentNS2);
    if (o.dom?.parentNode === parent) {
      parent.replaceChild(n.dom!, o.dom!);
    } else {
      parent.appendChild(n.dom!);
    }
    return;
  }

  const hasKeys =
    newCh.some((n) => n.type === "element" && n.key != null) ||
    oldCh.some((o) => o.type === "element" && o.key != null);
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
  const parentNS = getParentNS(parent);
  const len = Math.max(oldCh.length, newCh.length);
  for (let i = 0; i < len; i++) {
    const o = oldCh[i];
    const n = newCh[i];
    if (!o) {
      if (n!.type === "element" || n!.type === "fragment")
        correctVNodeNS(n!, parentNS);
      materializeNode(n!, parentNS);
      parent.appendChild(n!.dom!);
    } else if (!n) {
      if (o.dom?.parentNode === parent) o.dom.remove();
    } else {
      reconcile(o, n, parent);
    }
  }
}

function getKey(n: VNode): string | null | undefined {
  return n.type === "element" ? n.key : undefined;
}

function patchKeyed(
  oldCh: VNode[],
  newCh: VNode[],
  parent: HTMLElement | Element | DocumentFragment,
): void {
  const oldMap = new Map<string, VNode>();
  const unmatchedUnkeyed = new Set<VNode>();
  for (const o of oldCh) {
    const k = getKey(o);
    if (k != null) oldMap.set(String(k), o);
    else unmatchedUnkeyed.add(o);
  }
  let nextSib: Node | null = null;
  const parentNS = getParentNS(parent);
  for (let i = newCh.length - 1; i >= 0; i--) {
    const n = newCh[i]!;
    const k = getKey(n);
    const o = k != null ? oldMap.get(String(k)) : undefined;
    if (o && (o.dom?.parentNode === parent || o.dom?.parentNode === null)) {
      if (n.type === "element" || n.type === "fragment")
        correctVNodeNS(n, parentNS);
      // No materializeNode() here: reconcile() reuses the matched node's DOM
      // (or builds a replacement itself when tag/ns changed). Materializing
      // first built a full subtree that was then thrown away every pass.
      reconcile(o, n, parent);
      // reconcile() sets n.dom — to o.dom when reused, or to a fresh element
      // when it had to replace. Placing o.dom would resurrect the replaced node.
      const placed = n.dom ?? o.dom!;
      if (placed.nextSibling !== nextSib) parent.insertBefore(placed, nextSib);
      nextSib = placed;
      oldMap.delete(String(k));
    } else {
      const fallback = k == null ? oldCh[i] : undefined;
      if (
        fallback &&
        fallback.dom?.parentNode === parent &&
        getKey(fallback) == null
      ) {
        unmatchedUnkeyed.delete(fallback);
        if (n.type === "element" || n.type === "fragment")
          correctVNodeNS(n, parentNS);
        reconcile(fallback, n, parent);
        const placed = n.dom ?? fallback.dom!;
        if (placed.nextSibling !== nextSib)
          parent.insertBefore(placed, nextSib);
        nextSib = placed;
      } else {
        if (n.type === "element" || n.type === "fragment")
          correctVNodeNS(n, parentNS);
        materializeNode(n, parentNS);
        parent.insertBefore(n.dom!, nextSib);
        nextSib = n.dom!;
      }
    }
  }
  for (const o of oldMap.values())
    if (o.dom?.parentNode === parent) o.dom!.remove();
  for (const o of unmatchedUnkeyed)
    if (o.dom?.parentNode === parent) o.dom!.remove();
}

function patchAttrs(
  el: Element,
  old: Record<string, unknown>,
  next: Record<string, unknown>,
): void {
  for (const k in old) if (!(k in next)) setProp(el, k, null);
  for (const k in next) if (old[k] !== next[k]) setProp(el, k, next[k]);
}

function patchEvents(
  el: Element,
  old: Record<string, unknown>,
  next: Record<string, unknown>,
): void {
  for (const e in old)
    if (old[e] != null && (!(e in next) || next[e] !== old[e]))
      removeListener(el, e, old[e]);
  for (const e in next)
    if (next[e] != null && old[e] !== next[e]) addListener(el, e, next[e]);
}
