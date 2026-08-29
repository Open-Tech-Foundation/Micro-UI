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

function notify<T>(entry: StoreEntry<T>): void {
  for (const fn of entry.listeners) {
    try {
      fn(entry.value);
    } catch (_) {
      /* listener error */
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
  notify(entry);
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
  notify(entry);
}

function subscribe<T>(key: string, fn: Listener<T>): () => boolean {
  const entry = ensureEntry<T>(key);
  entry.listeners.add(fn);
  return () => entry.listeners.delete(fn);
}

function clear(): void {
  // Entries must survive if anyone is still subscribed: `subscribe` closes over
  // the StoreEntry, so dropping it here would leave listeners attached to an
  // orphan that no later set() ever notifies.
  for (const [key, entry] of stores) {
    entry.value = undefined;
    notify(entry);
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
