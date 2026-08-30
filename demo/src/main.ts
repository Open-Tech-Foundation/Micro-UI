import { mount } from "@opentf/micro-ui";
import "@opentf/micro-ui/styles.css";
import "./components.ts";
import "./shop.ts";
import "./form.ts";
import "./data.ts";
import "./gravity.ts";
import "./beats.ts";
import "./notes.ts";
import "./kanban.ts";
import "./split.ts";
import "./errors.ts";
import "./css-utils.ts";
import "./svg.ts";

const root = document.getElementById("app");
if (!root) throw new Error("no #app");

// The demo is a workbench, so it runs with diagnostics on: a component that
// throws shows its real message in the page, a class or style handed an array
// or object says so, and a component removed while a store subscription is
// still live is reported. An app would leave this off.
mount(root, "x-app", { dev: true });
