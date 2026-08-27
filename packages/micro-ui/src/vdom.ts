import { setProp } from "./dom.ts";
import { escapeText } from "./escape.ts";
import { materializeRaw } from "./raw.ts";
import type { DescNode, TemplateCache, VNode } from "./types.ts";

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
    const v = values[state.vi++];
    return resolveBinding(v, deferDOM);
  }
  if (d.type === "element") {
    let resolvedKey: string | null | undefined =
      typeof d.key === "string" ? d.key : undefined;

    if (d.key && typeof d.key === "object" && d.key.binding) {
      const parts = d.key.parts!;
      if (parts.length === 2 && parts[0] === "" && parts[1] === "") {
        resolvedKey = values[state.vi++] as string | undefined;
        if (resolvedKey != null) resolvedKey = String(resolvedKey);
      } else {
        let out = "";
        for (let i = 0; i < parts.length; i++) {
          out += parts[i];
          if (i < parts.length - 1) out += String(values[state.vi++] ?? "");
        }
        resolvedKey = out;
      }
    }

    const attrs: Record<string, unknown> = {};
    for (const k in d.attrs) {
      const v = d.attrs[k];
      if (v && typeof v === "object" && v.binding) {
        const parts = v.parts!;
        if (parts.length === 2 && parts[0] === "" && parts[1] === "") {
          attrs[k] = values[state.vi++];
        } else {
          let out = "";
          for (let i = 0; i < parts.length; i++) {
            out += parts[i];
            if (i < parts.length - 1) out += String(values[state.vi++] ?? "");
          }
          attrs[k] = out;
        }
      } else {
        attrs[k] = v;
      }
    }

    const events: Record<string, unknown> = {};
    for (const e in d.events) {
      const h = d.events[e];
      if (h && typeof h === "object" && h.binding) {
        events[e] = values[state.vi++];
      } else {
        events[e] = h;
      }
    }

    const children = createNodes(d.children, values, state, deferDOM);

    if (deferDOM) {
      return {
        type: "element",
        tag: d.tag,
        attrs,
        events,
        key: resolvedKey,
        children,
      };
    }

    const el = document.createElement(d.tag);
    for (const k in attrs) setProp(el, k, attrs[k]);
    for (const e in events) {
      if (events[e] != null) el.addEventListener(e, events[e] as EventListener);
    }
    for (const c of children) el.appendChild(c.dom!);

    return {
      type: "element",
      tag: d.tag,
      attrs,
      events,
      key: resolvedKey,
      children,
      dom: el,
    };
  }
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
  if (val && typeof val === "object" && "type" in val) {
    const vnode = val as VNode;
    if (vnode.type === "fragment") return vnode;
    if (vnode.type === "raw") return materializeRaw(val as never);
    return vnode;
  }
  const s = escapeText(String(val));
  if (deferDOM) return { type: "text", value: s };
  return { type: "text", value: s, dom: document.createTextNode(s) };
}
