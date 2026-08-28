import { define, html, onReady, store, update } from "@opentf/micro-ui";

// ── Types ──────────────────────────────────────────────────────────

type KTag = "feature" | "bug" | "chore" | "idea";

type KCard = { id: string; title: string; tag: KTag };

type KCol = { id: string; title: string; accent: string };

type KState = {
  cols: KCol[];
  byCol: Record<string, KCard[]>;
  draft: string;
  draftTag: KTag;
};

const TAG_COLOR: Record<KTag, string> = {
  feature: "#a78bfa",
  bug: "#f87171",
  chore: "#38bdf8",
  idea: "#4ade80",
};

const uid = () => Math.random().toString(36).slice(2, 8);

// ── Initial state ─────────────────────────────────────────────────

function seed(): KState {
  return {
    cols: [
      { id: "todo", title: "To Do", accent: "#38bdf8" },
      { id: "doing", title: "In Progress", accent: "#a78bfa" },
      { id: "done", title: "Done", accent: "#4ade80" },
    ],
    byCol: {
      todo: [
        { id: "k1", title: "Drag a card between columns", tag: "feature" },
        { id: "k2", title: "Body font readability sweep", tag: "chore" },
        { id: "k3", title: "Skeleton loader for lists", tag: "idea" },
      ],
      doing: [
        { id: "k4", title: "Keyed board reorders", tag: "feature" },
        { id: "k5", title: "Drop targets highlight", tag: "bug" },
      ],
      done: [
        { id: "k6", title: "Store-backed state", tag: "feature" },
        { id: "k7", title: "Focus survives re-renders", tag: "bug" },
      ],
    },
    draft: "",
    draftTag: "feature",
  };
}

function ensureStore() {
  if (!store.get<KState>("kanbanState")) store.set("kanbanState", seed());
}
ensureStore();

// ── Kanban board ───────────────────────────────────────────────────

define("x-kanban", (el) => {
  // Drag session state — kept in closure so high-frequency dragover
  // events only touch DOM classes, never re-render the board.
  const drag = { id: "", from: "" };
  let overCol = "";
  let insertIdx = 0;

  onReady(() => store.subscribe("kanbanState", () => update(el)));

  const cleanup = () => {
    drag.id = "";
    drag.from = "";
    overCol = "";
    insertIdx = 0;
    el.querySelectorAll(".is-dragging, .is-drop-target").forEach((n) => {
      n.classList.remove("is-dragging", "is-drop-target");
    });
  };

  const addCard = () => {
    const s = store.get<KState>("kanbanState")!;
    const title = s.draft.trim();
    if (!title) return;
    store.set("kanbanState", {
      ...s,
      byCol: {
        ...s.byCol,
        [s.cols[0]!.id]: [
          { id: uid(), title, tag: s.draftTag },
          ...(s.byCol[s.cols[0]!.id] ?? []),
        ],
      },
      draft: "",
    });
  };

  const deleteCard = (id: string) => {
    const s = store.get<KState>("kanbanState")!;
    store.set("kanbanState", {
      ...s,
      byCol: Object.fromEntries(
        s.cols.map((c) => [
          c.id,
          (s.byCol[c.id] ?? []).filter((k) => k.id !== id),
        ]),
      ),
    });
  };

  const reset = () => store.set("kanbanState", seed());

  // Drop position relative to the target column, from the cursor's Y.
  const dropIndex = (e: DragEvent) => {
    const els = Array.from(
      el.querySelectorAll(`[data-col="${overCol}"] [data-card]`),
    ).filter(
      (n) => (n as HTMLElement).dataset.card !== drag.id,
    ) as HTMLElement[];
    for (let i = 0; i < els.length; i++) {
      const r = els[i]!.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) return i;
    }
    return els.length;
  };

  const highlight = (id: string) => {
    el.querySelectorAll(".is-drop-target").forEach((n) => {
      n.classList.remove("is-drop-target");
    });
    el.querySelector(`[data-col="${id}"]`)?.classList.add("is-drop-target");
  };

  return () => {
    const s = store.get<KState>("kanbanState") ?? seed();
    const total = s.cols.reduce((n, c) => n + (s.byCol[c.id]?.length ?? 0), 0);

    return html`
      <div class="kanban">
        <div class="card kanban-composer">
          <h3>Add a card</h3>
          <div class="notes-row">
            <input
              class="ui-input"
              placeholder="What's next on the board?"
              value=${s.draft}
              oninput=${(e: InputEvent) =>
                store.set("kanbanState", (e.target as HTMLInputElement).value, {
                  path: "draft",
                })}
              onkeydown=${(e: KeyboardEvent) => {
                if (e.key === "Enter") addCard();
              }}
            />
            <select
              class="ui-select"
              value=${s.draftTag}
              onchange=${(e: Event) =>
                store.set(
                  "kanbanState",
                  (e.target as HTMLSelectElement).value as KTag,
                  { path: "draftTag" },
                )}
            >
              ${(Object.keys(TAG_COLOR) as KTag[]).map(
                (t) => html`<option value=${t}>${t}</option>`,
              )}
            </select>
            <button class="ui-btn ui-btn-primary" onclick=${addCard}>Add</button>
          </div>
        </div>

        <div class="kanban-toolbar">
          <span class="hint">
            ${total} card${total !== 1 ? "s" : ""} · drag to move or reorder ·
            keyed lists + <code>store</code>
          </span>
          <button class="ui-btn ui-btn-ghost" onclick=${reset}>Reset board</button>
        </div>

        <div class="kanban-cols">
          ${s.cols.map(
            (col) => html`
            <section
              key=${col.id}
              class="kanban-col"
              data-col=${col.id}
              style="--accent:${col.accent}"
              ondragover=${(e: DragEvent) => {
                if (!drag.id) return;
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                overCol = col.id;
                insertIdx = dropIndex(e);
                highlight(col.id);
              }}
              ondragleave=${() =>
                el
                  .querySelector(`[data-col="${col.id}"]`)
                  ?.classList.remove("is-drop-target")}
              ondrop=${(e: DragEvent) => {
                e.preventDefault();
                if (!drag.id) return;
                overCol = col.id;
                insertIdx = dropIndex(e);
                const s2 = store.get<KState>("kanbanState")!;
                const byCol = { ...s2.byCol };
                const fromArr = [...(byCol[drag.from] ?? [])];
                const idx = fromArr.findIndex((c) => c.id === drag.id);
                const card = fromArr[idx];
                if (card) {
                  if (drag.from === col.id) {
                    fromArr.splice(idx, 1);
                    fromArr.splice(insertIdx, 0, card!);
                    byCol[col.id] = fromArr;
                  } else {
                    byCol[drag.from] = fromArr.filter((c) => c.id !== drag.id);
                    const target = [...(byCol[col.id] ?? [])];
                    target.splice(insertIdx, 0, card!);
                    byCol[col.id] = target;
                  }
                  store.set("kanbanState", { ...s2, byCol });
                }
                cleanup();
              }}
            >
              <div class="kanban-col-head">
                <span class="kanban-col-title">${col.title}</span>
                <span class="kanban-col-count">${s.byCol[col.id]?.length ?? 0}</span>
              </div>
              ${
                (s.byCol[col.id] ?? []).length === 0
                  ? html`<div class="kanban-empty">Drop cards here</div>`
                  : (s.byCol[col.id] ?? []).map(
                      (card) => html`
                    <article
                      key=${card.id}
                      class="kanban-card${drag.id === card.id ? " is-dragging" : ""}"
                      draggable="true"
                      data-card=${card.id}
                      data-col=${col.id}
                      ondragstart=${(e: DragEvent) => {
                        const target = e.target as HTMLElement;
                        if (target.closest("button")) {
                          e.preventDefault();
                          return;
                        }
                        const c = e.currentTarget as HTMLElement;
                        drag.id = c.dataset.card!;
                        drag.from = c.dataset.col!;
                        if (e.dataTransfer) {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", c.dataset.card!);
                        }
                        requestAnimationFrame(() =>
                          el
                            .querySelector(`[data-card="${drag.id}"]`)
                            ?.classList.add("is-dragging"),
                        );
                      }}
                      ondragend=${cleanup}
                    >
                      <div class="kanban-card-head">
                        <span class="kanban-pill" style="--accent:${TAG_COLOR[card.tag]}">${card.tag}</span>
                        <button
                          class="ui-btn ui-btn-ghost ui-btn-icon"
                          onclick=${() => deleteCard(card.id)}
                          title="Delete card"
                        >×</button>
                      </div>
                      <div class="kanban-card-title">${card.title}</div>
                    </article>
                  `,
                    )
              }
            </section>
          `,
          )}
        </div>
      </div>
    `;
  };
});
