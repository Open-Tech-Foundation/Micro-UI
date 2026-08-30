/**
 * Split — the domain logic, with no DOM in it.
 *
 * Money is integer cents from end to end, the splits lose no remainder, and
 * settling up is a real algorithm rather than a display trick. It lives apart
 * from the components so it can be tested as what it is: arithmetic.
 */

// ── Types ──────────────────────────────────────────────────────────

export type Person = { id: string; name: string };

export type Expense = {
  id: string;
  what: string;
  cents: number; // integer cents — no float ever touches money here
  payer: string; // Person id
  among: string[]; // Person ids sharing the cost; the payer need not be one
};

export type SplitState = { people: Person[]; expenses: Expense[] };

export type Tally = { paid: number; share: number; net: number };

export type Transfer = { from: string; to: string; cents: number };

// ── Money ──────────────────────────────────────────────────────────

/** "12.5", "1,234.56" → cents. `null` for anything that is not a positive amount. */
export function parseMoney(input: string): number | null {
  const t = input.trim().replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return cents > 0 ? cents : null;
}

export const money = (cents: number) =>
  `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;

/** Stable small integer from an id — used to rotate who absorbs the odd cent. */
export function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Split `cents` `n` ways losing nothing. $10 between 3 is 3.34 / 3.33 / 3.33,
 * never 3.33 × 3 with a cent unaccounted for. The remainder starts at
 * `offset` so the same person is not always the one rounded up.
 */
export function shares(cents: number, n: number, offset: number): number[] {
  const base = Math.floor(cents / n);
  const rem = cents - base * n;
  return Array.from(
    { length: n },
    (_, i) => base + ((i - offset + n) % n < rem ? 1 : 0),
  );
}

// ── Derived state ──────────────────────────────────────────────────

/** What each person paid, what they owe, and the difference. */
export function tallies(state: SplitState): Record<string, Tally> {
  const out: Record<string, Tally> = {};
  for (const p of state.people) out[p.id] = { paid: 0, share: 0, net: 0 };

  for (const e of state.expenses) {
    const among = e.among.filter((id) => out[id]);
    if (among.length === 0) continue;

    const payer = out[e.payer];
    if (payer) payer.paid += e.cents;

    const parts = shares(e.cents, among.length, hash(e.id) % among.length);
    among.forEach((id, i) => {
      const t = out[id];
      if (t) t.share += parts[i] ?? 0;
    });
  }

  for (const id in out) {
    const t = out[id];
    if (t) t.net = t.paid - t.share;
  }
  return out;
}

/**
 * Settle up: pay the largest debt to the largest credit, repeatedly. Every
 * step zeroes out at least one person, so `people - 1` transfers is the worst
 * case — twenty receipts between four people come out as three payments.
 */
export function settle(
  state: SplitState,
  byId: Record<string, Tally>,
): Transfer[] {
  const owes = state.people
    .map((p) => ({ id: p.id, cents: -(byId[p.id]?.net ?? 0) }))
    .filter((x) => x.cents > 0)
    .sort((a, b) => b.cents - a.cents);
  const owed = state.people
    .map((p) => ({ id: p.id, cents: byId[p.id]?.net ?? 0 }))
    .filter((x) => x.cents > 0)
    .sort((a, b) => b.cents - a.cents);

  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < owes.length && j < owed.length) {
    const debtor = owes[i]!;
    const creditor = owed[j]!;
    const amount = Math.min(debtor.cents, creditor.cents);
    out.push({ from: debtor.id, to: creditor.id, cents: amount });
    debtor.cents -= amount;
    creditor.cents -= amount;
    if (debtor.cents === 0) i++;
    if (creditor.cents === 0) j++;
  }
  return out;
}
