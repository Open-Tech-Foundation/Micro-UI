import type { CleanupFn, ErrorHandler, ReadyCallback } from "./types.ts";

export let pendingReady: ReadyCallback[] | null = null;
export let pendingError: ErrorHandler[] | null = null;

export function setPendingReady(v: ReadyCallback[] | null): void {
  pendingReady = v;
}
export function setPendingError(v: ErrorHandler[] | null): void {
  pendingError = v;
}

export function onReady(cb: ReadyCallback): void {
  if (!pendingReady)
    throw new Error(
      "onReady() must be called synchronously inside define(..., setup)",
    );
  pendingReady.push(cb);
}

export function onError(handler: ErrorHandler): void {
  if (!pendingError)
    throw new Error(
      "onError() must be called synchronously inside define(..., setup)",
    );
  pendingError.push(handler);
}

export const destroyCallbacks: WeakMap<HTMLElement, CleanupFn[]> = new WeakMap<
  HTMLElement,
  CleanupFn[]
>();
export const errorHandlers: WeakMap<HTMLElement, ErrorHandler[]> = new WeakMap<
  HTMLElement,
  ErrorHandler[]
>();
