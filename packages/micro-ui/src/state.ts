import type { InstanceRecord } from "./types.ts";

export const instances: WeakMap<HTMLElement, InstanceRecord> = new WeakMap<
  HTMLElement,
  InstanceRecord
>();
export const templates: WeakMap<TemplateStringsArray, unknown> = new WeakMap<
  TemplateStringsArray,
  unknown
>();
export const pending: Set<HTMLElement> = new Set<HTMLElement>();

export let flushing = false;
export function setFlushing(v: boolean): void {
  flushing = v;
}

export let deferDOM = false;
export function setDeferDOM(v: boolean): void {
  deferDOM = v;
}
