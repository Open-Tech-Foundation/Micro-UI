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
      if (handlers)
        for (const h of handlers) safeCall(h, el, err as Error, "render");
      continue;
    }
    setCurrentRendering(null);
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
