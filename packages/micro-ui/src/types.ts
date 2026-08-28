export type AttrValue =
  | string
  | { binding: true; parts?: string[]; idx?: number; count?: number };
export type EventValue =
  | string
  | ((e: Event) => void)
  | { binding: true; idx?: number };

export interface BindingDesc {
  type: "binding";
  binding: true;
  parts?: string[];
  name?: string;
  /** Index of the first value this binding consumes from the values array. */
  idx?: number;
  /** Number of values this binding consumes (parts.length - 1). */
  count?: number;
}

export interface TextDesc {
  type: "text";
  value: string;
}

export interface ElementDesc {
  type: "element";
  tag: string;
  ns: string | null;
  attrs: Record<string, AttrValue>;
  events: Record<string, EventValue>;
  key: string | BindingDesc | null;
  children: DescNode[];
}

export type DescNode = TextDesc | BindingDesc | ElementDesc;

export interface TextVNode {
  type: "text";
  value: string;
  dom?: Text;
}

export interface ElementVNode {
  type: "element";
  tag: string;
  ns: string | null;
  attrs: Record<string, unknown>;
  events: Record<string, unknown>;
  key: string | null | undefined;
  children: VNode[];
  dom?: Element;
}

export interface FragmentVNode {
  type: "fragment";
  children: VNode[];
  dom?: undefined;
}

export type VNode = TextVNode | ElementVNode | FragmentVNode;

export interface RawVNode {
  type: "raw";
  html: string;
}

export interface TemplateCache {
  tree: DescNode[];
  bindings: BindingDesc[];
}

export interface InstanceRecord {
  render: () => VNode;
  tree: VNode;
  props: Record<string, string>;
  errored: boolean;
}

export type ErrorPhase = "setup" | "render" | "reconcile";
export type ErrorHandler = (
  el: HTMLElement,
  err: Error,
  phase: ErrorPhase,
) => void;
// biome-ignore lint/suspicious/noConfusingVoidType: onReady callbacks commonly return void
export type ReadyCallback = () => (() => void) | undefined | void;
export type CleanupFn = () => void;
export type SetupFn = (
  el: HTMLElement,
  props: Record<string, string>,
) => () => VNode;
