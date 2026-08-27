// jsdom test bootstrap — installs a real DOM onto globalThis so the
// Micro-UI library (which reaches for `document`, `customElements`, etc.
// at module load time) can be required directly. Each test file should
// import this *before* importing the library.
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

const { window } = dom;

// Mirror the bits the library and its test files use.
globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.customElements = window.customElements;
globalThis.Node = window.Node;
globalThis.Element = window.Element;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;

// Do NOT forward queueMicrotask / requestAnimationFrame from window —
// jsdom's wrappers close over globalThis and re-invoke themselves, which
// causes infinite recursion once assigned. Node's native implementations
// are sufficient for the library's scheduling needs.
if (!globalThis.queueMicrotask) globalThis.queueMicrotask = (fn) => Promise.resolve().then(fn);
if (!globalThis.requestAnimationFrame) globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
if (!globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

