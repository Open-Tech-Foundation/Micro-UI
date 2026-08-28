import { mount } from "@opentf/micro-ui";
import "@opentf/micro-ui/dist/styles.css";
import "./components.ts";
import "./shop.ts";
import "./form.ts";
import "./data.ts";
import "./gravity.ts";
import "./beats.ts";
import "./notes.ts";
import "./errors.ts";
import "./css-utils.ts";

const root = document.getElementById("app");
if (!root) throw new Error("no #app");

mount(root, "x-app");
