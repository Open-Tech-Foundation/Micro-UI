export const MARKER = "\ue000";

import { HTML_NS, resolveNS, SVG_NS } from "./ns.ts";
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
            const idx = bindings.length;
            bindings.push({ type: "binding", binding: true });
            nodes.push({ type: "binding", binding: true, idx });
          }
          if (parts[j] !== "") {
            nodes.push({ type: "text", value: parts[j]! });
          }
        }
      } else {
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
  const ns = resolveNS(tag, parentNS, (el as Element).namespaceURI);

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
        const idx = bindings.length;
        for (let i = 0; i < parts.length - 1; i++)
          bindings.push({ type: "binding", binding: true });
        key = {
          type: "binding",
          binding: true,
          parts,
          idx,
        };
      } else {
        key = value;
      }
      continue;
    }

    const isOnEvent = name.startsWith("on");
    if (value.includes(MARKER) && isOnEvent) {
      const ev = name.slice(2);
      const parts = value.split(MARKER);
      const idx = bindings.length;
      for (let i = 0; i < parts.length - 1; i++)
        bindings.push({ type: "binding", binding: true });
      events[ev] = { binding: true, idx };
      continue;
    }
    if (isOnEvent && !value.includes(MARKER)) {
      throw new Error(
        `Static "${name}" attribute is not a valid event handler. ` +
          `Use an interpolated function, e.g. ${name}="\${() => {}}" (or ${name}="\${fn}").`,
      );
    }

    if (value.includes(MARKER)) {
      const parts = value.split(MARKER);
      const idx = bindings.length;
      for (let i = 0; i < parts.length - 1; i++)
        bindings.push({ type: "binding", binding: true });
      attrs[name] = { binding: true, parts, idx };
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
