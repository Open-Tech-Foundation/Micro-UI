declare module "@opentf/micro-ui" {
  export function html(strings: TemplateStringsArray, ...values: any[]): any;
  export function define(tag: string, setup: (el: HTMLElement, props: Record<string,string>) => () => any): void;
  export function update(el: HTMLElement): void;
  export function flush(): void;
  export function mount(el: HTMLElement, tag: string): HTMLElement;
  export function onReady(cb: () => void | (()=>void)): void;
}
