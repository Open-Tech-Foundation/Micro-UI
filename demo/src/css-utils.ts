import { define, html, update } from "@opentf/micro-ui";

/**
 * CSS Utils Demo — showcases the Micro-UI CSS utility classes.
 */
define("x-css-demo", (el) => {
  let activeTab = "layout";
  let formData = { name: "", email: "", agree: false };
  let formSubmitted = false;

  const tabs = [
    { id: "layout", label: "Layout" },
    { id: "buttons", label: "Buttons" },
    { id: "forms", label: "Forms" },
    { id: "feedback", label: "Feedback" },
    { id: "components", label: "Components" },
  ];

  return () => html`
    <div class="ui-container ui-py-6">
      <div class="ui-stack ui-gap-6">

        <header class="ui-row ui-between">
          <div class="ui-stack ui-gap-1">
            <h1 class="ui-title">CSS Utils Demo</h1>
            <p class="ui-muted">Semantic utility classes for Micro-UI apps</p>
          </div>
        </header>

        <div class="ui-tabs">
          ${tabs.map(
            (tab) => html`
            <button
              class="ui-tab ${activeTab === tab.id ? "is-active" : ""}"
              onclick=${() => {
                activeTab = tab.id;
                update(el);
              }}
            >
              ${tab.label}
            </button>
          `
          )}
        </div>

        ${activeTab === "layout"
          ? html`
          <div class="ui-stack ui-gap-4">
            <h2 class="ui-heading">Layout</h2>

            <div class="ui-card">
              <h3 class="ui-heading">Containers</h3>
              <div class="ui-stack ui-gap-2">
                <div class="ui-container-sm ui-p-4" style="background:var(--ui-primary-soft);border:1px dashed var(--ui-primary)">
                  <code>ui-container-sm</code>
                </div>
                <div class="ui-container-md ui-p-4" style="background:var(--ui-success-soft);border:1px dashed var(--ui-success)">
                  <code>ui-container-md</code>
                </div>
                <div class="ui-container-lg ui-p-4" style="background:var(--ui-warning-soft);border:1px dashed var(--ui-warning)">
                  <code>ui-container-lg</code>
                </div>
              </div>
            </div>

            <div class="ui-card">
              <h3 class="ui-heading">Stack & Row</h3>
              <div class="ui-stack ui-gap-2">
                <div class="ui-stack ui-gap-2 ui-p-4" style="background:var(--ui-surface-muted)">
                  <div class="ui-badge ui-badge-info">Stack (vertical)</div>
                  <div class="ui-badge ui-badge-info">Gap between items</div>
                  <div class="ui-badge ui-badge-info">Auto layout</div>
                </div>
                <div class="ui-row ui-between ui-p-4" style="background:var(--ui-surface-muted)">
                  <span class="ui-badge ui-badge-primary">Left</span>
                  <span class="ui-badge ui-badge-primary">Center</span>
                  <span class="ui-badge ui-badge-primary">Right</span>
                </div>
              </div>
            </div>

            <div class="ui-card">
              <h3 class="ui-heading">Grid</h3>
              <div class="ui-grid ui-grid-3 ui-gap-4">
                <div class="ui-card ui-card-flat">
                  <span class="ui-muted">Grid Item 1</span>
                </div>
                <div class="ui-card ui-card-flat">
                  <span class="ui-muted">Grid Item 2</span>
                </div>
                <div class="ui-card ui-card-flat">
                  <span class="ui-muted">Grid Item 3</span>
                </div>
              </div>
            </div>
          </div>
        `
          : activeTab === "buttons"
            ? html`
          <div class="ui-stack ui-gap-4">
            <h2 class="ui-heading">Buttons</h2>

            <div class="ui-card">
              <h3 class="ui-heading">Variants</h3>
              <div class="ui-row ui-wrap ui-gap-2">
                <button class="ui-btn ui-btn-primary">Primary</button>
                <button class="ui-btn ui-btn-secondary">Secondary</button>
                <button class="ui-btn ui-btn-ghost">Ghost</button>
                <button class="ui-btn ui-btn-danger">Danger</button>
                <button class="ui-btn ui-btn-success">Success</button>
              </div>
            </div>

            <div class="ui-card">
              <h3 class="ui-heading">Sizes</h3>
              <div class="ui-row ui-wrap ui-gap-2 ui-center">
                <button class="ui-btn ui-btn-primary ui-btn-sm">Small</button>
                <button class="ui-btn ui-btn-primary">Default</button>
                <button class="ui-btn ui-btn-primary ui-btn-lg">Large</button>
              </div>
            </div>

            <div class="ui-card">
              <h3 class="ui-heading">States</h3>
              <div class="ui-row ui-wrap ui-gap-2">
                <button class="ui-btn ui-btn-primary is-loading">Loading...</button>
                <button class="ui-btn ui-btn-primary is-disabled">Disabled</button>
                <button class="ui-btn ui-btn-icon ui-btn-secondary">+</button>
              </div>
            </div>

            <div class="ui-card">
              <h3 class="ui-heading">Button Group</h3>
              <div class="ui-btn-group">
                <button class="ui-btn ui-btn-secondary">Left</button>
                <button class="ui-btn ui-btn-secondary">Center</button>
                <button class="ui-btn ui-btn-secondary">Right</button>
              </div>
            </div>
          </div>
        `
            : activeTab === "forms"
              ? html`
          <div class="ui-stack ui-gap-4">
            <h2 class="ui-heading">Forms</h2>

            <div class="ui-card">
              <h3 class="ui-heading">Input Fields</h3>
              <div class="ui-stack ui-gap-4" style="max-width:24rem">
                <div class="ui-field">
                  <label class="ui-label">Name</label>
                  <input
                    class="ui-input"
                    placeholder="Enter your name"
                    value=${formData.name}
                    oninput=${(e: InputEvent) => {
                      formData.name = (e.target as HTMLInputElement).value;
                    }}
                  >
                  <span class="ui-caption">Required field</span>
                </div>

                <div class="ui-field">
                  <label class="ui-label">Email</label>
                  <input
                    class="ui-input"
                    type="email"
                    placeholder="you@example.com"
                    value=${formData.email}
                    oninput=${(e: InputEvent) => {
                      formData.email = (e.target as HTMLInputElement).value;
                    }}
                  >
                </div>

                <div class="ui-field">
                  <label class="ui-label">Message</label>
                  <textarea
                    class="ui-textarea"
                    placeholder="Write something..."
                  ></textarea>
                </div>

                <div class="ui-field">
                  <label class="ui-label">Category</label>
                  <select class="ui-select">
                    <option>Option 1</option>
                    <option>Option 2</option>
                    <option>Option 3</option>
                  </select>
                </div>

                <label class="ui-checkbox">
                  <input
                    type="checkbox"
                    checked=${formData.agree}
                    onchange=${(e: Event) => {
                      formData.agree = (e.target as HTMLInputElement).checked;
                    }}
                  >
                  <span>I agree to the terms</span>
                </label>

                <div class="ui-row ui-end ui-gap-2">
                  <button class="ui-btn ui-btn-ghost" onclick=${() => {
                    formData = { name: "", email: "", agree: false };
                    formSubmitted = false;
                    update(el);
                  }}>Reset</button>
                  <button class="ui-btn ui-btn-primary" onclick=${() => {
                    formSubmitted = true;
                    update(el);
                  }}>Submit</button>
                </div>

                ${formSubmitted
                  ? html`
                  <div class="ui-alert ui-alert-success">
                    Form submitted successfully!
                  </div>
                `
                  : null
                }
              </div>
            </div>

            <div class="ui-card">
              <h3 class="ui-heading">Invalid State</h3>
              <div class="ui-stack ui-gap-2" style="max-width:24rem">
                <div class="ui-field">
                  <label class="ui-label">Email</label>
                  <input class="ui-input is-invalid" value="invalid-email">
                  <span class="ui-error-text">Please enter a valid email address.</span>
                </div>
              </div>
            </div>

            <div class="ui-card">
              <h3 class="ui-heading">Switch</h3>
              <div class="ui-stack ui-gap-2">
                <label class="ui-row ui-gap-2">
                  <div class="ui-switch">
                    <input type="checkbox">
                    <div class="ui-switch-track"></div>
                    <div class="ui-switch-thumb"></div>
                  </div>
                  <span>Enable notifications</span>
                </label>
              </div>
            </div>
          </div>
        `
              : activeTab === "feedback"
                ? html`
          <div class="ui-stack ui-gap-4">
            <h2 class="ui-heading">Feedback</h2>

            <div class="ui-card">
              <h3 class="ui-heading">Badges</h3>
              <div class="ui-row ui-wrap ui-gap-2">
                <span class="ui-badge">Default</span>
                <span class="ui-badge ui-badge-primary">Primary</span>
                <span class="ui-badge ui-badge-success">Success</span>
                <span class="ui-badge ui-badge-warning">Warning</span>
                <span class="ui-badge ui-badge-danger">Danger</span>
                <span class="ui-badge ui-badge-info">Info</span>
              </div>
            </div>

            <div class="ui-card">
              <h3 class="ui-heading">Alerts</h3>
              <div class="ui-stack ui-gap-2">
                <div class="ui-alert ui-alert-info">This is an info alert.</div>
                <div class="ui-alert ui-alert-success">Changes saved successfully!</div>
                <div class="ui-alert ui-alert-warning">Please review your input.</div>
                <div class="ui-alert ui-alert-danger">Something went wrong.</div>
              </div>
            </div>

            <div class="ui-card">
              <h3 class="ui-heading">Progress</h3>
              <div class="ui-stack ui-gap-4">
                <div class="ui-progress">
                  <div class="ui-progress-bar" style="width:65%"></div>
                </div>
                <div class="ui-progress ui-progress-success">
                  <div class="ui-progress-bar" style="width:80%"></div>
                </div>
                <div class="ui-progress ui-progress-danger">
                  <div class="ui-progress-bar" style="width:30%"></div>
                </div>
              </div>
            </div>

            <div class="ui-card">
              <h3 class="ui-heading">Spinner</h3>
              <div class="ui-row ui-wrap ui-gap-4 ui-center">
                <div class="ui-spinner-sm ui-spinner"></div>
                <div class="ui-spinner"></div>
                <div class="ui-spinner-lg ui-spinner"></div>
              </div>
            </div>

            <div class="ui-card">
              <h3 class="ui-heading">Status</h3>
              <div class="ui-stack ui-gap-2">
                <span class="ui-status ui-status-success">Online</span>
                <span class="ui-status ui-status-warning">Away</span>
                <span class="ui-status ui-status-danger">Offline</span>
                <span class="ui-status ui-status-info">Busy</span>
              </div>
            </div>
          </div>
        `
                : html`
          <div class="ui-stack ui-gap-4">
            <h2 class="ui-heading">Components</h2>

            <div class="ui-card">
              <h3 class="ui-heading">Avatar</h3>
              <div class="ui-row ui-wrap ui-gap-4 ui-center">
                <div class="ui-avatar ui-avatar-sm">S</div>
                <div class="ui-avatar">JD</div>
                <div class="ui-avatar ui-avatar-lg">L</div>
              </div>
            </div>

            <div class="ui-card">
              <h3 class="ui-heading">Table</h3>
              <div class="ui-table-wrap">
                <table class="ui-table ui-table-hover">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Alice</td>
                      <td><span class="ui-badge ui-badge-success">Active</span></td>
                      <td>Admin</td>
                    </tr>
                    <tr>
                      <td>Bob</td>
                      <td><span class="ui-badge ui-badge-warning">Pending</span></td>
                      <td>User</td>
                    </tr>
                    <tr>
                      <td>Charlie</td>
                      <td><span class="ui-badge ui-badge-danger">Inactive</span></td>
                      <td>User</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="ui-card">
              <h3 class="ui-heading">List</h3>
              <ul class="ui-list">
                <li class="ui-list-item ui-list-item-hover">Dashboard</li>
                <li class="ui-list-item ui-list-item-hover">Settings</li>
                <li class="ui-list-item ui-list-item-hover">Profile</li>
                <li class="ui-list-item ui-list-item-hover">Logout</li>
              </ul>
            </div>

            <div class="ui-card">
              <h3 class="ui-heading">Empty State</h3>
              <div class="ui-empty">
                <div class="ui-empty-icon">+</div>
                <h2 class="ui-heading">No projects yet</h2>
                <p class="ui-muted">Create your first project to get started.</p>
                <button class="ui-btn ui-btn-primary ui-mt-4">Create Project</button>
              </div>
            </div>

            <div class="ui-card">
              <h3 class="ui-heading">Skeleton</h3>
              <div class="ui-stack ui-gap-2">
                <div class="ui-skeleton" style="width:200px;height:20px"></div>
                <div class="ui-skeleton" style="width:160px;height:20px"></div>
                <div class="ui-skeleton" style="width:120px;height:20px"></div>
              </div>
            </div>

            <div class="ui-card">
              <h3 class="ui-heading">Divider</h3>
              <div class="ui-stack ui-gap-2">
                <span>Content above</span>
                <hr class="ui-divider">
                <span>Content below</span>
              </div>
            </div>

            <div class="ui-card">
              <h3 class="ui-heading">Code</h3>
              <p class="ui-text">
                Use <code class="ui-code">ui-code</code> for inline code.
              </p>
              <div class="ui-code-block ui-mt-2">
                const app = define("x-app", () => html\`<div>Hello</div>\`);
              </div>
            </div>
          </div>
        `
        }

      </div>
    </div>
  `;
});
