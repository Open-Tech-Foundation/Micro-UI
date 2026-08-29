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

/**
 * Elements whose teardown has been deferred by a `disconnectedCallback`.
 *
 * Re-parenting a node fires disconnect then connect synchronously, which is
 * indistinguishable from a real removal at the moment disconnect runs. Teardown
 * is therefore deferred by a microtask and cancelled if the element is back in
 * the document by the time it runs — so drag-and-drop, tab reparenting and
 * list virtualisation keep component state instead of silently resetting it.
 */
const teardownPending: WeakSet<HTMLElement> = new WeakSet<HTMLElement>();

export function define(tag: string, setup: SetupFn): void {
  customElements.define(
    tag,
    class extends HTMLElement {
      connectedCallback() {
        // A reconnect of a live instance is a move, not a fresh mount: cancel
        // the deferred teardown and keep everything as it was.
        if (teardownPending.has(this)) {
          teardownPending.delete(this);
          if (instances.has(this)) return;
        }
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

        // Registered before the onReady loop runs: a callback throwing used to
        // abort the loop before this line, leaving the component permanently
        // without its own error handlers.
        if (errs.length) errorHandlers.set(this, errs);

        for (const cb of cbs) {
          // Isolated per callback — one failing onReady must not skip the
          // others, and must not cost the component its cleanups.
          try {
            const cleanup = cb();
            if (typeof cleanup === "function") {
              let list = destroyCallbacks.get(this);
              if (!list) {
                list = [];
                destroyCallbacks.set(this, list);
              }
              list.push(cleanup);
            }
          } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            console.error(
              `[micro-ui] onReady threw on <${this.tagName.toLowerCase()}>:`,
              err.message,
            );
            // The component rendered fine; onReady is a side-effect hook, so
            // the working UI stays and the failure is reported instead.
            for (const h of errs) safeCall(h, this, err, "ready");
          }
        }
      }
      disconnectedCallback() {
        teardownPending.add(this);
        queueMicrotask(() => {
          // Cancelled by connectedCallback, or the element is back in the
          // document — either way this was a move.
          if (!teardownPending.has(this) || this.isConnected) {
            teardownPending.delete(this);
            return;
          }
          teardownPending.delete(this);
          const cbs = destroyCallbacks.get(this);
          if (cbs)
            for (const cb of cbs) {
              // Isolated per callback: teardown now runs from a microtask, so
              // a throw here would be an unhandled error rather than something
              // the caller could catch — and one broken cleanup must not stop
              // the rest of them from running.
              try {
                cb();
              } catch (e) {
                console.error(
                  `[micro-ui] cleanup threw while disconnecting <${this.tagName.toLowerCase()}>:`,
                  e && typeof e === "object" && "message" in e
                    ? (e as Error).message
                    : e,
                );
              }
            }
          destroyCallbacks.delete(this);
          instances.delete(this);
          pending.delete(this);
        });
      }
    },
  );
}
