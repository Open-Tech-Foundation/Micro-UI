import { test, assert, assertEquals } from "runtime:test";

const { define, html, update } = await import("../../src/index.ts");

const SVG_NS = "http://www.w3.org/2000/svg";

function uniqueTag(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function tick() {
  return new Promise((resolve) => queueMicrotask(resolve));
}

function rng(seed) {
  let state = seed >>> 0;
  return () =>
    ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function randomIndex(rand, length) {
  return Math.floor(rand() * length);
}

function newChild(outerSerial, nextChild) {
  const id = `child-${outerSerial}-${nextChild.value++}`;
  return { id, key: id, revision: 0, label: `value ${id}` };
}

function newOuter(serial, nextChild, rand) {
  const kinds = ["html", "svg", "foreign"];
  const children = [];
  const count = 1 + randomIndex(rand, 4);
  for (let i = 0; i < count; i++) children.push(newChild(serial, nextChild));
  return {
    id: `outer-${serial}`,
    key: `outer-key-${serial}`,
    kind: kinds[randomIndex(rand, kinds.length)],
    revision: 0,
    children,
  };
}

function setRowAttrs(row, item) {
  row.setAttribute("data-outer", item.id);
  row.setAttribute("data-kind", item.kind);
  row.setAttribute("data-revision", String(item.revision));
}

function setChildAttrs(row, child) {
  row.setAttribute("data-child", child.id);
  row.setAttribute("data-revision", String(child.revision));
}

function rebuildNested(items) {
  const ul = document.createElement("ul");
  for (const item of items) {
    const li = document.createElement("li");
    setRowAttrs(li, item);

    let childParent = li;
    if (item.kind === "html") {
      childParent = document.createElement("section");
      li.appendChild(childParent);
    } else {
      const svg = document.createElementNS(SVG_NS, "svg");
      const group = document.createElementNS(SVG_NS, "g");
      childParent = group;
      svg.appendChild(group);
      li.appendChild(svg);
      if (item.kind === "foreign") {
        const foreignObject = document.createElementNS(
          SVG_NS,
          "foreignObject",
        );
        const div = document.createElement("div");
        foreignObject.appendChild(div);
        group.replaceWith(foreignObject);
        childParent = div;
        svg.replaceChildren(foreignObject);
      }
    }

    for (const child of item.children) {
      const node =
        item.kind === "svg"
          ? document.createElementNS(SVG_NS, "circle")
          : document.createElement("span");
      setChildAttrs(node, child);
      if (item.kind === "svg") node.setAttribute("r", "5");
      else node.textContent = child.label;
      childParent.appendChild(node);
    }
    ul.appendChild(li);
  }
  return ul;
}

function childVNodes(item) {
  return item.children.map((child) =>
    item.kind === "svg"
      ? html`<circle key=${child.key} data-child=${child.id} data-revision=${child.revision} r="5"></circle>`
      : html`<span key=${child.key} data-child=${child.id} data-revision=${child.revision}>${child.label}</span>`,
  );
}

function renderOuter(item) {
  const children = childVNodes(item);
  if (item.kind === "html") {
    return html`<li key=${item.key} data-outer=${item.id} data-kind=${item.kind} data-revision=${item.revision}><section>${children}</section></li>`;
  }
  if (item.kind === "foreign") {
    return html`<li key=${item.key} data-outer=${item.id} data-kind=${item.kind} data-revision=${item.revision}><svg><foreignObject><div>${children}</div></foreignObject></svg></li>`;
  }
  return html`<li key=${item.key} data-outer=${item.id} data-kind=${item.kind} data-revision=${item.revision}><svg><g>${children}</g></svg></li>`;
}

function nodeSignature(node) {
  if (node.nodeType === Node.TEXT_NODE) return { text: node.nodeValue };
  if (node.nodeType !== Node.ELEMENT_NODE) return { type: node.nodeType };
  return {
    tag: node.tagName,
    namespace: node.namespaceURI,
    attrs: [...node.attributes]
      .map((attr) => [attr.name, attr.value])
      .sort(([a], [b]) => a.localeCompare(b)),
    children: [...node.childNodes].map(nodeSignature),
  };
}

function outerNodes(ul) {
  return new Map(
    [...ul.children].map((node) => [node.getAttribute("data-outer"), node]),
  );
}

function childNodes(ul) {
  return new Map(
    [...ul.querySelectorAll("[data-child]")].map((node) => [
      node.getAttribute("data-child"),
      node,
    ]),
  );
}

function addOuter(items, nextOuter, nextChild, rand) {
  const item = newOuter(nextOuter.value++, nextChild, rand);
  const at = randomIndex(rand, items.length + 1);
  items.splice(at, 0, item);
  return `insert ${item.id} at ${at}`;
}

function applyNestedOperation(items, nextOuter, nextChild, rand) {
  let kind = Math.floor(rand() * 7);
  if (items.length === 0 && kind !== 0 && kind !== 6) kind = 6;
  if (items.length === 1 && (kind === 1 || kind === 2 || kind === 3))
    kind = 4;

  if (kind === 0) return addOuter(items, nextOuter, nextChild, rand);

  if (kind === 1) {
    const at = randomIndex(rand, items.length);
    const [item] = items.splice(at, 1);
    return `remove ${item.id} at ${at}`;
  }

  if (kind === 2) {
    const from = randomIndex(rand, items.length);
    const to = randomIndex(rand, items.length);
    const [item] = items.splice(from, 1);
    items.splice(to, 0, item);
    return `move ${item.id} from ${from} to ${to}`;
  }

  if (kind === 3) {
    const first = randomIndex(rand, items.length);
    let second = randomIndex(rand, items.length - 1);
    if (second >= first) second++;
    [items[first], items[second]] = [items[second], items[first]];
    return `swap outer ${first} and ${second}`;
  }

  if (kind === 4) {
    const item = items[randomIndex(rand, items.length)];
    const kinds = ["html", "svg", "foreign"];
    let nextKind = kinds[randomIndex(rand, kinds.length)];
    if (nextKind === item.kind) nextKind = kinds[(kinds.indexOf(nextKind) + 1) % 3];
    item.kind = nextKind;
    item.revision++;
    return `toggle ${item.id} to ${nextKind}`;
  }

  if (kind === 5) {
    const item = items[randomIndex(rand, items.length)];
    let childKind = Math.floor(rand() * 4);
    if (item.children.length === 1 && childKind === 1) childKind = 0;
    if (childKind === 0) {
      const child = newChild(Number(item.id.slice(6)), nextChild);
      const at = randomIndex(rand, item.children.length + 1);
      item.children.splice(at, 0, child);
      return `insert ${child.id} in ${item.id} at ${at}`;
    }
    if (childKind === 1) {
      const at = randomIndex(rand, item.children.length);
      const [child] = item.children.splice(at, 1);
      return `remove ${child.id} from ${item.id}`;
    }
    if (childKind === 2 && item.children.length > 1) {
      const from = randomIndex(rand, item.children.length);
      const to = randomIndex(rand, item.children.length);
      const [child] = item.children.splice(from, 1);
      item.children.splice(to, 0, child);
      return `move ${child.id} in ${item.id}`;
    }
    const child = item.children[randomIndex(rand, item.children.length)];
    child.revision++;
    child.label = `updated ${child.id} revision ${child.revision}`;
    return `edit ${child.id}`;
  }

  if (items.length === 0) {
    const count = 1 + randomIndex(rand, 3);
    for (let i = 0; i < count; i++)
      items.push(newOuter(nextOuter.value++, nextChild, rand));
    return `re-add ${count} outer rows`;
  }
  items.length = 0;
  return "clear outer list";
}

test("nested keyed: random outer and inner operations match a recursive oracle", async () => {
  const seeds = [24681357, 31415926, 11235813, 8675309];

  for (const seed of seeds) {
    const rand = rng(seed);
    const nextOuter = { value: 0 };
    const nextChild = { value: 0 };
    const model = Array.from({ length: 4 }, () =>
      newOuter(nextOuter.value++, nextChild, rand),
    );
    const items = { current: model };
    const tag = uniqueTag("x-nested-fuzz");
    let ref;
    define(tag, (el) => {
      ref = el;
      return () => html`<ul>${items.current.map(renderOuter)}</ul>`;
    });
    const host = document.createElement(tag);
    document.body.appendChild(host);
    await tick();
    const ul = host.querySelector("ul");

    for (let step = 0; step < 90; step++) {
      const beforeOuter = outerNodes(ul);
      const beforeChildren = childNodes(ul);
      const beforeKinds = new Map(model.map((item) => [item.key, item.kind]));
      const operation = applyNestedOperation(
        model,
        nextOuter,
        nextChild,
        rand,
      );
      update(ref);
      await tick();

      const expected = rebuildNested(model);
      assertEquals(
        nodeSignature(ul),
        nodeSignature(expected),
        `seed ${seed}, step ${step}, operation ${operation}`,
      );

      const actualOuter = outerNodes(ul);
      const actualChildren = childNodes(ul);
      for (const item of model) {
        if (beforeOuter.has(item.key))
          assert(actualOuter.get(item.key) === beforeOuter.get(item.key));
        if (beforeKinds.get(item.key) !== item.kind) continue;
        for (const child of item.children) {
          if (beforeChildren.has(child.key))
            assert(
              actualChildren.get(child.key) === beforeChildren.get(child.key),
              `seed ${seed}, step ${step}, child ${child.key} identity`,
            );
        }
      }
    }
  }
});
