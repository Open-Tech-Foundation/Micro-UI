import { assert, assertEquals, test } from "runtime:test";
import {
  type SplitState,
  money,
  parseMoney,
  settle,
  shares,
  tallies,
} from "./split-math.ts";

// ── parsing ────────────────────────────────────────────────────────

test("parseMoney takes the shapes people actually type", () => {
  assertEquals(parseMoney("24"), 2400);
  assertEquals(parseMoney("24.5"), 2450);
  assertEquals(parseMoney("24.50"), 2450);
  assertEquals(parseMoney(" 1,234.56 "), 123456);
});

test("parseMoney rejects everything else", () => {
  for (const bad of [
    "",
    "0",
    "0.00",
    "-5",
    "abc",
    "12.345",
    "1.2.3",
    "$5",
    "1e3",
  ]) {
    assertEquals(
      parseMoney(bad),
      null,
      `expected ${JSON.stringify(bad)} to be rejected`,
    );
  }
});

test("parseMoney does not lose a cent to floating point", () => {
  // 0.1 + 0.2 territory: Number("11.07") * 100 is 1106.9999999999998.
  assertEquals(parseMoney("11.07"), 1107);
  assertEquals(parseMoney("8.11"), 811);
  assertEquals(parseMoney("1.005"), null);
});

test("money renders cents, sign included", () => {
  assertEquals(money(0), "$0.00");
  assertEquals(money(5), "$0.05");
  assertEquals(money(123456), "$1234.56");
  assertEquals(money(-2450), "-$24.50");
});

// ── splitting ──────────────────────────────────────────────────────

test("shares add back up to the amount, always", () => {
  for (let cents = 1; cents <= 200; cents++) {
    for (let n = 1; n <= 7; n++) {
      const parts = shares(cents, n, cents % n);
      assertEquals(
        parts.reduce((a, b) => a + b, 0),
        cents,
        `${cents} split ${n} ways`,
      );
    }
  }
});

test("shares differ by at most one cent", () => {
  const parts = shares(1000, 3, 0);
  assertEquals(parts, [334, 333, 333]);
  assert(Math.max(...parts) - Math.min(...parts) <= 1);
});

test("the offset moves who absorbs the odd cent", () => {
  assertEquals(shares(1000, 3, 0), [334, 333, 333]);
  assertEquals(shares(1000, 3, 1), [333, 334, 333]);
  assertEquals(shares(1000, 3, 2), [333, 333, 334]);
});

// ── balances ───────────────────────────────────────────────────────

const three = (expenses: SplitState["expenses"]): SplitState => ({
  people: [
    { id: "a", name: "Ada" },
    { id: "b", name: "Grace" },
    { id: "c", name: "Linus" },
  ],
  expenses,
});

test("the payer is credited and every participant charged", () => {
  const state = three([
    {
      id: "x",
      what: "Dinner",
      cents: 9000,
      payer: "a",
      among: ["a", "b", "c"],
    },
  ]);
  const t = tallies(state);
  assertEquals(t.a, { paid: 9000, share: 3000, net: 6000 });
  assertEquals(t.b, { paid: 0, share: 3000, net: -3000 });
  assertEquals(t.c, { paid: 0, share: 3000, net: -3000 });
});

test("a payer who is not a participant is owed all of it", () => {
  const state = three([
    { id: "x", what: "Coffee", cents: 1000, payer: "a", among: ["b", "c"] },
  ]);
  const t = tallies(state);
  assertEquals(t.a?.net, 1000);
  assertEquals(t.b?.net, -500);
  assertEquals(t.c?.net, -500);
});

test("net balances sum to zero — no money invented or lost", () => {
  const state = three([
    {
      id: "x",
      what: "Cabin",
      cents: 24000,
      payer: "c",
      among: ["a", "b", "c"],
    },
    {
      id: "y",
      what: "Groceries",
      cents: 4211,
      payer: "a",
      among: ["a", "b", "c"],
    },
    { id: "z", what: "Taxi", cents: 2850, payer: "b", among: ["b", "c"] },
    { id: "w", what: "Coffee", cents: 1000, payer: "a", among: ["b", "c"] },
  ]);
  const t = tallies(state);
  const sum = Object.values(t).reduce((n, x) => n + x.net, 0);
  assertEquals(sum, 0);
});

test("a deleted person's share is dropped, not charged to a ghost", () => {
  const state = three([
    {
      id: "x",
      what: "Dinner",
      cents: 9000,
      payer: "a",
      among: ["a", "b", "gone"],
    },
  ]);
  const t = tallies(state);
  assertEquals(Object.keys(t).sort(), ["a", "b", "c"]);
  // Split between the two who are left, so it still adds up.
  assertEquals((t.a?.share ?? 0) + (t.b?.share ?? 0), 9000);
});

test("an expense with nobody left to share it is skipped", () => {
  const state = three([
    { id: "x", what: "Ghost", cents: 500, payer: "a", among: ["gone"] },
  ]);
  const t = tallies(state);
  assertEquals(
    Object.values(t).reduce((n, x) => n + x.share, 0),
    0,
  );
});

// ── settling ───────────────────────────────────────────────────────

test("settling clears every balance", () => {
  const state = three([
    {
      id: "x",
      what: "Cabin",
      cents: 24000,
      payer: "c",
      among: ["a", "b", "c"],
    },
    {
      id: "y",
      what: "Groceries",
      cents: 4211,
      payer: "a",
      among: ["a", "b", "c"],
    },
    { id: "z", what: "Taxi", cents: 2850, payer: "b", among: ["b", "c"] },
  ]);
  const t = tallies(state);
  const after: Record<string, number> = {};
  for (const p of state.people) after[p.id] = t[p.id]?.net ?? 0;
  for (const tr of settle(state, t)) {
    after[tr.from] = (after[tr.from] ?? 0) + tr.cents;
    after[tr.to] = (after[tr.to] ?? 0) - tr.cents;
  }
  for (const id in after) assertEquals(after[id], 0, `${id} is not square`);
});

test("no more transfers than people minus one", () => {
  const state = three([
    { id: "1", what: "a", cents: 1000, payer: "a", among: ["a", "b", "c"] },
    { id: "2", what: "b", cents: 2000, payer: "b", among: ["a", "b", "c"] },
    { id: "3", what: "c", cents: 3000, payer: "c", among: ["a", "b", "c"] },
    { id: "4", what: "d", cents: 4000, payer: "a", among: ["b", "c"] },
    { id: "5", what: "e", cents: 700, payer: "b", among: ["a"] },
  ]);
  const transfers = settle(state, tallies(state));
  assert(
    transfers.length <= state.people.length - 1,
    `${transfers.length} transfers for ${state.people.length} people`,
  );
});

test("every transfer is a positive amount between two different people", () => {
  const state = three([
    { id: "1", what: "a", cents: 3333, payer: "a", among: ["a", "b", "c"] },
    { id: "2", what: "b", cents: 1, payer: "b", among: ["a", "c"] },
  ]);
  for (const t of settle(state, tallies(state))) {
    assert(t.cents > 0, "a transfer of nothing is not a transfer");
    assert(t.from !== t.to, "nobody pays themselves");
  }
});

test("nothing to settle when everyone paid their own way", () => {
  const state = three([
    { id: "1", what: "a", cents: 500, payer: "a", among: ["a"] },
    { id: "2", what: "b", cents: 500, payer: "b", among: ["b"] },
  ]);
  assertEquals(settle(state, tallies(state)), []);
});

test("an empty trip settles into nothing", () => {
  const state: SplitState = { people: [], expenses: [] };
  assertEquals(tallies(state), {});
  assertEquals(settle(state, {}), []);
});
