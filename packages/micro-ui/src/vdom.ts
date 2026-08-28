import { setProp } from "./dom.ts";
import { escapeText } from "./escape.ts";
import { SVG_NS } from "./ns.ts";
import { materializeRaw } from "./raw.ts";
import type {
  DescNode,
  ElementVNode,
  FragmentVNode,
  RawVNode,
  TemplateCache,
  TextVNode,
  VNode,
} from "./types.ts";

function createEl(tag: string, ns: string | null): Element {
  return ns === SVG_NS
    ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag);
}

export function createTree(
  tpl: TemplateCache,
  values: unknown[],
  deferDOM: boolean,
): VNode {
  return {
    type: "fragment",
    children: createNodes(tpl.tree, values, { vi: 0 }, deferDOM),
  };
}

export function createNodes(
  descs: DescNode[],
  values: unknown[],
  state: { vi: number },
  deferDOM: boolean,
): VNode[] {
  const out: VNode[] = [];
  for (const d of descs) pushNodes(cloneNode(d, values, state, deferDOM), out);
  return out;
}

function pushNodes(node: VNode, out: VNode[]): void {
  if (node.type === "fragment") {
    for (const c of node.children) pushNodes(c, out);
  } else {
    out.push(node);
  }
}

function take(
  values: unknown[],
  idx: number | undefined,
  state: { vi: number },
): unknown {
  if (idx != null) return values[idx];
  return values[state.vi++];
}

function interpolate(
  parts: string[],
  values: unknown[],
  idx: number | undefined,
  state: { vi: number },
): string {
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    out += parts[i];
    if (i < parts.length - 1)
      out += String(
        take(values, idx != null ? idx + i : undefined, state) ?? "",
      );
  }
  return out;
}

function cloneNode(
  d: DescNode,
  values: unknown[],
  state: { vi: number },
  deferDOM: boolean,
): VNode {
  if (d.type === "text") {
    if (deferDOM) return { type: "text", value: d.value };
    return {
      type: "text",
      value: d.value,
      dom: document.createTextNode(d.value),
    };
  }
  if (d.type === "binding") {
    return resolveBinding(take(values, d.idx, state), deferDOM);
  }
  if (d.type === "element") {
    let resolvedKey: string | null | undefined =
      typeof d.key === "string" ? d.key : undefined;

    if (d.key && typeof d.key === "object" && d.key.binding) {
      const parts = d.key.parts!;
      if (parts.length === 2 && parts[0] === "" && parts[1] === "") {
        const rv = take(values, d.key.idx, state) as string | undefined;
        if (rv != null) resolvedKey = String(rv);
      } else {
        resolvedKey = interpolate(parts, values, d.key.idx, state);
      }
    }

    const attrs: Record<string, unknown> = {};
    for (const k in d.attrs) {
      const v = d.attrs[k];
      if (v && typeof v === "object" && v.binding) {
        const parts = v.parts!;
        if (parts.length === 2 && parts[0] === "" && parts[1] === "") {
          attrs[k] = take(values, v.idx, state);
        } else {
          attrs[k] = interpolate(parts, values, v.idx, state);
        }
      } else {
        attrs[k] = v;
      }
    }

    const events: Record<string, unknown> = {};
    for (const e in d.events) {
      const h = d.events[e];
      if (h && typeof h === "object" && h.binding) {
        events[e] = take(values, h.idx, state);
      } else {
        events[e] = h;
      }
    }

    const children = createNodes(d.children, values, state, deferDOM);

    if (deferDOM) {
      return {
        type: "element",
        tag: d.tag,
        ns: d.ns,
        attrs,
        events,
        key: resolvedKey,
        children,
      };
    }

    const el = createEl(d.tag, d.ns);
    for (const k in attrs) setProp(el, k, attrs[k]);
    for (const e in events) {
      if (events[e] != null) el.addEventListener(e, events[e] as EventListener);
    }
    for (const c of children) el.appendChild(c.dom!);

    return {
      type: "element",
      tag: d.tag,
      ns: d.ns,
      attrs,
      events,
      key: resolvedKey,
      children,
      dom: el,
    };
  }
  throw new Error("unreachable");
}

function resolveBinding(val: unknown, deferDOM: boolean): VNode {
  if (val == null || val === false) {
    if (deferDOM) return { type: "text", value: "" };
    return { type: "text", value: "", dom: document.createTextNode("") };
  }
  if (Array.isArray(val)) {
    const nodes: VNode[] = [];
    for (const item of val) nodes.push(resolveBinding(item, deferDOM));
    return { type: "fragment", children: nodes };
  }
  const vnodeType =
    val && typeof val === "object" && "type" in val
      ? (val as Record<string, unknown>).type
      : undefined;
  if (
    vnodeType === "text" &&
    typeof (val as Record<string, unknown>).value === "string"
  ) {
    return val as TextVNode;
  }
  if (
    vnodeType === "fragment" &&
    Array.isArray((val as Record<string, unknown>).children)
  ) {
    return val as FragmentVNode;
  }
  if (
    vnodeType === "element" &&
    typeof (val as Record<string, unknown>).tag === "string"
  ) {
    return val as ElementVNode;
  }
  if (
    vnodeType === "raw" &&
    typeof (val as Record<string, unknown>).html === "string"
  ) {
    return materializeRaw(val as RawVNode, deferDOM);
  }
  const s = escapeText(String(val));
  if (deferDOM) return { type: "text", value: s };
  return { type: "text", value: s, dom: document.createTextNode(s) };
}
