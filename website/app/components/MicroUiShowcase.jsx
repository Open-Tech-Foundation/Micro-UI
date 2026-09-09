const DEMO_TAG = "x-micro-ui-playground";

async function registerMicroUiDemo() {
  if (customElements.get(DEMO_TAG)) return;

  const { define, html, update } = await import("@opentf/micro-ui");
  if (customElements.get(DEMO_TAG)) return;

  define(DEMO_TAG, (el) => {
    let filter = "all";
    let draft = "";
    let nextId = 4;
    let items = [
      { id: 1, label: "Ship a focused interaction", done: true },
      { id: 2, label: "Keep the bundle easy to understand", done: false },
      { id: 3, label: "Let the browser do the work", done: false },
    ];

    const visibleItems = () =>
      items.filter((item) => filter === "all" || (filter === "done" ? item.done : !item.done));

    const addItem = () => {
      const label = draft.trim();
      if (!label) return;
      items = [...items, { id: nextId++, label, done: false }];
      draft = "";
      update(el);
    };

    const toggleItem = (id) => {
      items = items.map((item) => (item.id === id ? { ...item, done: !item.done } : item));
      update(el);
    };

    const removeItem = (id) => {
      items = items.filter((item) => item.id !== id);
      update(el);
    };

    return () => {
      const visible = visibleItems();
      const completed = items.filter((item) => item.done).length;

      return html`
        <section class="micro-demo-card" aria-label="Interactive Micro-UI demo">
          <div class="micro-demo-topline">
            <div>
              <span class="micro-demo-kicker">A micro-app in action</span>
              <h3>Build queue</h3>
            </div>
            <span class="micro-demo-count">${completed}/${items.length} complete</span>
          </div>

          <form class="micro-demo-form" onsubmit=${(event) => { event.preventDefault(); addItem(); }}>
            <input
              aria-label="New build queue item"
              placeholder="Add a small task..."
              value=${draft}
              oninput=${(event) => { draft = event.currentTarget.value; }}
            />
            <button type="submit">Add item</button>
          </form>

          <div class="micro-demo-filters" role="group" aria-label="Filter build queue">
            ${["all", "active", "done"].map((name) => html`
              <button
                type="button"
                class=${filter === name ? "is-active" : ""}
                aria-pressed=${filter === name}
                onclick=${() => { filter = name; update(el); }}
              >
                ${name}
              </button>
            `)}
          </div>

          <ul class="micro-demo-list">
            ${visible.length
              ? visible.map((item) => html`
                  <li class=${item.done ? "is-done" : ""} key=${item.id}>
                    <button
                      class="micro-demo-check"
                      type="button"
                      aria-label=${item.done ? `Mark ${item.label} active` : `Complete ${item.label}`}
                      aria-pressed=${item.done}
                      onclick=${() => toggleItem(item.id)}
                    >
                      ${item.done ? "✓" : ""}
                    </button>
                    <span>${item.label}</span>
                    <button
                      class="micro-demo-remove"
                      type="button"
                      aria-label=${`Remove ${item.label}`}
                      onclick=${() => removeItem(item.id)}
                    >
                      ×
                    </button>
                  </li>
                `)
              : html`<li class="micro-demo-empty">Nothing in this view yet.</li>`}
          </ul>
        </section>
      `;
    };
  });
}

// SSG renders the host element without a browser global. The custom element is
// registered only in the client, where it upgrades the already-rendered host.
if (typeof window !== "undefined") void registerMicroUiDemo();

export default function MicroUiShowcase() {
  return <x-micro-ui-playground />;
}
