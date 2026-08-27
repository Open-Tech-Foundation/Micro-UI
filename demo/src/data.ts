import { define, html, onReady, store, update } from "@opentf/micro-ui";

// ── init store ─────────────────────────────────────────────────────

store.set("posts", { items: [], loading: true, error: null });
store.set("postsFilter", "");

// ── data page ──────────────────────────────────────────────────────

define("x-data-page", (el) => {
  onReady(() => {
    console.log("x-data-page ready", el);

    fetch("https://jsonplaceholder.typicode.com/posts")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        store.set("posts", { items: data, loading: false, error: null });
      })
      .catch((err) => {
        store.set("posts", { items: [], loading: false, error: err.message });
      });

    return () => store.set("posts", { items: [], loading: false, error: null });
  });

  onReady(() => {
    const u1 = store.subscribe("posts", () => update(el));
    const u2 = store.subscribe("postsFilter", () => update(el));
    return () => {
      u1();
      u2();
    };
  });

  return () => {
    const { items, loading, error } = store.get("posts") as any;

    return html`
      <div class="card">
        <h3>Posts from JSONPlaceholder</h3>
        <p class="hint">GET https://jsonplaceholder.typicode.com/posts</p>

        ${
          loading
            ? html`<div class="loading">Loading...</div>`
            : error
              ? html`<div class="error">Error: ${error}</div>`
              : html`
              <div class="data-controls">
                <input
                  type="text"
                  placeholder="Search posts..."
                  value=${(store.get("postsFilter") as string) || ""}
                  oninput=${(e: InputEvent) => {
                    store.set(
                      "postsFilter",
                      (e.target as HTMLInputElement).value,
                    );
                    update(el);
                  }}
                />
                <span class="data-count">${items.length} posts</span>
              </div>
              <ul class="data-list">
                ${items
                  .filter((p: any) => {
                    const q = (store.get("postsFilter") as string) || "";
                    return (
                      !q || p.title.toLowerCase().includes(q.toLowerCase())
                    );
                  })
                  .map(
                    (
                      post: any,
                    ) => html`<li key=${post.id} class="data-item" onclick=${() => {
                      store.set(
                        "selectedPost",
                        (store.get("selectedPost") as any)?.id === post.id
                          ? null
                          : post,
                      );
                      update(el);
                    }}>
                      <div class="data-item-header">
                        <span class="data-item-id">#${post.id}</span>
                        <span class="data-item-title">${post.title}</span>
                      </div>
                      ${
                        (store.get("selectedPost") as any)?.id === post.id
                          ? html`<p class="data-item-body">${post.body}</p>`
                          : null
                      }
                    </li>
                  `,
                  )}
              </ul>
            `
        }
      </div>
    `;
  };
});
