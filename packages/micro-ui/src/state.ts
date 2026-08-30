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

/**
 * Whether the app opted in to developer diagnostics via `mount(el, tag, { dev })`.
 * Off by default so a thrown error's message never reaches the page in
 * production — it always reaches the console and any onError handler.
 */
export let devMode = false;
export function setDevMode(v: boolean): void {
  devMode = v;
}

/**
 * Element whose `setup` (and `onReady` callbacks) are running, or null.
 *
 * Dev-mode bookkeeping only: it is what lets a subscription made during setup
 * be attributed to the component that made it.
 */
export let currentSetup: HTMLElement | null = null;
export function setCurrentSetup(v: HTMLElement | null): void {
  currentSetup = v;
}

/**
 * Checks run against an element as it is torn down, in dev mode only.
 *
 * A registry rather than a direct call so that the core never has to import
 * the store: `store.ts` adds its own check when it is loaded, and an app that
 * never imports the store carries neither the check nor the store.
 */
export const devTeardownChecks: ((el: HTMLElement) => void)[] = [];

/** Element whose render is currently running, or null when idle. */
export let currentRendering: HTMLElement | null = null;
export function setCurrentRendering(v: HTMLElement | null): void {
  currentRendering = v;
}
