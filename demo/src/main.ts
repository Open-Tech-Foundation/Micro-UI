import { mount } from "@opentf/micro-ui";
import "./components.ts";
import "./shop.ts";
import "./form.ts";
import "./data.ts";

const root = document.getElementById("app");
if (!root) throw new Error("no #app");

mount(root, "x-app");
