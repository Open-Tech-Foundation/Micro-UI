# Micro-UI CSS Utils

A tiny, semantic, framework-free CSS utility and component layer for building **Micro-UI apps**.

Micro-UI Utils provides a predictable set of `ui-*` classes for layout, typography, forms, buttons, surfaces, feedback, navigation, and common application UI.

**No Tailwind. No Bootstrap. No build step required.**

The goal is simple:

> **Write semantic UI classes instead of utility-class soup.**

---

## Why?

Traditional utility-first CSS can become verbose when HTML is generated dynamically:

```html
<button class="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
  Save
</button>
```

Micro-UI Utils turns that into:

```html
<button class="ui-btn ui-btn-primary">
  Save
</button>

## Installation

```js
// Full bundle
import "@opentf/micro-ui/styles.css";

// Or split — pay only for what you use (tokens ~3k, base ~5k)
import "@opentf/micro-ui/styles/tokens.css";
import "@opentf/micro-ui/styles/base.css";
import "@opentf/micro-ui/styles/components.css";
```

All rules are in `@layer micro-ui.*` so your app CSS wins without `!important`:
```css
@layer micro-ui, app;
```
Dark mode is automatic via `@media (prefers-color-scheme: dark)` in tokens; use `data-theme="dark"` / `data-theme="light"` to pin the theme on any element (see [Dark Mode](#dark-mode)).

Package has `"sideEffects": ["*.css"]` — import CSS only where needed, JS still tree-shakes.

The semantic class becomes the public API.

The underlying implementation can evolve without changing the application markup.

---

## Features

* Semantic `ui-*` class names
* Vanilla CSS
* Zero JavaScript dependency
* Zero Tailwind dependency
* No framework dependency
* No build step required
* CSS custom properties for theming
* Built-in light/dark themes
* Responsive primitives
* Accessible focus states
* Reduced-motion support
* Drag-and-drop helpers
* Designed for AI-generated micro-apps
* Small and predictable API

---

## Installation

### CDN

The simplest way to use Micro-UI Utils is through a CDN:

```html
<link
  rel="stylesheet"
  href="https://unpkg.com/@opentf/micro-ui/dist/styles.min.css"
>
```

Then use the semantic classes:

```html
<button class="ui-btn ui-btn-primary">
  Hello
</button>
```

### Local

Download `styles.min.css` and include it directly:

```html
<link rel="stylesheet" href="./styles.min.css">
```

No package manager is required.

---

# Design Philosophy

Micro-UI Utils is built around four principles.

### 1. Semantic HTML classes

Prefer:

```html
<button class="ui-btn ui-btn-primary">
```

over:

```html
<button class="flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 ...">
```

### 2. Small vocabulary

The library intentionally avoids hundreds of component-specific classes.

Most applications should be possible with a small set of primitives.

### 3. CSS is the implementation

Applications depend on the `ui-*` API, not on how the CSS happens to be implemented.

The implementation can change without requiring application markup changes.

### 4. AI-friendly

The class vocabulary is deliberately predictable.

An AI can infer:

```text
ui-btn
ui-btn-primary
ui-btn-lg
```

without needing to generate or understand a long sequence of CSS utilities.

---

# Component Categories

## Layout

```text
ui-container
ui-container-sm
ui-container-md
ui-container-lg
ui-container-xl

ui-stack
ui-row
ui-grid
ui-grid-2
ui-grid-3
ui-grid-4

ui-wrap
ui-center
ui-start
ui-end
ui-between
ui-around
ui-grow
ui-shrink-0
```

Example:

```html
<div class="ui-stack ui-gap-4">

  <div class="ui-row ui-between">
    <h2 class="ui-title">Projects</h2>

    <button class="ui-btn ui-btn-primary">
      New Project
    </button>
  </div>

</div>
```

---

# Spacing

```text
ui-gap-1
ui-gap-2
ui-gap-3
ui-gap-4
ui-gap-5
ui-gap-6
ui-gap-8
ui-gap-10
ui-gap-12

ui-p-0
ui-p-2
ui-p-3
ui-p-4
ui-p-5
ui-p-6
ui-p-8

ui-px-4
ui-px-6

ui-py-2
ui-py-4
ui-py-6

ui-m-0
ui-mt-2
ui-mt-4
ui-mt-6
ui-mt-8
ui-mb-2
ui-mb-4
ui-mb-6
ui-mb-8
```

---

# Typography

```text
ui-title
ui-heading
ui-text
ui-muted
ui-label
ui-caption
ui-error-text
ui-link
```

Example:

```html
<h1 class="ui-title">
  Account Settings
</h1>

<p class="ui-muted">
  Manage your account preferences.
</p>
```

---

# Surfaces

```text
ui-surface
ui-card
ui-card-flat
ui-card-hover
ui-panel
ui-section
```

Example:

```html
<div class="ui-card ui-card-hover">
  <h2 class="ui-heading">Analytics</h2>

  <p class="ui-text">
    View your application statistics.
  </p>
</div>
```

---

# Buttons

Base:

```text
ui-btn
```

Variants:

```text
ui-btn-primary
ui-btn-secondary
ui-btn-ghost
ui-btn-danger
ui-btn-success
```

Sizes:

```text
ui-btn-sm
ui-btn-lg
```

Special:

```text
ui-btn-icon
ui-btn-group
```

States:

```text
is-disabled
is-loading
```

Example:

```html
<button class="ui-btn ui-btn-primary">
  Save
</button>

<button class="ui-btn ui-btn-secondary">
  Cancel
</button>

<button class="ui-btn ui-btn-danger">
  Delete
</button>
```

---

# Forms

Fields:

```text
ui-field
ui-label
ui-caption
ui-error-text
```

Controls:

```text
ui-input
ui-textarea
ui-select
ui-checkbox
ui-radio
ui-switch
```

Example:

```html
<div class="ui-field">

  <label class="ui-label">
    Email
  </label>

  <input
    class="ui-input"
    type="email"
    placeholder="you@example.com"
  >

  <span class="ui-caption">
    We'll never share your email.
  </span>

</div>
```

Invalid state:

```html
<input class="ui-input is-invalid">

<span class="ui-error-text">
  Please enter a valid email address.
</span>
```

---

# Badges

```text
ui-badge
ui-badge-primary
ui-badge-success
ui-badge-warning
ui-badge-danger
ui-badge-info
```

Example:

```html
<span class="ui-badge ui-badge-success">
  Active
</span>
```

---

# Alerts

```text
ui-alert
ui-alert-info
ui-alert-success
ui-alert-warning
ui-alert-danger
```

Example:

```html
<div class="ui-alert ui-alert-success">
  Your changes have been saved.
</div>
```

---

# Progress

```text
ui-progress
ui-progress-bar
ui-progress-success
ui-progress-danger
```

Example:

```html
<div class="ui-progress">
  <div
    class="ui-progress-bar"
    style="width: 65%"
  ></div>
</div>
```

---

# Loading

```text
ui-spinner
ui-spinner-sm
ui-spinner-lg
```

Example:

```html
<div class="ui-spinner"></div>
```

---

# Avatar

```text
ui-avatar
ui-avatar-sm
ui-avatar-lg
```

Example:

```html
<div class="ui-avatar">
  JD
</div>
```

Image:

```html
<div class="ui-avatar">
  <img src="avatar.jpg" alt="John Doe">
</div>
```

---

# Lists

```text
ui-list
ui-list-item
ui-list-item-hover
```

Example:

```html
<ul class="ui-list">

  <li class="ui-list-item ui-list-item-hover">
    Project One
  </li>

  <li class="ui-list-item ui-list-item-hover">
    Project Two
  </li>

</ul>
```

---

# Tables

```text
ui-table-wrap
ui-table
ui-table-hover
```

Example:

```html
<div class="ui-table-wrap">

  <table class="ui-table ui-table-hover">

    <thead>
      <tr>
        <th>Name</th>
        <th>Status</th>
      </tr>
    </thead>

    <tbody>
      <tr>
        <td>Project One</td>
        <td>
          <span class="ui-badge ui-badge-success">
            Active
          </span>
        </td>
      </tr>
    </tbody>

  </table>

</div>
```

---

# Navigation

Tabs:

```text
ui-tabs
ui-tab
```

Active state:

```text
is-active
```

Example:

```html
<div class="ui-tabs">

  <button class="ui-tab is-active">
    Overview
  </button>

  <button class="ui-tab">
    Settings
  </button>

</div>
```

Breadcrumbs:

```text
ui-breadcrumbs
ui-breadcrumb
ui-breadcrumb-separator
```

Pagination:

```text
ui-pagination
ui-page
```

---

# Menus

```text
ui-menu
ui-menu-item
ui-menu-divider
```

Example:

```html
<div class="ui-menu">

  <button class="ui-menu-item">
    Edit
  </button>

  <button class="ui-menu-item">
    Duplicate
  </button>

  <div class="ui-menu-divider"></div>

  <button class="ui-menu-item">
    Delete
  </button>

</div>
```

---

# Dialogs

```text
ui-modal
ui-dialog
ui-dialog-header
ui-dialog-body
ui-dialog-footer
```

Example:

```html
<div class="ui-modal">

  <div class="ui-dialog">

    <header class="ui-dialog-header">
      <h2 class="ui-heading">
        Delete project?
      </h2>
    </header>

    <div class="ui-dialog-body">
      <p class="ui-text">
        This action cannot be undone.
      </p>
    </div>

    <footer class="ui-dialog-footer">

      <button class="ui-btn ui-btn-ghost">
        Cancel
      </button>

      <button class="ui-btn ui-btn-danger">
        Delete
      </button>

    </footer>

  </div>

</div>
```

---

# Drawer

```text
ui-drawer
ui-drawer-left
ui-drawer-right
ui-drawer-header
ui-drawer-body
```

---

# Tooltip

```text
ui-tooltip
ui-tooltip-content
```

Example:

```html
<div class="ui-tooltip">

  <button class="ui-btn ui-btn-icon">
    ?
  </button>

  <div class="ui-tooltip-content">
    Help information
  </div>

</div>
```

---

# Popover

```text
ui-popover
```

---

# Empty State

```text
ui-empty
ui-empty-icon
```

Example:

```html
<div class="ui-empty">

  <div class="ui-empty-icon">
    +
  </div>

  <h2 class="ui-heading">
    No projects yet
  </h2>

  <p class="ui-muted">
    Create your first project to get started.
  </p>

  <button class="ui-btn ui-btn-primary ui-mt-4">
    Create Project
  </button>

</div>
```

---

# Skeleton

```text
ui-skeleton
```

Example:

```html
<div class="ui-skeleton" style="width: 200px; height: 20px"></div>
```

---

# Status

```text
ui-status
ui-status-success
ui-status-warning
ui-status-danger
ui-status-info
```

Example:

```html
<span class="ui-status ui-status-success">
  Online
</span>
```

---

# Drag & Drop

Micro-UI Utils includes simple CSS primitives for visual builders and drag-and-drop applications.

```text
ui-draggable
ui-dragging
ui-dropzone
```

Drag-over state:

```text
is-dragover
```

Example:

```html
<div class="ui-dropzone">
  Drop component here
</div>
```

When an item is being dragged:

```html
<div class="ui-draggable ui-dragging">
  Button
</div>
```

---

# Utility Classes

A small number of low-level utilities are included for cases where semantic components aren't enough.

### Display

```text
ui-hidden
ui-visible
ui-invisible
```

### Width / Height

```text
ui-w-full
ui-w-auto
ui-h-full
ui-min-h-screen
```

### Alignment

```text
ui-text-left
ui-text-center
ui-text-right
```

### Font weight

```text
ui-font-normal
ui-font-medium
ui-font-semibold
ui-font-bold
```

### Radius

```text
ui-rounded-none
ui-rounded-sm
ui-rounded
ui-rounded-lg
ui-rounded-xl
ui-rounded-full
```

### Shadow

```text
ui-shadow-none
ui-shadow-sm
ui-shadow-md
ui-shadow-lg
```

### Overflow

```text
ui-overflow-hidden
ui-overflow-auto
ui-overflow-x-auto
ui-overflow-y-auto
```

### Position

```text
ui-relative
ui-absolute
ui-fixed
ui-sticky
```

### Interaction

```text
ui-pointer
ui-not-allowed
ui-select-none
ui-select-text
```

---

# Theme

Micro-UI Utils uses CSS custom properties for theming.

All core colors, spacing, radius, typography, shadows, and motion values are exposed as variables.

For example:

```css
:root {
  --ui-primary: #6366f1;
  --ui-primary-hover: #4f46e5;
  --ui-surface: #ffffff;
  --ui-background: #f8fafc;
}
```

Override them in your application:

```css
:root {
  --ui-primary: #2563eb;
  --ui-primary-hover: #1d4ed8;
}
```

No source modification is required.

---

# Dark Mode

Dark mode is applied **automatically** via `@media (prefers-color-scheme: dark)` (all tokens, including status/soft colors, are re-scaled for dark surfaces).

You can also pin the theme explicitly. An explicit attribute always wins over the system preference:

```html
<body data-theme="dark">
```

Force light mode even when the OS prefers dark:

```html
<html data-theme="light">
```

Or on any application container — custom properties inherit, so this themes just that subtree:

```html
<div data-theme="dark">
  ...
</div>
```

This makes it possible to have multiple themes within the same page.

---

# Component States

Micro-UI uses predictable state classes.

```text
is-active
is-disabled
is-loading
is-invalid
is-dragover
is-dragging
```

Example:

```html
<button class="ui-btn ui-btn-primary is-loading">
  Saving...
</button>
```

```html
<input class="ui-input is-invalid">
```

---

# Semantic + Utility Composition

Semantic classes are the preferred API, but utilities can be combined when necessary.

Example:

```html
<div class="ui-card ui-p-8 ui-shadow-lg">
  ...
</div>
```

The rule is:

> **Use semantic classes first. Use utilities for small exceptions.**

---

# AI / Visual Builder Usage

Micro-UI Utils is designed to work particularly well with visual builders and AI-generated applications.

A component can be represented as:

```json
{
  "type": "button",
  "variant": "primary",
  "size": "md",
  "text": "Save"
}
```

and rendered as:

```html
<button class="ui-btn ui-btn-primary">
  Save
</button>
```

A card:

```json
{
  "type": "card",
  "children": [
    {
      "type": "title",
      "text": "Dashboard"
    },
    {
      "type": "text",
      "text": "Welcome back"
    }
  ]
}
```

becomes:

```html
<div class="ui-card">

  <h2 class="ui-title">
    Dashboard
  </h2>

  <p class="ui-text">
    Welcome back
  </p>

</div>
```

This keeps generated HTML compact, predictable, and easy to modify.

---

# Example Micro-App

```html
<!doctype html>

<html>
<head>

  <meta charset="utf-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <link
    rel="stylesheet"
    href="./styles.min.css"
  >

  <title>Micro App</title>

</head>

<body>

  <main class="ui-container ui-py-6">

    <div class="ui-stack ui-gap-6">

      <header class="ui-row ui-between">

        <div class="ui-stack ui-gap-1">

          <h1 class="ui-title">
            Dashboard
          </h1>

          <p class="ui-muted">
            Welcome back.
          </p>

        </div>

        <button class="ui-btn ui-btn-primary">
          Create
        </button>

      </header>


      <div class="ui-grid ui-grid-3 ui-gap-4">

        <div class="ui-card">

          <span class="ui-muted">
            Projects
          </span>

          <div class="ui-title ui-mt-2">
            24
          </div>

        </div>


        <div class="ui-card">

          <span class="ui-muted">
            Active
          </span>

          <div class="ui-title ui-mt-2">
            18
          </div>

        </div>


        <div class="ui-card">

          <span class="ui-muted">
            Completed
          </span>

          <div class="ui-title ui-mt-2">
            42
          </div>

        </div>

      </div>


      <div class="ui-card">

        <div class="ui-stack ui-gap-4">

          <h2 class="ui-heading">
            Create Project
          </h2>

          <div class="ui-field">

            <label class="ui-label">
              Project name
            </label>

            <input
              class="ui-input"
              placeholder="My project"
            >

          </div>

          <div class="ui-field">

            <label class="ui-label">
              Description
            </label>

            <textarea
              class="ui-textarea"
              placeholder="Describe your project..."
            ></textarea>

          </div>

          <div class="ui-row ui-end ui-gap-2">

            <button class="ui-btn ui-btn-ghost">
              Cancel
            </button>

            <button class="ui-btn ui-btn-primary">
              Create Project
            </button>

          </div>

        </div>

      </div>

    </div>

  </main>

</body>
</html>
```

---

# Browser Support

Micro-UI Utils uses modern CSS features such as:

* CSS custom properties
* Flexbox
* CSS Grid
* `aspect-ratio`
* `color-mix`-compatible design patterns where applicable
* Modern media queries
