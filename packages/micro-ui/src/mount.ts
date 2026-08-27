export function mount(el: HTMLElement, tag: string): HTMLElement {
  el.textContent = "";
  const child = document.createElement(tag);
  el.appendChild(child);
  return child;
}
