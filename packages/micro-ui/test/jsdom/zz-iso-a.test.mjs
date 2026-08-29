import test from "node:test";
import "./setup.mjs";
const m = await import("../../src/index.ts");
test("a: set devMode true", () => { m.mount(document.createElement("div"), "x-p", { dev: true }); console.log("A set devMode=true"); });
