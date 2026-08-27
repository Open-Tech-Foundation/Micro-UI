import { buildRawString, wrapRaw } from "./raw.ts";
import { deferDOM, templates } from "./state.ts";
import { buildTemplate } from "./template.ts";
import type { RawVNode, VNode } from "./types.ts";
import { createTree } from "./vdom.ts";

export interface HtmlTag {
  (strings: TemplateStringsArray, ...values: unknown[]): VNode;
  raw(strings: TemplateStringsArray, ...values: unknown[]): RawVNode;
}

function htmlImpl(strings: TemplateStringsArray, ...values: unknown[]): VNode {
  let tpl = templates.get(strings) as ReturnType<typeof buildTemplate>;
  if (!tpl) {
    tpl = buildTemplate(strings);
    templates.set(strings, tpl);
  }
  return createTree(tpl, values, deferDOM);
}

htmlImpl.raw = function raw(
  strings: TemplateStringsArray,
  ...values: unknown[]
): RawVNode {
  return wrapRaw(buildRawString(strings, values));
};

export const html: HtmlTag = htmlImpl;
