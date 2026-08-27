export const MARKER = "\ue000";

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
  const tree = buildDesc(el.content, bindings);
  return { tree, bindings };
}

export function buildDesc(
  container: Element | DocumentFragment,
  bindings: BindingDesc[],
): DescNode[] {
  const nodes: DescNode[] = [];
  for (const n of Array.from(container.childNodes)) {
    if (n.nodeType === 1) {
      nodes.push(buildElDesc(n as Element, bindings));
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
            nodes.push({ type: "text", value: parts[j] });
          }
        }
      } else if (t?.trim()) {
        nodes.push({ type: "text", value: t });
      }
    }
  }
  return nodes;
}

function buildElDesc(el: Element, bindings: BindingDesc[]): ElementDesc {
  const tag = el.tagName.toLowerCase();
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
      events[ev] = { type: "binding", binding: true };
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
      attrs[name] = { type: "binding", binding: true, parts };
    } else {
      attrs[name] = value;
    }
  }

  return {
    type: "element",
    tag,
    attrs,
    events,
    key,
    children: buildDesc(el, bindings),
  };
}
