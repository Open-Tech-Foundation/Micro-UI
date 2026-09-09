// Keyed list patching: the number of DOM moves, not just the final order.
//
// The order assertions here are the contract; the insertBefore counts are the
// reason patchKeyed computes a longest-increasing-subsequence instead of
// walking the list right-to-left and re-anchoring every node it passes. Under
// the old walk, swapping two rows of a thousand moved every row between them.
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";

const { define, html, update } = await import(
  `../../src/index.ts?keyed-lis-${Date.now()}`
);

function uniqueTag(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
function tick() {
  return new Promise((r) => queueMicrotask(r));
}

// A list component driven by a mutable `items` array the test owns.
async function mountList(items, row = (i) => html`<li key=${i}>${i}</li>`) {
  const tag = uniqueTag("x-lis");
  let ref;
  define(tag, (el) => {
    ref = el;
    return () => html`<ul>${items.current.map(row)}</ul>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  return { el, ul: el.querySelector("ul"), rerender: () => update(ref) };
}

// Counts moves on one element only, so unrelated work elsewhere in the tree
// (the component host, nested lists) cannot inflate the number.
function countMoves(node) {
  const real = node.insertBefore;
  const stats = { calls: 0, restore: () => (node.insertBefore = real) };
  node.insertBefore = function (child, ref) {
    stats.calls++;
    return real.call(this, child, ref);
  };
  return stats;
}

function text(ul) {
  return [...ul.children].map((n) => n.textContent).join(",");
}

// assert.deepEqual compares two *distinct* DOM nodes as equal — their own
// enumerable properties are both empty — so node identity has to be asserted
// element by element with strict equality.
function sameNodes(actual, expected, msg) {
  assert.equal(actual.length, expected.length, `${msg}: row count`);
  for (let i = 0; i < expected.length; i++)
    assert.equal(actual[i], expected[i], `${msg}: row ${i} is not the same node`);
}

// Deterministic PRNG — a failing shuffle has to be reproducible.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

test("keyed: swapping two rows of 1001 costs two moves, not the span", async () => {
  const items = { current: Array.from({ length: 1001 }, (_, i) => i) };
  const { ul, rerender } = await mountList(items);
  assert.equal(ul.children.length, 1001);
  const first = ul.children[1];
  const second = ul.children[998];

  const next = items.current.slice();
  [next[1], next[998]] = [next[998], next[1]];
  items.current = next;

  const moves = countMoves(ul);
  rerender();
  await tick();
  moves.restore();

  assert.equal(ul.children[1], second, "row 998 moved up");
  assert.equal(ul.children[998], first, "row 1 moved down");
  assert.equal(ul.children[1].textContent, "998");
  assert.equal(ul.children[998].textContent, "1");
  assert.equal(ul.children.length, 1001);
  assert.equal(moves.calls, 2, "one insertBefore per genuinely displaced row");
});

test("keyed: re-rendering an unchanged list moves nothing", async () => {
  const items = { current: Array.from({ length: 50 }, (_, i) => i) };
  const { ul, rerender } = await mountList(items);
  const moves = countMoves(ul);
  rerender();
  await tick();
  moves.restore();
  assert.equal(moves.calls, 0);
  assert.equal(ul.children.length, 50);
});

test("keyed: changing only row content moves nothing", async () => {
  const items = { current: [1, 2, 3, 4, 5].map((n) => ({ id: n, label: `a${n}` })) };
  const row = (i) => html`<li key=${i.id}>${i.label}</li>`;
  const { ul, rerender } = await mountList(items, row);
  const before = [...ul.children];

  items.current = items.current.map((i) => ({ ...i, label: `b${i.id}` }));
  const moves = countMoves(ul);
  rerender();
  await tick();
  moves.restore();

  assert.equal(moves.calls, 0);
  sameNodes([...ul.children], before, "same nodes, in place");
  assert.equal(text(ul), "b1,b2,b3,b4,b5");
});

test("keyed: moving one row to the front is a single move", async () => {
  const items = { current: [1, 2, 3, 4, 5, 6] };
  const { ul, rerender } = await mountList(items);
  const sixth = ul.children[5];
  items.current = [6, 1, 2, 3, 4, 5];

  const moves = countMoves(ul);
  rerender();
  await tick();
  moves.restore();

  assert.equal(text(ul), "6,1,2,3,4,5");
  assert.equal(ul.children[0], sixth, "identity preserved");
  assert.equal(moves.calls, 1);
});

test("keyed: reversing n rows costs n-1 moves", async () => {
  const items = { current: [1, 2, 3, 4, 5, 6, 7, 8] };
  const { ul, rerender } = await mountList(items);
  items.current = items.current.slice().reverse();

  const moves = countMoves(ul);
  rerender();
  await tick();
  moves.restore();

  assert.equal(text(ul), "8,7,6,5,4,3,2,1");
  assert.equal(moves.calls, 7, "one row of the reversal can stay put");
});

test("keyed: appending rows does not move the rows already there", async () => {
  const items = { current: [1, 2, 3] };
  const { ul, rerender } = await mountList(items);
  const before = [...ul.children];
  items.current = [1, 2, 3, 4, 5];

  const moves = countMoves(ul);
  rerender();
  await tick();
  moves.restore();

  assert.equal(text(ul), "1,2,3,4,5");
  sameNodes([...ul.children].slice(0, 3), before, "existing rows untouched");
  assert.equal(moves.calls, 2, "only the two new rows are inserted");
});

test("keyed: prepending a row moves nothing that was already there", async () => {
  const items = { current: [2, 3, 4] };
  const { ul, rerender } = await mountList(items);
  const before = [...ul.children];
  items.current = [1, 2, 3, 4];

  const moves = countMoves(ul);
  rerender();
  await tick();
  moves.restore();

  assert.equal(text(ul), "1,2,3,4");
  sameNodes([...ul.children].slice(1), before, "existing rows untouched");
  assert.equal(moves.calls, 1);
});

test("keyed: removing a middle row moves nothing", async () => {
  const items = { current: [1, 2, 3, 4, 5] };
  const { ul, rerender } = await mountList(items);
  items.current = [1, 2, 4, 5];

  const moves = countMoves(ul);
  rerender();
  await tick();
  moves.restore();

  assert.equal(text(ul), "1,2,4,5");
  assert.equal(moves.calls, 0);
});

test("keyed: shuffles converge, with no more moves than rows out of order", async () => {
  const size = 40;
  const items = { current: Array.from({ length: size }, (_, i) => i) };
  const { ul, rerender } = await mountList(items);
  const nodes = new Map([...ul.children].map((n) => [n.textContent, n]));
  const rand = rng(20260830);

  for (let round = 0; round < 25; round++) {
    const next = items.current.slice();
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    // The optimum for a permutation is n minus its longest increasing run.
    const optimal = size - lisLength(next.map((v) => items.current.indexOf(v)));
    items.current = next;

    const moves = countMoves(ul);
    rerender();
    await tick();
    moves.restore();

    assert.equal(text(ul), next.join(","), `round ${round} order`);
    assert.equal(moves.calls, optimal, `round ${round} move count`);
    for (const n of ul.children)
      assert.equal(n, nodes.get(n.textContent), `round ${round} identity`);
  }
});

// Reference implementation, independent of the one under test.
function lisLength(seq) {
  const tails = [];
  for (const v of seq) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = v;
  }
  return tails.length;
}

test("keyed: add, remove and reorder in one pass", async () => {
  const items = { current: [1, 2, 3, 4, 5] };
  const { ul, rerender } = await mountList(items);
  const three = ul.children[2];
  items.current = [5, 9, 3, 1, 7];
  rerender();
  await tick();
  assert.equal(text(ul), "5,9,3,1,7");
  assert.equal(ul.children.length, 5);
  assert.equal(ul.children[2], three, "surviving row kept its node");
});

test("keyed: a list rebuilt from scratch keeps no stale rows", async () => {
  const items = { current: [1, 2, 3] };
  const { ul, rerender } = await mountList(items);
  items.current = [7, 8, 9, 10];
  rerender();
  await tick();
  assert.equal(text(ul), "7,8,9,10");
  assert.equal(ul.children.length, 4);
});

test("keyed: unkeyed rows mixed into a keyed list stay positional", async () => {
  const items = { current: [1, 2, 3] };
  const row = (i) =>
    i % 2 === 0 ? html`<li>${i}</li>` : html`<li key=${i}>${i}</li>`;
  const { ul, rerender } = await mountList(items, row);
  assert.equal(text(ul), "1,2,3");
  items.current = [3, 2, 1];
  rerender();
  await tick();
  assert.equal(text(ul), "3,2,1");
  assert.equal(ul.children.length, 3);
});

test("keyed: a duplicated key leaves exactly one row behind", async () => {
  const items = { current: [1, 2, 3] };
  const { ul, rerender } = await mountList(items);
  items.current = [1, 1, 3];
  rerender();
  await tick();
  assert.equal(ul.children.length, 3, "no orphan from the shadowed duplicate");
  assert.equal(text(ul), "1,1,3");
});

test("keyed: a row detached from outside is put back, not rebuilt", async () => {
  const items = { current: [1, 2, 3] };
  const { ul, rerender } = await mountList(items);
  const second = ul.children[1];
  second.remove();
  assert.equal(ul.children.length, 2);

  rerender();
  await tick();

  assert.equal(ul.children.length, 3);
  assert.equal(ul.children[1], second, "same node reclaimed by key");
  assert.equal(text(ul), "1,2,3");
});

test("keyed: the last row, detached from outside, is put back", async () => {
  const items = { current: [1, 2, 3] };
  const { ul, rerender } = await mountList(items);
  const last = ul.children[2];
  last.remove();
  assert.equal(ul.children.length, 2);

  rerender();
  await tick();

  // The old placement compared nextSibling against the anchor; for a detached
  // final row both are null, so it was never re-inserted.
  assert.equal(ul.children.length, 3);
  assert.equal(ul.children[2], last);
  assert.equal(text(ul), "1,2,3");
});

test("unkeyed: a detached row is put back at its position", async () => {
  const items = { current: [1, 2, 3] };
  const row = (i) => html`<li data-row=${i}>${i}</li>`;
  const { ul, rerender } = await mountList(items, row);
  const before = [...ul.children];
  before[1].remove();

  rerender();
  await tick();

  assert.equal(text(ul), "1,2,3");
  sameNodes([...ul.children], before, "detached unkeyed row keeps its node");
});

test("keyed: a list re-ordered from outside converges on the next render", async () => {
  const items = { current: [1, 2, 3, 4] };
  const { ul, rerender } = await mountList(items);
  // Drag and drop, or any other code that moves siblings behind our back.
  ul.insertBefore(ul.children[3], ul.children[0]);
  assert.equal(text(ul), "4,1,2,3");

  rerender();
  await tick();

  assert.equal(text(ul), "1,2,3,4", "the render's order wins");
});

test("keyed: rows changing tag are replaced, not duplicated", async () => {
  const items = { current: [1, 2, 3] };
  const row = (i) =>
    i === 2 ? html`<b key=${i}>${i}</b>` : html`<li key=${i}>${i}</li>`;
  const { ul, rerender } = await mountList(items);
  assert.equal(ul.children.length, 3);

  const { ul: ul2, rerender: rerender2 } = await mountList(
    { current: [1, 2, 3] },
    row,
  );
  assert.equal(ul2.children.length, 3);
  assert.equal(ul2.children[1].tagName, "B");
  rerender2();
  await tick();
  assert.equal(ul2.children.length, 3, "no resurrected node");
  assert.equal(text(ul2), "1,2,3");
  rerender();
  await tick();
  assert.equal(ul.children.length, 3);
});

test("keyed: emptying and refilling a large list", async () => {
  const items = { current: Array.from({ length: 200 }, (_, i) => i) };
  const { ul, rerender } = await mountList(items);
  items.current = [];
  rerender();
  await tick();
  assert.equal(ul.children.length, 0);
  items.current = Array.from({ length: 200 }, (_, i) => i + 1000);
  rerender();
  await tick();
  assert.equal(ul.children.length, 200);
  assert.equal(ul.children[0].textContent, "1000");
  assert.equal(ul.children[199].textContent, "1199");
});

// ── the same-order fast path ───────────────────────────────────────────────
// It is deliberately unobservable: it must reach exactly the DOM the general
// path would. These tests pin the cases where it could quietly diverge.

test("keyed: fast path updates content of unkeyed rows in a keyed list", async () => {
  const items = { current: [1, 2, 3] };
  const row = (i) =>
    i === 2 ? html`<li>${`u${i}`}</li>` : html`<li key=${i}>${`k${i}`}</li>`;
  const { ul, rerender } = await mountList(items, row);
  const before = [...ul.children];
  assert.equal(text(ul), "k1,u2,k3");

  items.current = [1, 2, 3];
  const moves = countMoves(ul);
  rerender();
  await tick();
  moves.restore();

  assert.equal(moves.calls, 0);
  sameNodes([...ul.children], before, "unkeyed rows kept their nodes");
});

test("keyed: fast path replaces a row whose tag changed, in place", async () => {
  const items = { current: [1, 2, 3] };
  let heavy = false;
  const row = (i) =>
    heavy && i === 2 ? html`<b key=${i}>${i}</b>` : html`<li key=${i}>${i}</li>`;
  const { ul, rerender } = await mountList(items, row);
  const first = ul.children[0];
  assert.equal(ul.children[1].tagName, "LI");

  heavy = true;
  rerender();
  await tick();

  assert.equal(ul.children.length, 3, "replaced, not duplicated");
  assert.equal(ul.children[1].tagName, "B");
  assert.equal(text(ul), "1,2,3");
  assert.equal(ul.children[0], first, "its neighbours were left alone");
});

test("keyed: fast path is skipped when a stray node appears mid-list", async () => {
  const items = { current: [1, 2, 3] };
  const { ul, rerender } = await mountList(items);
  const stray = document.createElement("li");
  stray.textContent = "stray";
  ul.insertBefore(stray, ul.children[1]);

  items.current = [1, 2, 3, 4];
  rerender();
  await tick();

  // The library does not own the stray, so it stays; its own rows are correct
  // and in order around it.
  assert.equal(
    [...ul.children].filter((n) => n !== stray).map((n) => n.textContent).join(","),
    "1,2,3,4",
  );
});

test("keyed: duplicate keys in a stable list keep both rows and update them", async () => {
  const items = { current: [{ id: 1, v: "a" }, { id: 1, v: "b" }, { id: 2, v: "c" }] };
  const row = (i) => html`<li key=${i.id}>${i.v}</li>`;
  const { ul, rerender } = await mountList(items, row);
  const before = [...ul.children];
  assert.equal(text(ul), "a,b,c");

  items.current = items.current.map((i) => ({ ...i, v: i.v.toUpperCase() }));
  rerender();
  await tick();

  assert.equal(ul.children.length, 3);
  assert.equal(text(ul), "A,B,C");
  sameNodes([...ul.children], before, "no row was rebuilt");
});

// A model-only oracle. It deliberately does not use Micro-UI or the DOM nodes
// produced by the component, so it can catch a stale, missing, duplicated or
// misordered row even when the reconciler's own VNode state says otherwise.
function rebuildList(items) {
  const ul = document.createElement("ul");
  for (const item of items) {
    const li = document.createElement("li");
    li.setAttribute("data-row", item.id);
    li.setAttribute("data-key", item.key);
    li.textContent = item.label;
    ul.appendChild(li);
  }
  return ul;
}

function fuzzItem(serial, key) {
  return {
    id: `row-${serial}`,
    key,
    label: `instance ${serial} / ${key}`,
  };
}

function randomIndex(rand, length) {
  return Math.floor(rand() * length);
}

function applyFuzzOperation(items, rand, nextSerial) {
  let kind = Math.floor(rand() * 8);
  if (items.length === 0 && kind !== 0 && kind !== 7) kind = 7;
  if (items.length === 1 && (kind === 2 || kind === 3)) kind = 0;

  if (kind === 0) {
    const duplicate = items.length > 0 && rand() < 0.4;
    const key = duplicate
      ? items[randomIndex(rand, items.length)].key
      : `key-${nextSerial.value}`;
    const item = fuzzItem(nextSerial.value++, key);
    const at = randomIndex(rand, items.length + 1);
    items.splice(at, 0, item);
    return `insert ${item.id}(${key}) at ${at}`;
  }

  if (kind === 1) {
    const at = randomIndex(rand, items.length);
    const [item] = items.splice(at, 1);
    return `remove ${item.id}(${item.key}) at ${at}`;
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
    return `swap ${first} and ${second}`;
  }

  if (kind === 4) {
    if (items.length < 2) {
      const key = items.length === 1 ? items[0].key : `key-${nextSerial.value}`;
      const item = fuzzItem(nextSerial.value++, key);
      items.push(item);
      return `duplicate-insert ${item.id}(${key})`;
    }
    const target = randomIndex(rand, items.length);
    let source = randomIndex(rand, items.length - 1);
    if (source >= target) source++;
    const before = items[target].key;
    items[target] = { ...items[target], key: items[source].key };
    return `duplicate ${items[target].id}: ${before} -> ${items[source].key}`;
  }

  if (kind === 5) {
    items.length = 0;
    return "clear";
  }

  if (kind === 6) {
    const from = randomIndex(rand, items.length);
    const [item] = items.splice(from, 1);
    const to = randomIndex(rand, items.length + 1);
    items.splice(to, 0, item);
    return `remove/re-add ${item.id} from ${from} to ${to}`;
  }

  const count = 1 + randomIndex(rand, 4);
  for (let i = 0; i < count; i++) {
    const key = `key-${nextSerial.value}`;
    items.push(fuzzItem(nextSerial.value++, key));
  }
  return `re-add ${count} fresh rows`;
}

test("keyed: random list operations converge on a naive rebuild", async () => {
  const seeds = [20260909, 31415926, 8675309, 42424242, 11235813, 27182818];

  for (const seed of seeds) {
    const rand = rng(seed);
    const model = [
      fuzzItem(0, "key-0"),
      fuzzItem(1, "key-1"),
      fuzzItem(2, "key-2"),
    ];
    const items = { current: model };
    const nextSerial = { value: 3 };
    const { ul, rerender } = await mountList(
      items,
      (item) =>
        html`<li key=${item.key} data-row=${item.id} data-key=${item.key}>${item.label}</li>`,
    );

    for (let step = 0; step < 120; step++) {
      const operation = applyFuzzOperation(model, rand, nextSerial);
      items.current = model;
      rerender();
      await tick();

      const expected = rebuildList(model);
      assert.equal(
        ul.innerHTML,
        expected.innerHTML,
        `seed ${seed}, step ${step}, operation ${operation}`,
      );
    }
  }
});

function mixedItem(serial, keyed = serial % 2 === 0) {
  return {
    id: `mixed-${serial}`,
    key: keyed ? `mixed-key-${serial}` : null,
    keyed,
    tag: "li",
    revision: 0,
    label: `mixed instance ${serial}`,
  };
}

function mixedSignature(ul) {
  return [...ul.children].map((node) => ({
    tag: node.tagName,
    attrs: [...node.attributes]
      .map((attr) => [attr.name, attr.value])
      .sort(([a], [b]) => a.localeCompare(b)),
    text: node.textContent,
  }));
}

function rebuildMixedList(items) {
  const ul = document.createElement("ul");
  for (const item of items) {
    const row = document.createElement(item.tag);
    row.setAttribute("data-row", item.id);
    row.setAttribute("data-mode", item.keyed ? "keyed" : "plain");
    row.setAttribute("data-revision", String(item.revision));
    if (item.keyed) row.setAttribute("data-key", item.key);
    row.textContent = item.label;
    ul.appendChild(row);
  }
  return ul;
}

function mixedRow(item) {
  if (item.keyed) {
    return item.tag === "strong"
      ? html`<strong key=${item.key} data-row=${item.id} data-mode="keyed" data-revision=${item.revision} data-key=${item.key}>${item.label}</strong>`
      : html`<li key=${item.key} data-row=${item.id} data-mode="keyed" data-revision=${item.revision} data-key=${item.key}>${item.label}</li>`;
  }
  return item.tag === "strong"
    ? html`<strong data-row=${item.id} data-mode="plain" data-revision=${item.revision}>${item.label}</strong>`
    : html`<li data-row=${item.id} data-mode="plain" data-revision=${item.revision}>${item.label}</li>`;
}

function keyedNodes(ul) {
  return new Map(
    [...ul.children]
      .filter((node) => node.hasAttribute("data-key"))
      .map((node) => [node.getAttribute("data-key"), node]),
  );
}

function applyMixedOperation(items, rand, nextSerial) {
  let kind = Math.floor(rand() * 6);
  if (items.length === 0) kind = 0;
  if (items.length === 1 && (kind === 2 || kind === 3)) kind = 0;

  if (kind === 0) {
    const item = mixedItem(nextSerial.value++);
    const at = randomIndex(rand, items.length + 1);
    items.splice(at, 0, item);
    return `insert ${item.id} at ${at}`;
  }

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
    return `swap ${first} and ${second}`;
  }

  if (kind === 4) {
    const at = randomIndex(rand, items.length);
    const item = items[at];
    item.keyed = !item.keyed;
    item.key = item.keyed ? `mixed-key-${nextSerial.value++}` : null;
    item.revision++;
    return `toggle ${item.id} ${item.keyed ? "keyed" : "plain"}`;
  }

  const at = randomIndex(rand, items.length);
  const item = items[at];
  item.revision++;
  item.label = `mixed instance ${item.id} revision ${item.revision}`;
  if (rand() < 0.35) item.tag = item.tag === "li" ? "strong" : "li";
  return `edit ${item.id} revision ${item.revision}`;
}

function mutateExternalDOM(ul, rand) {
  const nodes = [...ul.children];
  const keyed = nodes.filter((node) => node.hasAttribute("data-key"));
  if (rand() < 0.4) {
    const node = nodes[randomIndex(rand, nodes.length)];
    node.remove();
    return `external detach ${node.getAttribute("data-row")}`;
  }

  // An unkeyed list has no identity with which to interpret an external
  // reorder. Keep that path's useful mutation as detach/reinsert coverage;
  // keyed rows are the ones whose external move the reconciler can recover.
  if (keyed.length === 0) {
    const node = nodes[randomIndex(rand, nodes.length)];
    node.remove();
    return `external detach ${node.getAttribute("data-row")}`;
  }

  const node = keyed[randomIndex(rand, keyed.length)];
  const at = nodes.indexOf(node);
  const [selected] = nodes.splice(at, 1);
  const to = randomIndex(rand, nodes.length + 1);
  if (to === nodes.length) ul.appendChild(selected);
  else ul.insertBefore(selected, nodes[to]);
  return `external move ${selected.getAttribute("data-row")} to ${to}`;
}

test("keyed: mixed lists survive external mutations and preserve keyed identity", async () => {
  const seeds = [7355608, 16180339, 9876543, 12344321];

  for (const seed of seeds) {
    const rand = rng(seed);
    const model = [0, 1, 2, 3, 4].map((serial) => mixedItem(serial));
    const items = { current: model };
    const nextSerial = { value: 5 };
    const { ul, rerender } = await mountList(items, mixedRow);
    const operations = [];

    for (let step = 0; step < 100; step++) {
      const before = keyedNodes(ul);
      const operation =
        rand() < 0.28
          ? mutateExternalDOM(ul, rand)
          : applyMixedOperation(model, rand, nextSerial);
      operations.push(operation);
      items.current = model;
      rerender();
      await tick();

      const expected = rebuildMixedList(model);
      assert.deepEqual(
        mixedSignature(ul),
        mixedSignature(expected),
        `seed ${seed}, step ${step}, operation ${operation}; recent: ${operations.slice(-8).join(" | ")}`,
      );
      const actual = keyedNodes(ul);
      for (const item of model) {
        const previous = before.get(item.key);
        if (
          item.keyed &&
          previous &&
          previous.tagName.toLowerCase() === item.tag
        ) {
          assert.equal(
            actual.get(item.key),
            previous,
            `seed ${seed}, step ${step}, keyed identity for ${item.key}`,
          );
        }
      }
    }
  }
});

test("keyed: numeric and string keys collide without leaking rows", async () => {
  const items = {
    current: [
      { id: "number-one", key: 1, kind: "number" },
      { id: "string-one", key: "1", kind: "string" },
      { id: "boolean-true", key: true, kind: "boolean" },
      { id: "string-true", key: "true", kind: "string" },
      { id: "number-two", key: 2, kind: "number" },
      { id: "unkeyed", key: null, kind: "null" },
    ],
  };
  const row = (item) => html`<li key=${item.key} data-id=${item.id} data-kind=${item.kind} data-key=${item.key}>${item.id}</li>`;
  const { ul, rerender } = await mountList(items, row);
  const assertRows = (label) => {
    assert.deepEqual(
      [...ul.children].map((node) => [
        node.getAttribute("data-id"),
        node.getAttribute("data-kind"),
        node.textContent,
      ]),
      items.current.map((item) => [item.id, item.kind, item.id]),
      label,
    );
    assert.equal(ul.children.length, items.current.length, `${label}: count`);
  };

  assertRows("initial collisions");

  items.current = [
    items.current[1],
    items.current[0],
    items.current[3],
    items.current[2],
    items.current[5],
    items.current[4],
  ];
  rerender();
  await tick();
  assertRows("reordered collisions");

  items.current = [
    items.current[1],
    items.current[2],
    items.current[5],
    items.current[4],
  ];
  rerender();
  await tick();
  assertRows("removed collisions");

  items.current = [];
  rerender();
  await tick();
  assertRows("cleared collisions");

  items.current = [
    { id: "false-string", key: "false", kind: "string" },
    { id: "false-boolean", key: false, kind: "boolean" },
    { id: "one-string", key: "1", kind: "string" },
    { id: "one-number", key: 1, kind: "number" },
    { id: "readded-unkeyed", key: null, kind: "null" },
  ];
  rerender();
  await tick();
  assertRows("re-added collisions");
});
