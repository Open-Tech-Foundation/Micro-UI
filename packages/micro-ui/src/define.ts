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

/**
 * Why `tag` cannot be registered, or null if it can.
 *
 * Deliberately a set of specific checks rather than the full spec grammar,
 * which allows plenty of exotic-but-valid names: the point is to say what is
 * wrong with the name someone actually typed, where the platform only says
 * "Name argument is not a valid custom element name."
 */
function tagNameProblem(tag: string): string | null {
  if (typeof tag !== "string" || tag === "")
    return "a custom element name must be a non-empty string";
  if (!tag.includes("-"))
    return `a custom element name must contain a dash — try "x-${tag.toLowerCase()}"`;
  // Before the leading-character check: "X-Counter" is more usefully described
  // as needing lowercase than as starting with the wrong character.
  if (/[A-Z]/.test(tag))
    return `a custom element name must be lowercase — try "${tag.toLowerCase()}"`;
  if (!/^[a-z]/.test(tag))
    return "a custom element name must start with a lowercase letter";
  if (/\s/.test(tag)) return "a custom element name cannot contain whitespace";
  return null;
}

export function define(tag: string, setup: SetupFn): void {
  const problem = tagNameProblem(tag);
  if (problem) throw new Error(`define(${JSON.stringify(tag)}): ${problem}.`);
  if (typeof setup !== "function")
    throw new Error(
      `define("${tag}"): the second argument must be a setup function, ` +
        `got ${setup === null ? "null" : typeof setup}. It runs once per ` +
        "element and returns the render function: " +
        "define(tag, (el, props) => () => html`...`).",
    );
  if (customElements.get(tag))
    throw new Error(
      `define("${tag}"): already defined. A name can only be registered once ` +
        "per page, so this usually means the module ran twice — a duplicate " +
        "import, or a reload that re-evaluated it. Pick another name, or " +
        `guard the call with customElements.get("${tag}").`,
    );

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
          if (typeof render !== "function") {
            // Returning the template instead of a function that produces it is
            // the usual slip. Left alone it surfaces much later as
            // "render is not a function", pointing at the library.
            throw new Error(
              `define("${tag}"): setup must return a render function, got ` +
                `${render === null ? "null" : typeof render}. Return a ` +
                "function that builds the template — () => html`...` — " +
                "rather than the template itself.",
            );
          }
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
            // setup() cannot be re-run — a custom element gets one — so a
            // retry has to fail the same way instead of rendering an empty
            // component over the error box.
            render: () => {
              throw setupError;
            },
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
            // Keep the render function: the state it choked on may be fixed
            // by the time the app calls update() again, and without it there
            // would be nothing to recover to.
            render: render!,
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
