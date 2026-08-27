// Minimal DOM mock for Micro-UI - ESM, no Node builtins, with proper template parsing
let registry = new Map();

class FakeNode {
  constructor() {
    this.childNodes = [];
    this.parentNode = null;
    this.nodeType = 1;
  }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    this.childNodes.push(child);
    child.parentNode = this;
    if (child.connectedCallback) {
      // Defer to next tick to mimic custom elements upgrade
      Promise.resolve().then(() => child.connectedCallback());
      // Also call synchronously for our mock
      try { child.connectedCallback(); } catch {}
    }
    return child;
  }
  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
      if (child.disconnectedCallback) child.disconnectedCallback();
    }
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
  replaceChild(newChild, oldChild) {
    const idx = this.childNodes.indexOf(oldChild);
    if (idx !== -1) {
      if (newChild.parentNode) newChild.parentNode.removeChild(newChild);
      this.childNodes[idx] = newChild;
      newChild.parentNode = this;
      oldChild.parentNode = null;
      if (oldChild.disconnectedCallback) oldChild.disconnectedCallback();
      if (newChild.connectedCallback) newChild.connectedCallback();
      return oldChild;
    }
    return null;
  }
  insertBefore(newChild, refChild) {
    if (newChild.parentNode) newChild.parentNode.removeChild(newChild);
    if (!refChild) {
      return this.appendChild(newChild);
    }
    const idx = this.childNodes.indexOf(refChild);
    if (idx !== -1) {
      this.childNodes.splice(idx, 0, newChild);
      newChild.parentNode = this;
      if (newChild.connectedCallback) newChild.connectedCallback();
    } else {
      this.appendChild(newChild);
    }
    return newChild;
  }
  get textContent() {
    if (this.nodeType === 3) return this._text || "";
    return this.childNodes.map(c => c.textContent || "").join("");
  }
  set textContent(v) {
    this._text = v;
    // For element nodes, also clear children and add text node if needed, but avoid recursion
    if (this.nodeType !== 3) {
      this.childNodes = [];
      if (v) {
        const tn = Object.create(FakeText.prototype);
        tn.childNodes = [];
        tn.parentNode = null;
        tn.nodeType = 3;
        tn._text = v;
        tn.textContent = v;
        tn.nodeValue = v;
        this.childNodes.push(tn);
        tn.parentNode = this;
      }
    }
  }
}

class FakeText extends FakeNode {
  constructor(text) {
    super();
    this.nodeType = 3;
    this._text = text;
    // define textContent and nodeValue as linked
    Object.defineProperty(this, 'textContent', {
      get() { return this._text || ""; },
      set(v) { this._text = v; this._nodeValue = v; },
      configurable: true
    });
    Object.defineProperty(this, 'nodeValue', {
      get() { return this._text || ""; },
      set(v) { this._text = v; },
      configurable: true
    });
    this._text = text;
    this._nodeValue = text;
  }
}

class FakeElement extends FakeNode {
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase();
    this.attributes = [];
    this._attrs = {};
    this._text = "";
    this.nodeType = 1;
    this.style = {};
    this.className = "";
    this._listeners = {};
  }
  getAttribute(name) {
    return this._attrs[name] ?? null;
  }
  setAttribute(name, value) {
    this._attrs[name] = String(value);
    const existing = this.attributes.find(a => a.name === name);
    if (existing) existing.value = String(value);
    else this.attributes.push({ name, value: String(value) });
    if (name === "class") this.className = String(value);
  }
  removeAttribute(name) {
    delete this._attrs[name];
    this.attributes = this.attributes.filter(a => a.name !== name);
    if (name === "class") this.className = "";
  }
  hasAttribute(name) { return name in this._attrs; }
  querySelector(sel) {
    const all = this.querySelectorAll(sel);
    return all[0] || null;
  }
  querySelectorAll(sel) {
    const results = [];
    // support simple selectors: tag, .class, tag.class
    function match(el, s) {
      if (!el.tagName) return false;
      if (s.includes(".")) {
        const [tag, cls] = s.split(".");
        const tagMatch = !tag || el.tagName.toLowerCase() === tag.toLowerCase();
        const clsMatch = el.className?.split(" ").includes(cls);
        return tagMatch && clsMatch;
      }
      if (s.startsWith(".")) return el.className?.split(" ").includes(s.slice(1));
      if (s.startsWith("#")) return el.getAttribute("id") === s.slice(1);
      return el.tagName.toLowerCase() === s.toLowerCase();
    }
    function walk(node) {
      for (const child of node.childNodes) {
        if (child.tagName && match(child, sel)) results.push(child);
        if (child.childNodes) walk(child);
      }
    }
    walk(this);
    return results;
  }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length-1] || null; }
  get nextSibling() {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[idx+1] || null;
  }
  addEventListener(type, fn) {
    this._listeners[type] = this._listeners[type] || [];
    this._listeners[type].push(fn);
  }
  removeEventListener(type, fn) {
    if (!this._listeners[type]) return;
    this._listeners[type] = this._listeners[type].filter(f => f !== fn);
  }
  dispatchEvent(event) {
    event.target = this;
    const listeners = this._listeners?.[event.type] || [];
    for (const fn of listeners) fn(event);
    return true;
  }
  click() { this.dispatchEvent({ type: "click", target: this, bubbles: true }); }
  get innerHTML() {
    return this.childNodes.map(c => c.outerHTML || c.textContent || "").join("");
  }
  set innerHTML(html) {
    this.childNodes = [];
    if (!html) return;
    // Simple parser for Micro-UI templates
    // We need to handle MARKER (\ue000) inside text and attributes
    // Use a stack to handle nested elements
    const stack = [this];
    let i = 0;
    while (i < html.length) {
      if (html[i] === "<") {
        const closeIdx = html.indexOf(">", i);
        if (closeIdx === -1) break;
        const tagContent = html.slice(i+1, closeIdx).trim();
        if (tagContent.startsWith("/")) {
          // closing tag
          stack.pop();
          i = closeIdx + 1;
        } else if (tagContent.endsWith("/")) {
          // self-closing
          const tagName = tagContent.slice(0, -1).trim().split(/\s+/)[0];
          const el = document.createElement(tagName);
          // parse attrs
          const attrStr = tagContent.slice(tagName.length).trim().replace(/\/$/, "");
          parseAttrs(el, attrStr);
          stack[stack.length-1].appendChild(el);
          i = closeIdx + 1;
        } else {
          const spaceIdx = tagContent.indexOf(" ");
          let tagName, attrStr;
          if (spaceIdx === -1) { tagName = tagContent; attrStr = ""; }
          else { tagName = tagContent.slice(0, spaceIdx); attrStr = tagContent.slice(spaceIdx+1); }
          const el = document.createElement(tagName);
          parseAttrs(el, attrStr);
          stack[stack.length-1].appendChild(el);
          // Check if next part is closing tag for same element (no children)
          // Push to stack for nested
          if (!isVoid(tagName)) {
            stack.push(el);
          }
          i = closeIdx + 1;
        }
      } else {
        // text
        const nextTag = html.indexOf("<", i);
        const textEnd = nextTag === -1 ? html.length : nextTag;
        const text = html.slice(i, textEnd);
        if (text) {
          stack[stack.length-1].appendChild(new FakeText(text));
        }
        i = textEnd;
      }
    }
    function parseAttrs(el, str) {
      // Match attrs like name="value" or name='value' or name=value or name
      const attrRegex = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
      let m;
      while ((m = attrRegex.exec(str)) !== null) {
        const name = m[1];
        const value = m[2] ?? m[3] ?? m[4] ?? "";
        // MARKER is \ue000, keep as is
        el.setAttribute(name, value);
      }
    }
    function isVoid(tag) {
      return ["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"].includes(tag.toLowerCase());
    }
  }
  get outerHTML() {
    const attrs = Object.entries(this._attrs).map(([k,v]) => ` ${k}="${v}"`).join("");
    const tag = this.tagName.toLowerCase();
    if (["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"].includes(tag)) {
      return `<${tag}${attrs}>`;
    }
    return `<${tag}${attrs}>${this.innerHTML}</${tag}>`;
  }
  get value() { return this._value ?? this.getAttribute("value") ?? ""; }
  set value(v) { this._value = String(v); this.setAttribute("value", String(v)); }
  get checked() { return !!this._checked; }
  set checked(v) { this._checked = !!v; if (v) this.setAttribute("checked", ""); else this.removeAttribute("checked"); }
}

class FakeTemplate extends FakeElement {
  constructor() {
    super("template");
    this.content = new FakeElement("content");
    this.content.nodeType = 11;
    this.content.childNodes = [];
  }
  get innerHTML() { return this._innerHTML || ""; }
  set innerHTML(html) {
    this._innerHTML = html;
    this.content.childNodes = [];
    // Parse html into content using same parser as FakeElement but for fragment
    const frag = this.content;
    frag.childNodes = [];
    if (!html) return;
    // Use the same parsing logic as FakeElement
    const temp = new FakeElement("div");
    temp.innerHTML = html;
    // Move children from temp to frag
    while (temp.childNodes.length) {
      const child = temp.childNodes[0];
      temp.removeChild(child);
      frag.appendChild(child);
    }
    // If still empty and html has text with MARKER, create text node
    if (frag.childNodes.length === 0 && html) {
      frag.appendChild(new FakeText(html));
    }
  }
}

const documentMock = {
  createElement(tag) {
    if (tag.toLowerCase() === "template") return new FakeTemplate();
    const Cls = registry.get(tag.toLowerCase());
    if (Cls) {
      const el = new Cls();
      // Ensure tagName is set
      el.tagName = tag.toUpperCase();
      el.nodeType = 1;
      el.childNodes = el.childNodes || [];
      el.attributes = el.attributes || [];
      el._attrs = el._attrs || {};
      return el;
    }
    return new FakeElement(tag);
  },
  createTextNode(text) {
    const n = new FakeText(text);
    n.nodeType = 3;
    return n;
  },
  body: new FakeElement("body"),
  head: new FakeElement("head"),
  querySelector(sel) { return this.body.querySelector(sel); },
  querySelectorAll(sel) { return this.body.querySelectorAll(sel); },
};

const customElementsMock = {
  define(tag, cls) {
    registry.set(tag.toLowerCase(), cls);
  },
  whenDefined(tag) { return Promise.resolve(); },
  get(tag) { return registry.get(tag.toLowerCase()); }
};

class HTMLElementMock extends FakeElement {
  constructor() {
    super("div");
    this.nodeType = 1;
  }
}

export function setupDOM() {
  globalThis.document = documentMock;
  globalThis.window = { document: documentMock, HTMLElement: HTMLElementMock, customElements: customElementsMock, Node: FakeNode, Event: class Event { constructor(type, init) { this.type = type; Object.assign(this, init); } } };
  globalThis.HTMLElement = HTMLElementMock;
  globalThis.customElements = customElementsMock;
  globalThis.Node = FakeNode;
  globalThis.Event = class Event { constructor(type, init) { this.type = type; Object.assign(this, init); } };
  globalThis.CustomEvent = class CustomEvent extends globalThis.Event {};
  registry.clear();
  documentMock.body.childNodes = [];
  // Mock queueMicrotask and requestAnimationFrame if needed
  if (!globalThis.queueMicrotask) globalThis.queueMicrotask = (fn) => Promise.resolve().then(fn);
  if (!globalThis.requestAnimationFrame) globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  return { window: globalThis.window, document: documentMock };
}

export { documentMock as document, customElementsMock as customElements, HTMLElementMock as HTMLElement };
