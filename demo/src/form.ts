import {
  define,
  html,
  onReady,
  store,
  subscribe,
  update,
} from "@opentf/micro-ui";

// ── init form store ────────────────────────────────────────────────

store("form", {
  name: "",
  email: "",
  address: { street: "", city: "", zip: "" },
  newsletter: false,
});

// ── form field component ───────────────────────────────────────────

define("x-field", (el, props) => {
  onReady(() => subscribe("form", () => update(el)));
  return () => html`
    <div class="field">
      <label>${props.label}</label>
      <input
        type=${props.type || "text"}
        placeholder=${props.placeholder || ""}
        value=${store<string>("form", undefined, { path: props.path! }) ?? ""}
        oninput=${(e: InputEvent) => {
          store("form", (e.target as HTMLInputElement).value, {
            path: props.path!,
          });
        }}
      />
    </div>
  `;
});

// ── form checkbox component ────────────────────────────────────────

define("x-checkbox", (el, props) => {
  onReady(() => subscribe("form", () => update(el)));
  return () => html`
    <div class="field field-checkbox">
      <label>
        <input
          type="checkbox"
          checked=${!!store<string>("form", undefined, { path: props.path! })}
          onchange=${(e: Event) => {
            store("form", (e.target as HTMLInputElement).checked, {
              path: props.path!,
            });
          }}
        />
        ${props.label}
      </label>
    </div>
  `;
});

// ── live preview ───────────────────────────────────────────────────

define("x-form-preview", (el) => {
  onReady(() => {
    return subscribe("form", () => update(el));
  });

  return () => {
    const data = store("form");
    // Use html.raw so the JSON renders as literal text — quotes, braces,
    // and colons show as themselves, not as &quot; / &amp; / etc.
    // The source is the app's own form state (trusted); user-typed
    // values become literal text inside the <pre> because innerHTML-
    // inserted content does not execute <script> tags.
    return html`
      <div class="card">
        <h3>Live Preview</h3>
        <pre class="form-json">${html.raw`${JSON.stringify(data, null, 2)}`}</pre>
      </div>
    `;
  };
});

// ── form page ──────────────────────────────────────────────────────

define("x-form-page", (el) => {
  onReady(() => console.log("x-form-page ready", el));

  const reset = () => {
    store("form", {
      name: "",
      email: "",
      address: { street: "", city: "", zip: "" },
      newsletter: false,
    });
  };

  const submit = () => {
    const data = store("form");
    alert("Submitted:\n" + JSON.stringify(data, null, 2));
  };

  return () => html`
    <div class="form-layout">
      <div class="card">
        <h3>User Info</h3>
        <x-field label="Name" path="name" placeholder="John Doe"></x-field>
        <x-field label="Email" path="email" type="email" placeholder="john@example.com"></x-field>

        <h3 style="margin-top:1rem">Address</h3>
        <x-field label="Street" path="address.street" placeholder="123 Main St"></x-field>
        <div class="form-row">
          <x-field label="City" path="address.city" placeholder="New York"></x-field>
          <x-field label="Zip" path="address.zip" placeholder="10001"></x-field>
        </div>

        <x-checkbox label="Subscribe to newsletter" path="newsletter"></x-checkbox>

        <div class="btn-row" style="margin-top:1rem">
          <button class="btn-reset" onclick=${reset}>Reset</button>
          <button class="btn-submit" onclick=${submit}>Submit</button>
        </div>
      </div>

      <x-form-preview></x-form-preview>
    </div>
  `;
});
