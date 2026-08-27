import type { ErrorHandler, ErrorPhase } from "./types.ts";

export function mountErrorUI(el: HTMLElement, err: unknown): void {
  try {
    el.textContent = "";
    const box = document.createElement("div");
    box.setAttribute("data-micro-ui-error", "");
    const msg =
      err && typeof err === "object" && "message" in err
        ? String((err as Error).message)
        : String(err);
    const pre = document.createElement("pre");
    pre.style.whiteSpace = "pre-wrap";
    pre.style.margin = "0";
    pre.textContent = msg;
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
