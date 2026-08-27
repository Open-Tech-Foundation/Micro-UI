const stores = new Map();

function getByPath(obj: any, path: string) {
  return path.split(".").reduce((o, k) => (o != null ? o[k] : undefined), obj);
}

function setByPath(obj: any, path: string, value: any) {
  const keys = path.split(".");
  const last = keys.pop()!;
  const result = { ...obj };
  let current = result;
  for (const k of keys) {
    current[k] = { ...current[k] };
    current = current[k];
  }
  current[last] = value;
  return result;
}

export function store(key: string, value?: any, opts?: any) {
  if (!stores.has(key)) {
    stores.set(key, { value: undefined, listeners: new Set() });
  }
  const s = stores.get(key);

  if (value !== undefined) {
    if (opts?.path) {
      s.value = setByPath(s.value ?? {}, opts.path, value);
    } else {
      s.value = value;
    }
    s.listeners.forEach((fn: any) => {
      fn(s.value);
    });
  }

  if (opts?.path) {
    return getByPath(s.value, opts.path);
  }
  return s.value;
}

export function subscribe(key: string, fn: (v: any) => void) {
  if (!stores.has(key)) {
    stores.set(key, { value: undefined, listeners: new Set() });
  }
  stores.get(key).listeners.add(fn);
  return () => stores.get(key).listeners.delete(fn);
}
