import { define, html, onReady, store, update } from "@opentf/micro-ui";
import {
  type Expense,
  type SplitState,
  hash,
  money,
  parseMoney,
  settle,
  shares,
  tallies,
} from "./split-math.ts";

/**
 * Split — a shared-expense settler.
 *
 * Four people, a pile of receipts, and the question everyone actually wants
 * answered: who pays whom, and how little can we get away with moving. The
 * page is a whole app rather than one feature: money is integer cents, the
 * splits lose no remainder, the settle-up is a real algorithm, the form
 * validates before it commits, and the roster refuses to delete someone who
 * is still on a receipt.
 */

const uid = () => Math.random().toString(36).slice(2, 8);

// ── State ──────────────────────────────────────────────────────────

const SAVE_KEY = "micro-ui-demo-split";

function seed(): SplitState {
  const [ada, grace, linus] = ["ada", "grace", "linus"];
  return {
    people: [
      { id: ada, name: "Ada" },
      { id: grace, name: "Grace" },
      { id: linus, name: "Linus" },
    ],
    expenses: [
      {
        id: "e1",
        what: "Cabin, two nights",
        cents: 24000,
        payer: linus,
        among: [ada, grace, linus],
      },
      {
        id: "e2",
        what: "Groceries",
        cents: 4210,
        payer: ada,
        among: [ada, grace, linus],
      },
      {
        id: "e3",
        what: "Taxi from the airport",
        cents: 2850,
        payer: grace,
        among: [grace, linus],
      },
      // The payer is deliberately not among the participants: Ada bought the
      // coffees for the other two and is owed all of it.
      {
        id: "e4",
        what: "Coffee run",
        cents: 1000,
        payer: ada,
        among: [grace, linus],
      },
    ],
  };
}

function load(): SplitState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as SplitState;
    // Storage is user-writable and survives a schema change, so trust nothing.
    if (!Array.isArray(parsed?.people) || !Array.isArray(parsed?.expenses)) {
      return seed();
    }
    return parsed;
  } catch {
    return seed();
  }
}

const read = (): SplitState => store.get<SplitState>("splitState") ?? seed();
const write = (next: SplitState) => store.set("splitState", next);

if (!store.get<SplitState>("splitState")) store.set("splitState", load());

// Persistence is a subscriber, not a call at every mutation site — nothing
// that writes state has to remember to save it.
store.subscribe("splitState", () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(read()));
  } catch {
    // Private mode, or a full quota. The app works, it just will not persist.
  }
});

const nameOf = (state: SplitState, id: string) =>
  state.people.find((p) => p.id === id)?.name ?? "someone";

// ── Roster ─────────────────────────────────────────────────────────

define("x-split-people", (el) => {
  let draft = "";
  let notice = "";

  onReady(() => store.subscribe("splitState", () => update(el)));

  const add = () => {
    const name = draft.trim();
    if (!name) return;
    const state = read();
    if (state.people.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      notice = `${name} is already here.`;
      update(el);
      return;
    }
    draft = "";
    notice = "";
    write({ ...state, people: [...state.people, { id: uid(), name }] });
  };

  const remove = (id: string) => {
    const state = read();
    const onReceipt = state.expenses.some(
      (e) => e.payer === id || e.among.includes(id),
    );
    if (onReceipt) {
      notice = `${nameOf(state, id)} is on an expense — delete those first.`;
      update(el);
      return;
    }
    notice = "";
    write({ ...state, people: state.people.filter((p) => p.id !== id) });
  };

  return () => {
    const state = read();
    const byId = tallies(state);

    return html`
      <div class="card">
        <h3>Who is in</h3>
        <div class="split-people">
          ${state.people.map((p) => {
            const net = byId[p.id]?.net ?? 0;
            return html`
              <span class="split-person" key=${p.id}>
                <span class="split-person-name">${p.name}</span>
                <span class="split-net ${net > 0 ? "is-up" : net < 0 ? "is-down" : ""}">
                  ${net === 0 ? "even" : money(net)}
                </span>
                <button
                  class="ui-btn ui-btn-ghost ui-btn-icon"
                  aria-label=${`Remove ${p.name}`}
                  onclick=${() => remove(p.id)}
                >×</button>
              </span>
            `;
          })}
          ${
            state.people.length === 0
              ? html`<p class="hint">Add someone to start.</p>`
              : null
          }
        </div>

        <div class="split-add">
          <input
            class="ui-input"
            placeholder="Add a person…"
            value=${draft}
            oninput=${(e: InputEvent) => {
              draft = (e.target as HTMLInputElement).value;
            }}
            onkeydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") add();
            }}
          />
          <button class="ui-btn ui-btn-secondary" onclick=${add}>Add</button>
        </div>
        ${notice ? html`<p class="ui-error-text">${notice}</p>` : null}
      </div>
    `;
  };
});

// ── Composer ───────────────────────────────────────────────────────

define("x-split-composer", (el) => {
  // The draft lives in the closure, not the store: nothing else on the page
  // needs to see a half-typed expense, and it disappears with the component.
  let what = "";
  let amount = "";
  let payer = "";
  let among: string[] | null = null; // null → everyone, including people added later
  let submitted = false;

  onReady(() => store.subscribe("splitState", () => update(el)));

  const people = () => read().people;

  const currentPayer = () => {
    const ids = people();
    return ids.some((p) => p.id === payer) ? payer : (ids[0]?.id ?? "");
  };

  const participants = () => among ?? people().map((p) => p.id);

  const errors = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!what.trim()) errs.what = "Give it a name.";
    if (parseMoney(amount) === null) {
      errs.amount = amount.trim()
        ? "Amounts look like 24 or 24.50."
        : "How much was it?";
    }
    if (!currentPayer()) errs.payer = "Add someone who can pay first.";
    if (participants().length === 0)
      errs.among = "Split it between at least one person.";
    return errs;
  };

  const toggle = (id: string) => {
    const picked = new Set(participants());
    if (picked.has(id)) picked.delete(id);
    else picked.add(id);
    among = people()
      .map((p) => p.id)
      .filter((x) => picked.has(x));
    update(el);
  };

  const add = () => {
    const errs = errors();
    if (Object.keys(errs).length > 0) {
      submitted = true;
      update(el);
      return;
    }
    const state = read();
    write({
      ...state,
      expenses: [
        {
          id: uid(),
          what: what.trim(),
          cents: parseMoney(amount)!,
          payer: currentPayer(),
          among: participants(),
        },
        ...state.expenses,
      ],
    });
    what = "";
    amount = "";
    among = null;
    submitted = false;
    update(el);
  };

  return () => {
    const state = read();
    const errs = errors();
    const show = (k: string) => (submitted ? errs[k] : undefined);

    const cents = parseMoney(amount);
    const picked = participants();
    const each =
      cents !== null && picked.length > 0
        ? shares(cents, picked.length, 0)
        : null;
    const perHead = each
      ? each[0] === each[each.length - 1]
        ? `${money(each[0] ?? 0)} each`
        : `${money(each[each.length - 1] ?? 0)}–${money(each[0] ?? 0)} each`
      : "";

    return html`
      <div class="card">
        <h3>Add an expense</h3>

        <div class="split-form">
          <div class="ui-field split-grow">
            <input
              class="ui-input"
              placeholder="What was it?"
              value=${what}
              oninput=${(e: InputEvent) => {
                what = (e.target as HTMLInputElement).value;
                if (submitted) update(el);
              }}
              onkeydown=${(e: KeyboardEvent) => {
                if (e.key === "Enter") add();
              }}
            />
            ${show("what") ? html`<span class="ui-error-text">${errs.what}</span>` : null}
          </div>

          <div class="ui-field split-amount">
            <input
              class="ui-input"
              inputmode="decimal"
              placeholder="0.00"
              value=${amount}
              oninput=${(e: InputEvent) => {
                amount = (e.target as HTMLInputElement).value;
                update(el);
              }}
              onkeydown=${(e: KeyboardEvent) => {
                if (e.key === "Enter") add();
              }}
            />
            ${show("amount") ? html`<span class="ui-error-text">${errs.amount}</span>` : null}
          </div>

          <div class="ui-field split-payer">
            <select
              class="ui-select"
              value=${currentPayer()}
              onchange=${(e: Event) => {
                payer = (e.target as HTMLSelectElement).value;
                update(el);
              }}
            >
              ${state.people.map(
                (p) => html`<option value=${p.id}>${p.name} paid</option>`,
              )}
            </select>
          </div>
        </div>

        <div class="split-among">
          <span class="split-among-label">between</span>
          ${state.people.map((p) => {
            const on = picked.includes(p.id);
            return html`
              <button
                class="split-chip ${on ? "is-on" : ""}"
                key=${p.id}
                aria-pressed=${on}
                onclick=${() => toggle(p.id)}
              >${p.name}</button>
            `;
          })}
          ${perHead ? html`<span class="split-each">${perHead}</span>` : null}
        </div>
        ${show("among") ? html`<p class="ui-error-text">${errs.among}</p>` : null}
        ${show("payer") ? html`<p class="ui-error-text">${errs.payer}</p>` : null}

        <div class="split-actions">
          <span class="hint">
            the draft is a plain closure variable — only <code>Add</code> touches the store
          </span>
          <button class="ui-btn ui-btn-primary" onclick=${add}>Add expense</button>
        </div>
      </div>
    `;
  };
});

// ── One expense ────────────────────────────────────────────────────

/**
 * A row re-renders only when its own `expense` object is replaced or one of
 * its string attributes changes. Adding or deleting a *different* expense
 * leaves this one untouched — which the render count in the corner proves.
 * The `remove` callback is a fresh closure every parent render and costs
 * nothing: a callback is read when it is called, not when the child renders.
 */
define("x-split-row", (el, props) => {
  const host = el as HTMLElement & { expense?: Expense; remove?: () => void };
  let renders = 0;

  return () => {
    const expense = host.expense;
    if (!expense) return html`<div class="split-row"></div>`;
    renders++;

    return html`
      <div class="split-row">
        <div class="split-row-main">
          <span class="split-what">${expense.what}</span>
          <span class="split-meta">
            ${props.payer ?? ""} paid · between ${props.among ?? ""} · ${props.each ?? ""}
          </span>
        </div>
        <span class="split-amount-cell">${money(expense.cents)}</span>
        <span class="split-renders" title="times this row has rendered">${renders}×</span>
        <button
          class="ui-btn ui-btn-ghost ui-btn-icon split-delete"
          aria-label=${`Delete ${expense.what}`}
          onclick=${() => host.remove?.()}
        >×</button>
      </div>
    `;
  };
});

// ── The receipts ───────────────────────────────────────────────────

define("x-split-list", (el) => {
  onReady(() => store.subscribe("splitState", () => update(el)));

  const remove = (id: string) => {
    const state = read();
    write({ ...state, expenses: state.expenses.filter((e) => e.id !== id) });
  };

  return () => {
    const state = read();

    return html`
      <div class="card">
        <h3>Expenses</h3>
        ${
          state.expenses.length === 0
            ? html`<div class="ui-empty"><p>Nothing yet. Add an expense above.</p></div>`
            : html`
            <div class="split-rows">
              ${state.expenses.map((e) => {
                const among = e.among.filter((id) =>
                  state.people.some((p) => p.id === id),
                );
                const parts = among.length
                  ? shares(e.cents, among.length, hash(e.id) % among.length)
                  : [];
                const lo = parts.length ? Math.min(...parts) : 0;
                const hi = parts.length ? Math.max(...parts) : 0;
                return html`
                  <x-split-row
                    key=${e.id}
                    expense=${e}
                    payer=${nameOf(state, e.payer)}
                    among=${among.map((id) => nameOf(state, id)).join(", ") || "nobody"}
                    each=${lo === hi ? `${money(lo)} each` : `${money(lo)}–${money(hi)} each`}
                    remove=${() => remove(e.id)}
                  ></x-split-row>
                `;
              })}
            </div>
            <p class="hint">
              the small number is how many times that row has rendered — adding
              or deleting another expense leaves the rest untouched
            </p>
          `
        }
      </div>
    `;
  };
});

// ── Settle up ──────────────────────────────────────────────────────

define("x-split-settle", (el) => {
  onReady(() => store.subscribe("splitState", () => update(el)));

  return () => {
    const state = read();
    const byId = tallies(state);
    const transfers = settle(state, byId);
    const total = state.expenses.reduce((n, e) => n + e.cents, 0);

    return html`
      <div class="card">
        <h3>Settle up</h3>

        <div class="split-ledger">
          <div class="split-ledger-head">
            <span>Person</span><span>Paid</span><span>Share</span><span>Net</span>
          </div>
          ${state.people.map((p) => {
            const t = byId[p.id] ?? { paid: 0, share: 0, net: 0 };
            return html`
              <div class="split-ledger-row" key=${p.id}>
                <span>${p.name}</span>
                <span>${money(t.paid)}</span>
                <span>${money(t.share)}</span>
                <span class="split-net ${t.net > 0 ? "is-up" : t.net < 0 ? "is-down" : ""}">
                  ${t.net === 0 ? "even" : money(t.net)}
                </span>
              </div>
            `;
          })}
        </div>

        ${
          transfers.length === 0
            ? html`<div class="ui-alert ui-alert-success split-done">Everyone is square.</div>`
            : html`
            <ul class="split-transfers">
              ${transfers.map(
                (t) => html`
                  <li key=${`${t.from}-${t.to}-${t.cents}`}>
                    <span class="split-from">${nameOf(state, t.from)}</span>
                    <span class="split-arrow">→</span>
                    <span class="split-to">${nameOf(state, t.to)}</span>
                    <span class="split-transfer-amount">${money(t.cents)}</span>
                  </li>
                `,
              )}
            </ul>
          `
        }

        <p class="hint">
          ${money(total)} across ${state.expenses.length}
          expense${state.expenses.length !== 1 ? "s" : ""} settles in
          ${transfers.length} payment${transfers.length !== 1 ? "s" : ""} —
          at most ${Math.max(state.people.length - 1, 0)} is possible.
        </p>
      </div>
    `;
  };
});

// ── Page ───────────────────────────────────────────────────────────

define("x-split-page", (el) => {
  onReady(() => store.subscribe("splitState", () => update(el)));

  return () => {
    const state = read();
    return html`
      <div class="split">
        <div class="split-toolbar">
          <span class="hint">
            ${state.people.length} people · ${state.expenses.length} expenses ·
            integer cents, kept in <code>localStorage</code>
          </span>
          <button class="ui-btn ui-btn-ghost" onclick=${() => write(seed())}>
            Reset trip
          </button>
        </div>

        <x-split-composer></x-split-composer>

        <div class="split-layout">
          <x-split-people></x-split-people>
          <x-split-settle></x-split-settle>
        </div>

        <x-split-list></x-split-list>
      </div>
    `;
  };
});
