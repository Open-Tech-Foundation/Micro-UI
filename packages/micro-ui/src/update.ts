import { mountErrorUI, safeCall } from "./error.ts";
import { errorHandlers } from "./lifecycle.ts";
import { reconcile } from "./reconcile.ts";
import {
  currentRendering,
  flushing,
  instances,
  pending,
  setCurrentRendering,
  setDeferDOM,
  setFlushing,
} from "./state.ts";
import type { VNode } from "./types.ts";

/**
 * Re-read the host's attributes into the props object handed to `setup`.
 *
 * Attributes are snapshotted once in `connectedCallback`, so without this an
 * attribute changed from outside the library — a router, a host framework,
 * plain `setAttribute` — would stay invisible even to an explicit `update()`.
 * Micro-UI never re-renders on its own; this is what makes "change it, then
 * call update()" hold for attributes the way it already holds for variables.
 *
 * Mutates in place: the render closure captured this exact object.
 */
function syncProps(el: HTMLElement, props: Record<string, string>): void {
  for (const a of el.attributes) props[a.name] = a.value;
  for (const k in props) if (!el.hasAttribute(k)) delete props[k];
}

export function update(el: HTMLElement): void {
  const inst = instances.get(el);
  if (!inst) return;
  // Re-entrancy guard: an element that is already being rendered must not
  // re-queue a new flush, or a self-`update()` from inside its own render
  // would cascade into an unbounded chain of flushes.
  if (el === currentRendering) return;
  pending.add(el);
  if (!flushing) {
    setFlushing(true);
    queueMicrotask(flush);
  }
}

export function flush(): void {
  setFlushing(false);
  const batch = [...pending];
  pending.clear();
  for (const el of batch) {
    const inst = instances.get(el);
    if (!inst) continue;
    if (inst.errored) continue;
    let newTree: VNode;
    syncProps(el, inst.props);
    setCurrentRendering(el);
    try {
      setDeferDOM(true);
      newTree = inst.render();
      setDeferDOM(false);
    } catch (err) {
      setDeferDOM(false);
      setCurrentRendering(null);
      mountErrorUI(el, err);
      inst.errored = true;
      const handlers = errorHandlers.get(el);
      if (handlers) {
        const e = err instanceof Error ? err : new Error(String(err));
        for (const h of handlers) safeCall(h, el, e, "render");
      }
      continue;
    }
    setCurrentRendering(null);
    try {
      reconcile(inst.tree, newTree, el);
    } catch (err) {
      mountErrorUI(el, err);
      inst.errored = true;
      const handlers = errorHandlers.get(el);
      if (handlers) {
        const e = err instanceof Error ? err : new Error(String(err));
        for (const h of handlers) safeCall(h, el, e, "reconcile");
      }
      continue;
    }
    inst.tree = newTree;
  }
}
