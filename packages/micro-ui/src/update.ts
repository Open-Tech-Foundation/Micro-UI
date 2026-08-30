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

/**
 * How many times a component may re-queue itself from inside its own render
 * before we call it a loop. One or two passes is a legitimate
 * measure-then-adjust; an unbounded chain would hang the tab.
 */
const MAX_SELF_UPDATE_DEPTH = 25;
const selfUpdateDepth: WeakMap<HTMLElement, number> = new WeakMap<
  HTMLElement,
  number
>();

export function update(el: HTMLElement): void {
  const inst = instances.get(el);
  if (!inst) return;
  if (el === currentRendering) {
    // Queue for the next flush rather than the running one. Dropping it here
    // would silently lose the write — a store listener firing synchronously
    // during render is the usual way this happens.
    const depth = (selfUpdateDepth.get(el) ?? 0) + 1;
    if (depth > MAX_SELF_UPDATE_DEPTH) {
      selfUpdateDepth.delete(el);
      // Thrown into the running render, so the existing error isolation
      // reports it through mountErrorUI and any onError handler.
      throw new Error(
        `update() was called from inside <${el.tagName.toLowerCase()}>'s own ` +
          `render ${MAX_SELF_UPDATE_DEPTH} times in a row — this is a render ` +
          `loop. Move the update out of render, or guard it with a condition.`,
      );
    }
    selfUpdateDepth.set(el, depth);
  }
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
    if (inst.errored) {
      // An explicit update() is a request to try again — the app has had the
      // chance to fix whatever threw, and a component that can never recover
      // is a component the app has to tear down and rebuild by hand.
      //
      // Both sides have to be reset first: the error box replaced the host's
      // children, and inst.tree still describes the DOM from before the
      // failure, so reconciling against it would patch nodes that are no
      // longer in the document.
      inst.errored = false;
      el.textContent = "";
      inst.tree = { type: "fragment", children: [] };
    }
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
    // The render finished without re-queueing itself, so the chain is broken.
    if (!pending.has(el)) selfUpdateDepth.delete(el);
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
