export const MARKER = "\ue000";

import { HTML_NS, SVG_NS } from "./ns.ts";
import type {
  AttrValue,
  BindingDesc,
  DescNode,
  ElementDesc,
  EventValue,
  TemplateCache,
} from "./types.ts";

export function buildTemplate(strings: TemplateStringsArray): TemplateCache {
  let s = "";
  for (let i = 0; i < strings.length; i++) {
    s += strings[i];
    if (i < strings.length - 1) s += MARKER;
  }
  const el = document.createElement("template");
  el.innerHTML = s;
  const bindings: BindingDesc[] = [];
  const tree = buildDesc(el.content, bindings, HTML_NS);
  return { tree, bindings };
}

export function buildDesc(
  container: Element | DocumentFragment,
  bindings: BindingDesc[],
  parentNS: string | null,
): DescNode[] {
  const nodes: DescNode[] = [];
  for (const n of Array.from(container.childNodes)) {
    if (n.nodeType === 1) {
      nodes.push(buildElDesc(n as Element, bindings, parentNS));
    } else if (n.nodeType === 3) {
      const t = n.textContent ?? "";
      if (t.includes(MARKER)) {
        const parts = t.split(MARKER);
        for (let j = 0; j < parts.length; j++) {
          if (j > 0) {
            bindings.push({ type: "binding", binding: true });
            nodes.push({ type: "binding", binding: true });
          }
          if (parts[j] !== "") {
            nodes.push({ type: "text", value: parts[j]! });
          }
        }
      } else if (t?.trim()) {
        nodes.push({ type: "text", value: t });
      }
    }
  }
  return nodes;
}

function buildElDesc(
  el: Element,
  bindings: BindingDesc[],
  parentNS: string | null,
): ElementDesc {
  const tag = el.tagName.toLowerCase();
  // Hybrid NS detection: trust DOM namespaceURI when present, otherwise inherit.
  let ns: string | null;
  const domNS = (el as Element).namespaceURI;
  if (domNS === SVG_NS) {
    ns = SVG_NS;
  } else if (tag === "svg") {
    ns = SVG_NS;
  } else if (tag === "foreignobject") {
    // foreignObject itself is SVG, but its children revert to HTML
    ns = SVG_NS;
  } else if (parentNS === SVG_NS) {
    // Children of SVG stay SVG unless parent was foreignObject
    // We need to know if parent was foreignObject — check via parentNS derivation:
    // If parentNS is SVG but parent tag was foreignObject, children should be HTML.
    // Since we only have parentNS as string, we track foreignObject children specially:
    // The caller passes parentNS correctly (foreignObject children get HTML_NS).
    ns = SVG_NS;
  } else {
    ns = HTML_NS;
  }

  // For children, determine what NS they inherit:
  let childParentNS: string | null;
  if (ns === SVG_NS && tag === "foreignobject") {
    childParentNS = HTML_NS;
  } else {
    childParentNS = ns;
  }

  const attrs: Record<string, AttrValue> = {};
  const events: Record<string, EventValue> = {};
  let key: string | BindingDesc | null = null;

  for (const a of Array.from(el.attributes)) {
    const name = a.name;
    const value = a.value;

    if (name === "key") {
      if (value.includes(MARKER)) {
        const parts = value.split(MARKER);
        for (let i = 0; i < parts.length - 1; i++)
          bindings.push({ type: "binding", binding: true });
        key = { type: "binding", binding: true, parts };
      } else {
        key = value;
      }
      continue;
    }

    const isOnEvent = name.startsWith("on");
    if (value.includes(MARKER) && isOnEvent) {
      const ev = name.slice(2);
      const parts = value.split(MARKER);
      for (let i = 0; i < parts.length - 1; i++)
        bindings.push({ type: "binding", binding: true, name: ev });
      events[ev] = { binding: true };
      continue;
    }
    if (isOnEvent && !value.includes(MARKER)) {
      events[name.slice(2)] = value;
      continue;
    }

    if (value.includes(MARKER)) {
      const parts = value.split(MARKER);
      for (let i = 0; i < parts.length - 1; i++)
        bindings.push({ type: "binding", binding: true, name });
      attrs[name] = { binding: true, parts };
    } else {
      attrs[name] = value;
    }
  }

  return {
    type: "element",
    tag,
    ns,
    attrs,
    events,
    key,
    children: buildDesc(el, bindings, childParentNS),
  };
}
