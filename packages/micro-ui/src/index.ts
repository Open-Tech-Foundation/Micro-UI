export { define } from "./define.ts";

export type { HtmlTag } from "./html.ts";

export { html } from "./html.ts";
export { onError, onReady } from "./lifecycle.ts";
export { mount } from "./mount.ts";
export type {
  AttrValue,
  BindingDesc,
  CleanupFn,
  DescNode,
  ElementDesc,
  ElementVNode,
  ErrorHandler,
  ErrorPhase,
  EventValue,
  FragmentVNode,
  InstanceRecord,
  RawVNode,
  ReadyCallback,
  SetupFn,
  TemplateCache,
  TextDesc,
  TextVNode,
  VNode,
} from "./types.ts";
export { flush, update } from "./update.ts";
