export type Listener<T> = (value: T) => void;

interface StoreEntry<T = unknown> {
  value: T;
  listeners: Set<Listener<T>>;
}

const stores = new Map<string, StoreEntry>();

function getByPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (o, k) =>
        o != null && typeof o === "object"
          ? (o as Record<string, unknown>)[k]
          : undefined,
      obj,
    );
}

function setByPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split(".");
  const last = keys.pop()!;
  const result = { ...(obj as Record<string, unknown>) };
  let current = result;
  for (const k of keys) {
    current[k] = { ...(current[k] as Record<string, unknown>) };
    current = current[k] as Record<string, unknown>;
  }
  current[last] = value;
  return result as T;
}

function getEntry<T>(key: string): StoreEntry<T> {
  let entry = stores.get(key) as StoreEntry<T> | undefined;
  if (!entry) {
    entry = { value: undefined as T, listeners: new Set() };
    stores.set(key, entry as StoreEntry);
  }
  return entry;
}

export function store<T>(key: string): T | undefined;
export function store<T>(key: string, value: T): T;
export function store<T>(
  key: string,
  value: T | undefined,
  opts: { path: string },
): T | undefined;
export function store<T>(
  key: string,
  value?: T,
  opts?: { path?: string },
): T | undefined {
  const entry = getEntry<T>(key);

  if (value !== undefined) {
    if (opts?.path) {
      entry.value = setByPath(entry.value ?? {}, opts.path, value) as T;
    } else {
      entry.value = value;
    }
    for (const fn of entry.listeners) fn(entry.value);
  }

  if (opts?.path) {
    return getByPath(entry.value, opts.path) as T;
  }
  return entry.value;
}

export function subscribe<T>(key: string, fn: Listener<T>): () => boolean {
  const entry = getEntry<T>(key);
  entry.listeners.add(fn);
  return () => entry.listeners.delete(fn);
}
