import { devMode } from "./state.ts";
import type { ErrorHandler, ErrorPhase } from "./types.ts";

const GENERIC_MESSAGE = "Something went wrong.";

export function mountErrorUI(el: HTMLElement, err: unknown): void {
  try {
    const msg =
      err && typeof err === "object" && "message" in err
        ? String((err as Error).message)
        : String(err);
    const tag = el.tagName?.toLowerCase?.() || "?";
    // The developer always gets the whole error; the page never does unless
    // the app asked for it. An error box renders wherever the failing
    // component sits, which may be anywhere a user can see.
    console.error(`[micro-ui] <${tag}> failed:`, err);
    if (!devMode) {
      console.error(
        `[micro-ui] pass { dev: true } to mount() to show this message in the page.`,
      );
    }

    el.textContent = "";
    const box = document.createElement("div");
    box.setAttribute("data-micro-ui-error", "");
    const pre = document.createElement("pre");
    pre.style.whiteSpace = "pre-wrap";
    pre.style.margin = "0";
    pre.textContent = devMode ? msg : GENERIC_MESSAGE;
    box.appendChild(pre);
    el.appendChild(box);
  } catch {
    /* swallow */
  }
}

export function safeCall(
  fn: ErrorHandler,
  el: HTMLElement,
  err: Error,
  phase: ErrorPhase,
): void {
  try {
    fn(el, err, phase);
  } catch (e) {
    console.error(
      `[micro-ui] onError handler threw while processing ${phase} error on <${el.tagName?.toLowerCase?.() || "?"}>:`,
      e && typeof e === "object" && "message" in e ? (e as Error).message : e,
    );
  }
}
