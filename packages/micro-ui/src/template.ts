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

/**
 * Elements whose content the parser reads as raw text. `<!--` inside one of
 * these is literally the characters `<`, `!`, `-`, `-` — not a comment — so a
 * placeholder there has to stay a bare marker character.
 */
const RAW_TEXT =
  /^(script|style|textarea|title|xmp|iframe|noembed|noframes|plaintext)$/i;

type ScanState = {
  /** Between `<tag` and the `>` that closes it — an attribute position. */
  inTag: boolean;
  /** The quote character an attribute value is inside, or "". */
  quote: string;
  /** The raw-text element we are inside, or "". */
  raw: string;
  /** Inside an author's `<!-- ... -->`. */
  comment: boolean;
  /** A raw-text tag whose `>` we have not reached yet. */
  pending: string;
};

/**
 * Walks `s` from `i` to its end, tracking just enough of the tokenizer to
 * answer one question: at the point we stopped, is a `<!-- -->` comment a
 * comment? Templates are parsed once and cached on the literal, so this runs
 * once per distinct template.
 */
function scan(s: string, i: number, st: ScanState): void {
  while (i < s.length) {
    if (st.comment) {
      const end = s.indexOf("-->", i);
      if (end < 0) return;
      st.comment = false;
      i = end + 3;
      continue;
    }
    if (st.raw) {
      const end = s.toLowerCase().indexOf(`</${st.raw}`, i);
      if (end < 0) return;
      st.raw = "";
      i = end + 2;
      continue;
    }
    if (st.inTag) {
      for (; i < s.length; i++) {
        const c = s[i]!;
        if (st.quote) {
          if (c === st.quote) st.quote = "";
        } else if (c === '"' || c === "'") {
          st.quote = c;
        } else if (c === ">") {
          st.inTag = false;
          // A self-closing `<textarea />` never opens a raw-text region.
          if (st.pending && s[i - 1] !== "/") st.raw = st.pending;
          st.pending = "";
          i++;
          break;
        }
      }
      continue;
    }
    const lt = s.indexOf("<", i);
    if (lt < 0) return;
    if (s.startsWith("<!--", lt)) {
      st.comment = true;
      i = lt + 4;
      continue;
    }
    const name = /^<\/?([a-zA-Z][^\s/>]*)/.exec(s.slice(lt));
    if (!name) {
      // A lone `<` the parser will treat as text.
      i = lt + 1;
      continue;
    }
    const tag = name[1]!.toLowerCase();
    st.inTag = true;
    // A doctype needs no case of its own: the name match fails on `<!`, the
    // scan steps past it, and a `>` outside a tag is ignored anyway.
    st.pending = s[lt + 1] !== "/" && RAW_TEXT.test(tag) ? tag : "";
    i = lt + name[0].length;
  }
}

export function buildTemplate(strings: TemplateStringsArray): TemplateCache {
  let s = "";
  let scanned = 0;
  const st: ScanState = {
    inTag: false,
    quote: "",
    raw: "",
    comment: false,
    pending: "",
  };
  for (let i = 0; i < strings.length; i++) {
    s += strings[i];
    if (i < strings.length - 1) {
      scan(s, scanned, st);
      // In a child position the placeholder is a comment, because the parser
      // moves stray *text* out of <table>, <tbody>, <tr> and friends — which
      // silently rendered every interpolated row above the table instead of
      // in it. A comment is left where it was written. In an attribute value,
      // or inside a raw-text element where `<!--` is not a comment at all, it
      // stays the bare marker.
      const atText = !st.inTag && !st.raw && !st.comment;
      s += atText ? `<!--${MARKER}-->` : MARKER;
      scanned = s.length;
    }
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
    } else if (n.nodeType === 8 && (n as Comment).data === MARKER) {
      const idx = bindings.length;
      bindings.push({ type: "binding", binding: true });
      nodes.push({ type: "binding", binding: true, idx });
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
