/**
 * Composing a class or style string.
 *
 * A binding that is not a string becomes a DOM *property*, and `el.class` and
 * `el.style` are not writable that way — so `class=${["a", "b"]}` used to set
 * nothing at all, quietly. These turn the shapes people reach for into the
 * string the DOM wants, and `mount(..., { dev: true })` warns when one is
 * missing.
 */

function pushClass(v: unknown, out: string[]): void {
  if (!v) return;
  if (typeof v === "string") {
    const t = v.trim();
    if (t) out.push(t);
    return;
  }
  if (Array.isArray(v)) {
    for (const item of v) pushClass(item, out);
    return;
  }
  if (typeof v === "object") {
    // { "is-active": true } — the key is the class, the value is the switch.
    for (const k in v as Record<string, unknown>)
      if ((v as Record<string, unknown>)[k]) out.push(k);
  }
}

/**
 * Build a class string from strings, arrays and `{ name: on }` objects.
 * Anything falsy drops out, so a conditional class is just `cond && "is-on"`.
 *
 * ```js
 * cx("ui-btn", isPrimary && "ui-btn-primary", { "is-active": active })
 * // "ui-btn ui-btn-primary is-active"
 * ```
 */
export function cx(...args: unknown[]): string {
  const out: string[] = [];
  pushClass(args, out);
  return out.join(" ");
}

/** `marginTop` → `margin-top`. A custom property (`--x`) has no capitals to fix. */
function kebab(k: string): string {
  return k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function pushStyle(v: unknown, out: string[]): void {
  if (!v) return;
  if (typeof v === "string") {
    const t = v.trim().replace(/;$/, "");
    if (t) out.push(t);
    return;
  }
  if (Array.isArray(v)) {
    for (const item of v) pushStyle(item, out);
    return;
  }
  if (typeof v === "object") {
    for (const k in v as Record<string, unknown>) {
      const val = (v as Record<string, unknown>)[k];
      // `0` is a real value; "" and false are the ways to drop a declaration.
      if (val == null || val === false || val === "") continue;
      out.push(`${kebab(k)}: ${String(val)}`);
    }
  }
}

/**
 * Build a style string from strings, arrays and `{ prop: value }` objects.
 * camelCase keys become kebab-case; a nullish, false or empty value drops
 * that declaration.
 *
 * Numbers are written as they are — there is no automatic `px`, because
 * guessing which properties take a unit is a table this library would rather
 * not carry. Write `"8px"`.
 *
 * ```js
 * sx({ color: "red", marginTop: "8px" }, hidden && { display: "none" })
 * // "color: red; margin-top: 8px"
 * ```
 */
export function sx(...args: unknown[]): string {
  const out: string[] = [];
  pushStyle(args, out);
  return out.join("; ");
}
