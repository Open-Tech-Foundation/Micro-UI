import { mountErrorUI, safeCall } from "./error.ts";
import { errorHandlers } from "./lifecycle.ts";
import { reconcile } from "./reconcile.ts";
import {
  flushing,
  instances,
  pending,
  setDeferDOM,
  setFlushing,
} from "./state.ts";
import type { VNode } from "./types.ts";

export function update(el: HTMLElement): void {
  const inst = instances.get(el);
  if (!inst) return;
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
    try {
      setDeferDOM(true);
      newTree = inst.render();
      setDeferDOM(false);
    } catch (err) {
      setDeferDOM(false);
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
