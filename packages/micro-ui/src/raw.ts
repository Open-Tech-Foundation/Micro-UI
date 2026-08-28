import { HTML_NS } from "./ns.ts";
import { buildDesc } from "./template.ts";
import type { RawVNode, VNode } from "./types.ts";
import { createNodes } from "./vdom.ts";

export function buildRawString(
  strings: TemplateStringsArray,
  values: unknown[],
): string {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < strings.length - 1) {
      const v = values[i];
      out +=
        v == null || v === false
          ? ""
          : Array.isArray(v)
            ? v.join("")
            : String(v);
    }
  }
  return out;
}

export function wrapRaw(htmlString: string): RawVNode {
  return { type: "raw", html: htmlString };
}

export function materializeRaw(raw: RawVNode): VNode {
  const tmpl = document.createElement("template");
  tmpl.innerHTML = raw.html;
  const children = buildDesc(tmpl.content, [], HTML_NS);
  return {
    type: "fragment",
    children: createNodes(children, [], { vi: 0 }, false),
  };
}
