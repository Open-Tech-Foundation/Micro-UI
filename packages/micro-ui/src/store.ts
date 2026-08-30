import { currentSetup, devMode, devTeardownChecks } from "./state.ts";

export type Listener<T> = (value: T) => void;

interface StoreEntry<T = unknown> {
  value: T;
  listeners: Set<Listener<T>>;
}

const stores = new Map<string, StoreEntry>();

function splitPath(path: string): string[] {
  return path.split(".");
}

/**
 * Shallow-copy a container while preserving its kind. Spreading an array into
 * an object literal turns [1,2,3] into {0:1,1:2,2:3}, which silently breaks
 * every `.map()` in the next render.
 */
function cloneContainer(v: unknown): Record<string, unknown> {
  if (Array.isArray(v)) return [...v] as unknown as Record<string, unknown>;
  if (v != null && typeof v === "object")
    return { ...(v as object) } as Record<string, unknown>;
  return {};
}

function getByPath(obj: unknown, path: string): unknown {
  return splitPath(path).reduce<unknown>(
    (o, k) =>
      o != null && typeof o === "object"
        ? (o as Record<string, unknown>)[k]
        : undefined,
    obj,
  );
}

function setByPath<T>(obj: T, path: string, value: unknown): T {
  const keys = splitPath(path);
  const last = keys.pop()!;
  const result = cloneContainer(obj);
  let current = result;
  for (const k of keys) {
    current[k] = cloneContainer(current[k]);
    current = current[k] as Record<string, unknown>;
  }
  current[last] = value;
  return result as T;
}

function deleteByPath<T>(obj: T, path: string): T {
  const keys = splitPath(path);
  const last = keys.pop()!;
  const result = cloneContainer(obj);
  let current = result;
  for (const k of keys) {
    if (current[k] == null || typeof current[k] !== "object")
      return result as T;
    current[k] = cloneContainer(current[k]);
    current = current[k] as Record<string, unknown>;
  }
  if (Array.isArray(current)) {
    // `delete arr[i]` would leave a hole and keep length unchanged; removing
    // an index from a list means splicing it out.
    const i = Number(last);
    if (Number.isInteger(i) && i >= 0) (current as unknown[]).splice(i, 1);
  } else {
    delete current[last];
  }
  return result as T;
}

function getEntry<T>(key: string): StoreEntry<T> | undefined {
  return stores.get(key) as StoreEntry<T> | undefined;
}

function ensureEntry<T>(key: string): StoreEntry<T> {
  let entry = stores.get(key) as StoreEntry<T> | undefined;
  if (!entry) {
    entry = { value: undefined as T, listeners: new Set() };
    stores.set(key, entry as StoreEntry);
  }
  return entry;
}

function notify<T>(key: string, entry: StoreEntry<T>): void {
  for (const fn of entry.listeners) {
    try {
      fn(entry.value);
    } catch (err) {
      // One listener must not stop the others — but a listener that throws is
      // a bug, and swallowing it left it with no symptom at all: the component
      // simply stopped updating.
      console.error(`[micro-ui] a store listener for "${key}" threw:`, err);
    }
  }
}

function get<T>(key: string): T | undefined;
function get<T>(key: string, opts: { path: string }): T | undefined;
function get<T>(key: string, opts?: { path?: string }): T | undefined {
  const entry = getEntry<T>(key);
  if (!entry) return undefined;
  if (opts?.path != null) {
    return getByPath(entry.value, opts.path) as T;
  }
  return entry.value;
}

function set<T>(key: string, value: T): void;
function set<T>(key: string, value: T, opts: { path: string }): void;
function set<T>(key: string, value: T, opts?: { path?: string }): void {
  const entry = ensureEntry<T>(key);
  if (opts?.path != null) {
    if (entry.value != null && typeof entry.value === "object") {
      entry.value = setByPath(entry.value, opts.path, value) as T;
    } else {
      entry.value = setByPath({}, opts.path, value) as T;
    }
  } else {
    entry.value = value;
  }
  notify(key, entry);
}

function del(key: string): void;
function del(key: string, opts: { path: string }): void;
function del(key: string, opts?: { path?: string }): void {
  const entry = ensureEntry(key);
  if (opts?.path != null) {
    if (entry.value != null && typeof entry.value === "object") {
      entry.value = deleteByPath(entry.value, opts.path);
    }
  } else {
    entry.value = undefined;
  }
  notify(key, entry);
}

/**
 * Subscriptions made during a component's setup, in dev mode.
 *
 * A subscription that outlives its component is invisible: the instance is
 * gone, so `update()` is a no-op and nothing re-renders — while the listener
 * set goes on holding the closure, and the closure goes on holding the
 * element. Nothing to see, and a detached tree that is never collected.
 */
const devSubs: WeakMap<HTMLElement, { key: string; live: boolean }[]> =
  new WeakMap();

function subscribe<T>(key: string, fn: Listener<T>): () => boolean {
  const entry = ensureEntry<T>(key);
  entry.listeners.add(fn);
  let record: { key: string; live: boolean } | undefined;
  if (devMode && currentSetup) {
    record = { key, live: true };
    let list = devSubs.get(currentSetup);
    if (!list) {
      list = [];
      devSubs.set(currentSetup, list);
    }
    list.push(record);
  }
  return () => {
    if (record) record.live = false;
    return entry.listeners.delete(fn);
  };
}

// Registered on import so the core never has to know the store exists. Only
// consulted in dev mode — see devTeardownChecks.
devTeardownChecks.push((el) => {
  const live = devSubs.get(el)?.filter((r) => r.live);
  if (!live?.length) return;
  const keys = [...new Set(live.map((r) => r.key))]
    .map((k) => `"${k}"`)
    .join(", ");
  console.warn(
    `[micro-ui] <${el.tagName.toLowerCase()}> was removed with ` +
      `${live.length} live store subscription${live.length === 1 ? "" : "s"} ` +
      `(${keys}). Nothing will re-render, but the listener keeps the element ` +
      "alive. Return the unsubscribe from onReady so it is cleaned up: " +
      'onReady(() => store.subscribe("key", () => update(el))).',
  );
  devSubs.delete(el);
});

function clear(): void {
  // Entries must survive if anyone is still subscribed: `subscribe` closes over
  // the StoreEntry, so dropping it here would leave listeners attached to an
  // orphan that no later set() ever notifies.
  for (const [key, entry] of stores) {
    entry.value = undefined;
    notify(key, entry);
    if (entry.listeners.size === 0) stores.delete(key);
  }
}

export const store: {
  get: typeof get;
  set: typeof set;
  del: typeof del;
  subscribe: typeof subscribe;
  clear: typeof clear;
} = { get, set, del, subscribe, clear };
