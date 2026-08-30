import {
  correctVNodeNS,
  materializeNode,
  setEventHandler,
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
        // An object, array or function binding is not an attribute at all —
        // setProp writes it as a DOM property, which is how a child reads a
        // value that is not a string. Stringifying it into props stored the
        // useless "[object Object]" and, since syncProps drops any prop that
        // is not a real attribute, that looked like a change on every single
        // pass: a child with an object or callback binding re-rendered every
        // time its parent did.
        if (typeof v === "object" || typeof v === "function") {
          if (k in inst.props) {
            delete inst.props[k];
            changed = true;
          }
          // A callback is read when it is called, not when the child renders,
          // and `save=${() => remove(row)}` is a fresh closure every pass —
          // patchAttrs has already pointed the property at the newest one, so
          // re-rendering the child would achieve nothing. An object binding is
          // different: the child reads it *during* render, so a new object is
          // a real change and the same object is not.
          if (typeof v === "object" && old.attrs[k] !== v) changed = true;
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

/**
 * True when every row is already where it belongs: same count, same keys
 * pairwise, each one still this parent's child, in that order, with nothing
 * else in between. One walk, no allocation, and it bails on the first
 * mismatch — a reorder usually stops within a few rows, and a row added or
 * removed fails the length check before the walk starts.
 */
function inPlace(
  oldCh: VNode[],
  newCh: VNode[],
  parent: HTMLElement | Element | DocumentFragment,
): boolean {
  let dom: Node | null = parent.firstChild;
  for (let i = 0; i < oldCh.length; i++) {
    const o = oldCh[i]!;
    if (o.dom !== dom) return false;
    const ka = getKey(o);
    const kb = getKey(newCh[i]!);
    if (ka == null || kb == null) {
      if (ka != null || kb != null) return false;
    } else if (String(ka) !== String(kb)) return false;
    dom = dom.nextSibling;
  }
  return dom === null;
}

function patchKeyed(
  oldCh: VNode[],
  newCh: VNode[],
  parent: HTMLElement | Element | DocumentFragment,
): void {
  const oldLen = oldCh.length;
  const newLen = newCh.length;
  const parentNS = getParentNS(parent);

  // The ordinary re-render — the rows are the same rows, only their content
  // changed — needs none of the bookkeeping below, so it does none of it. The
  // general path would reach the same conclusion after two maps and four
  // arrays: match every row to itself, remove nothing, move nothing.
  if (oldLen === newLen && inPlace(oldCh, newCh, parent)) {
    for (let i = 0; i < newLen; i++) {
      const n = newCh[i]!;
      if (n.type === "element" || n.type === "fragment")
        correctVNodeNS(n, parentNS);
      reconcile(oldCh[i]!, n, parent);
    }
    return;
  }

  // key -> index in oldCh. A duplicate key keeps the last node; the shadowed
  // one stays unmatched and is removed with the rest below.
  const keyToOld = new Map<string, number>();
  for (let i = 0; i < oldLen; i++) {
    const k = getKey(oldCh[i]!);
    if (k != null) keyToOld.set(String(k), i);
  }

  // pairs[i] = index in oldCh that newCh[i] reuses, or -1 for a fresh node.
  const pairs: number[] = new Array(newLen);
  const matched: boolean[] = new Array(oldLen).fill(false);
  for (let i = 0; i < newLen; i++) {
    const k = getKey(newCh[i]!);
    let oi = -1;
    if (k != null) {
      const cand = keyToOld.get(String(k));
      if (cand !== undefined && !matched[cand]) {
        const dom = oldCh[cand]!.dom;
        // A node detached from outside (parentNode === null) is still ours to
        // reclaim by key; one adopted by another parent is not.
        if (dom && (dom.parentNode === parent || dom.parentNode === null))
          oi = cand;
      }
    } else {
      // Unkeyed children mixed into a keyed list still match by position.
      const f = oldCh[i];
      if (f && !matched[i] && getKey(f) == null && f.dom?.parentNode === parent)
        oi = i;
    }
    if (oi >= 0) matched[oi] = true;
    pairs[i] = oi;
  }

  // Pass 1 — content. Placement is deliberately a separate pass: the move plan
  // below has to be computed against the DOM this pass leaves behind.
  const doms: Node[] = new Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const n = newCh[i]!;
    if (n.type === "element" || n.type === "fragment")
      correctVNodeNS(n, parentNS);
    const oi = pairs[i]!;
    if (oi >= 0) {
      const o = oldCh[oi]!;
      // No materializeNode() here: reconcile() reuses the matched node's DOM
      // (or builds a replacement itself when tag/ns changed). Materializing
      // first built a full subtree that was then thrown away every pass.
      reconcile(o, n, parent);
      // reconcile() sets n.dom — to o.dom when reused, or to a fresh element
      // when it had to replace. Placing o.dom would resurrect the replaced node.
      doms[i] = n.dom ?? o.dom!;
    } else {
      materializeNode(n, parentNS);
      doms[i] = n.dom!;
    }
  }

  // Pass 2 — removals, before positions are read, so a departing node between
  // two survivors cannot make them look out of order.
  for (let i = 0; i < oldLen; i++) {
    if (matched[i]) continue;
    const dom = oldCh[i]!.dom;
    if (dom?.parentNode === parent) dom.remove();
  }

  // Pass 3 — the move plan. Positions come from the live DOM rather than from
  // oldCh's order, so a list re-ordered from outside (drag and drop) still
  // converges, and a node detached from outside falls out as -1.
  const pos = new Map<Node, number>();
  let at = 0;
  for (let c = parent.firstChild; c; c = c.nextSibling) pos.set(c, at++);
  const source: number[] = new Array(newLen);
  let reordered = false;
  let highest = -1;
  for (let i = 0; i < newLen; i++) {
    const s = pos.get(doms[i]!) ?? -1;
    source[i] = s;
    if (s >= 0) {
      if (s < highest) reordered = true;
      else highest = s;
    }
  }
  // Nodes on the longest increasing subsequence are already in the right order
  // relative to each other, so they never move; everyone else is inserted once.
  // Swapping two rows of a thousand costs two insertBefore calls, not n.
  const keep = reordered ? lis(source) : null;

  // Pass 4 — placement, right to left: everything past `nextSib` is final.
  let k = keep ? keep.length - 1 : 0;
  let nextSib: Node | null = null;
  for (let i = newLen - 1; i >= 0; i--) {
    const dom = doms[i]!;
    const stays = keep ? k >= 0 && keep[k] === i : source[i]! >= 0;
    if (stays) k--;
    else if (dom.nextSibling !== nextSib || dom.parentNode !== parent)
      parent.insertBefore(dom, nextSib);
    nextSib = dom;
  }
}

/**
 * Indices of a longest strictly increasing subsequence of `source`, ignoring
 * the -1 entries (fresh or detached nodes, which are always inserted).
 * Patience sorting: O(n log n), with `prev` linking each index to the tail of
 * the best run it extends so the winning run can be walked back out.
 */
function lis(source: number[]): number[] {
  const prev: number[] = new Array(source.length);
  // tails[l] = index of the smallest tail among the runs of length l + 1.
  const tails: number[] = [];
  for (let i = 0; i < source.length; i++) {
    const v = source[i]!;
    if (v < 0) continue;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (source[tails[mid]!]! < v) lo = mid + 1;
      else hi = mid;
    }
    prev[i] = lo > 0 ? tails[lo - 1]! : -1;
    tails[lo] = i;
  }
  let l = tails.length;
  const out: number[] = new Array(l);
  let cur = l > 0 ? tails[l - 1]! : -1;
  while (l > 0) {
    out[--l] = cur;
    cur = prev[cur]!;
  }
  return out;
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
  // Writes to a slot the element's one real listener reads on dispatch, so a
  // fresh closure per render costs a property write instead of a remove plus
  // an add. See setEventHandler.
  for (const e in old) if (!(e in next)) setEventHandler(el, e, null);
  for (const e in next) if (old[e] !== next[e]) setEventHandler(el, e, next[e]);
}
