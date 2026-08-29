import test from "node:test";
import "./setup.mjs";
const s = await import("../../src/state.ts");
test("b: observe devMode", () => { console.log("B sees devMode =", s.devMode, s.devMode ? "<- LEAKED" : "<- isolated"); });
