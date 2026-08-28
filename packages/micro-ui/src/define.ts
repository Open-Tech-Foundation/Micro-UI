import { mountErrorUI, safeCall } from "./error.ts";
import {
  destroyCallbacks,
  errorHandlers,
  pendingError,
  pendingReady,
  setPendingError,
  setPendingReady,
} from "./lifecycle.ts";
import { instances, pending } from "./state.ts";
import type { SetupFn, VNode } from "./types.ts";

export function define(tag: string, setup: SetupFn): void {
  customElements.define(
    tag,
    class extends HTMLElement {
      connectedCallback() {
        const props: Record<string, string> = {};
        for (const a of this.attributes) props[a.name] = a.value;
        const prevReady = pendingReady;
        const prevError = pendingError;
        setPendingReady([]);
        setPendingError([]);
        let render: (() => VNode) | undefined;
        let setupError: unknown = null;
        try {
          render = setup(this, props);
        } catch (err) {
          setupError = err;
        }
        const cbs = pendingReady!;
        const errs = pendingError!;
        setPendingReady(prevReady);
        setPendingError(prevError);

        if (setupError) {
          mountErrorUI(this, setupError);
          instances.set(this, {
            errored: true,
            render: () => ({ type: "fragment", children: [] }),
            tree: { type: "fragment", children: [] },
            props,
          });
          if (errs.length) errorHandlers.set(this, errs);
          for (const h of errs) safeCall(h, this, setupError as Error, "setup");
          return;
        }

        try {
          const tree = render!();
          this.textContent = "";
          if (tree.type === "text") {
            this.appendChild(tree.dom!);
          } else {
            for (const c of tree.children) this.appendChild(c.dom!);
          }
          instances.set(this, { render: render!, tree, props, errored: false });
        } catch (err) {
          mountErrorUI(this, err);
          instances.set(this, {
            errored: true,
            render: () => ({ type: "fragment", children: [] }),
            tree: { type: "fragment", children: [] },
            props,
          });
          if (errs.length) errorHandlers.set(this, errs);
          for (const h of errs) safeCall(h, this, err as Error, "render");
          return;
        }

        for (const cb of cbs) {
          const cleanup = cb();
          if (typeof cleanup === "function") {
            let list = destroyCallbacks.get(this);
            if (!list) {
              list = [];
              destroyCallbacks.set(this, list);
            }
            list.push(cleanup);
          }
        }
        if (errs.length) errorHandlers.set(this, errs);
      }
      disconnectedCallback() {
        const cbs = destroyCallbacks.get(this);
        if (cbs) for (const cb of cbs) cb();
        destroyCallbacks.delete(this);
        instances.delete(this);
        pending.delete(this);
      }
    },
  );
}
