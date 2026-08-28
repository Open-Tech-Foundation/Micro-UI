import { define, html, onReady, store, update } from "@opentf/micro-ui";

// ── Types ──────────────────────────────────────────────────────────

type Note = {
  id: string;
  title: string;
  body: string;
  tag: "work" | "personal" | "idea" | "todo";
  pinned: boolean;
  created: number;
};

type NotesState = {
  items: Note[];
  filter: string;
  tagFilter: string;
  draft: { title: string; body: string; tag: Note["tag"] };
};

// ── Initial state ─────────────────────────────────────────────────

const SAMPLE: Note[] = [
  {
    id: "n1",
    title: "Ship v0.2",
    body: "Migrate demo to store.get/set/del namespace. Test empty-path fix.",
    tag: "work",
    pinned: true,
    created: Date.now() - 1000 * 60 * 60 * 3,
  },
  {
    id: "n2",
    title: "Buy milk",
    body: "Oat milk, 2%. Also check oat pricing.",
    tag: "personal",
    pinned: false,
    created: Date.now() - 1000 * 60 * 60 * 2,
  },
  {
    id: "n3",
    title: "App idea: pixel painter",
    body: "16x16 canvas, keyed cells, store.subscribe for undo. Could be next micro-app!",
    tag: "idea",
    pinned: false,
    created: Date.now() - 1000 * 60 * 30,
  },
];

function ensureState() {
  const cur = store.get<NotesState>("notesState");
  if (!cur) {
    store.set("notesState", {
      items: SAMPLE,
      filter: "",
      tagFilter: "all",
      draft: { title: "", body: "", tag: "work" },
    });
  }
}
ensureState();

// ── Helpers using new store.get / store.set / store.del / store.subscribe ──

function addNote() {
  const draft = store.get<NotesState["draft"]>("notesState", {
    path: "draft",
  })!;
  const title = draft.title.trim();
  const body = draft.body.trim();
  if (!title && !body) return;
  const items = store.get<Note[]>("notesState", { path: "items" }) ?? [];
  const note: Note = {
    id: Math.random().toString(36).slice(2, 8),
    title: title || "Untitled",
    body,
    tag: draft.tag,
    pinned: false,
    created: Date.now(),
  };
  store.set("notesState", [note, ...items], { path: "items" });
  // clear draft via store.set with path (demonstrates new API)
  store.set("notesState", "", { path: "draft.title" });
  store.set("notesState", "", { path: "draft.body" });
  // alternative del usage: store.del("notesState", {path: "draft.title"}) would delete key entirely — we set to "" to keep controlled input
}

function deleteNote(id: string) {
  const items = store.get<Note[]>("notesState", { path: "items" }) ?? [];
  store.set(
    "notesState",
    items.filter((n) => n.id !== id),
    { path: "items" },
  );
}

function togglePin(id: string) {
  const items = store.get<Note[]>("notesState", { path: "items" }) ?? [];
  store.set(
    "notesState",
    items.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)),
    { path: "items" },
  );
}

function clearAll() {
  // showcases store.del with path vs full del
  // full delete would be store.del("notesState") -> undefined; we instead reset items via del path
  store.set("notesState", [], { path: "items" });
  store.set("notesState", "", { path: "filter" });
  store.set("notesState", "all", { path: "tagFilter" });
}

// ── Notes page ─────────────────────────────────────────────────────

define("x-notes-page", (el) => {
  onReady(() => {
    // new namespaced subscribe
    const unsub = store.subscribe("notesState", () => update(el));
    return unsub;
  });

  return () => {
    const state = store.get<NotesState>("notesState");
    if (!state) return html`<div class="card">Loading…</div>`;
    const { items, filter, tagFilter, draft } = state;

    const filtered = items
      .filter((n) => {
        const q = filter.toLowerCase();
        const matchesText =
          !q ||
          n.title.toLowerCase().includes(q) ||
          n.body.toLowerCase().includes(q);
        const matchesTag = tagFilter === "all" || n.tag === tagFilter;
        return matchesText && matchesTag;
      })
      .sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || b.created - a.created,
      );

    const pinnedCount = items.filter((n) => n.pinned).length;

    return html`
      <div class="notes-layout">
        <div class="card notes-composer">
          <h3>New Note — store.get / store.set demo</h3>
          <p class="hint" style="text-align:left;margin-bottom:.75rem">
            Uses <code>store.get</code>, <code>store.set</code>, <code>store.del</code>, <code>store.subscribe</code> with <code>{path:"draft.title"}</code>.
            Body is escaped by default — try <code>&lt;script&gt;</code>.
          </p>
          <input
            placeholder="Title"
            value=${draft.title}
            oninput=${(e: InputEvent) => store.set("notesState", (e.target as HTMLInputElement).value, { path: "draft.title" })}
          />
          <textarea
            placeholder="Body — plain text, safe-escaped"
            rows="3"
            value=${draft.body}
            oninput=${(e: InputEvent) => store.set("notesState", (e.target as HTMLInputElement).value, { path: "draft.body" })}
          ></textarea>
          <div class="notes-row">
            <select
              value=${draft.tag}
              onchange=${(e: Event) => store.set("notesState", (e.target as HTMLSelectElement).value as Note["tag"], { path: "draft.tag" })}
            >
              <option value="work">work</option>
              <option value="personal">personal</option>
              <option value="idea">idea</option>
              <option value="todo">todo</option>
            </select>
            <button onclick=${addNote} class="btn-add">Add note</button>
          </div>
        </div>

        <div class="card notes-controls">
          <div class="notes-row">
            <input
              placeholder="Search title or body…"
              value=${filter}
              oninput=${(e: InputEvent) => store.set("notesState", (e.target as HTMLInputElement).value, { path: "filter" })}
            />
            <button
              class="btn-clear"
              onclick=${() => store.set("notesState", "", { path: "filter" })}
              title="Clear filter via store.set path"
            >✕</button>
          </div>
          <div class="notes-tags">
            ${["all", "work", "personal", "idea", "todo"].map(
              (t) => html`<button
                key=${t}
                class="tag-pill ${tagFilter === t ? "active" : ""}"
                onclick=${() => store.set("notesState", t, { path: "tagFilter" })}
              >${t}</button>`,
            )}
          </div>
          <div class="notes-meta">
            <span>${filtered.length} / ${items.length} notes${pinnedCount ? ` · ${pinnedCount} pinned` : ""}</span>
            <button class="btn-clear" onclick=${clearAll}>Clear all</button>
          </div>
        </div>

        ${
          filtered.length === 0
            ? html`<div class="card"><p class="hint">No notes match filter.</p></div>`
            : html`<div class="notes-grid">
              ${filtered.map(
                (
                  n,
                ) => html`<div key=${n.id} class="card note-card ${n.pinned ? "pinned" : ""}">
                  <div class="note-head">
                    <span class="tag-pill tag-${n.tag}">${n.tag}</span>
                    <span class="note-date">${new Date(n.created).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div class="note-title">${n.title}</div>
                  <div class="note-body">${n.body}</div>
                  <div class="note-actions">
                    <button class="btn-pin ${n.pinned ? "active" : ""}" onclick=${() => togglePin(n.id)} title="Pin">
                      ${n.pinned ? "★ Pinned" : "☆ Pin"}
                    </button>
                    <button class="btn-del" onclick=${() => deleteNote(n.id)}>Delete</button>
                  </div>
                </div>`,
              )}
            </div>`
        }
      </div>
    `;
  };
});
