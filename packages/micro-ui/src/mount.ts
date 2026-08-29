import { setDevMode } from "./state.ts";
import type { MountOptions } from "./types.ts";

export function mount(
  el: HTMLElement,
  tag: string,
  options?: MountOptions,
): HTMLElement {
  if (options?.dev !== undefined) setDevMode(options.dev === true);
  el.textContent = "";
  const child = document.createElement(tag);
  el.appendChild(child);
  return child;
}
