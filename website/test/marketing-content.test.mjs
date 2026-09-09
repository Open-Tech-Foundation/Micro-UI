import { test, expect } from "bun:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the marketing homepage presents Micro-UI and the live app", async () => {
  const page = await read("app/page.jsx");
  const showcase = await read("app/components/MicroUiShowcase.jsx");

  expect(page).toContain("MicroUiShowcase");
  expect(page).toContain("Build small apps that feel");
  expect(showcase).toContain("@opentf/micro-ui");
  expect(showcase).toContain("x-micro-ui-playground");
  expect(showcase).toContain("key=${item.id}");
});

test("the standalone website uses the OTF Web toolchain", async () => {
  const pkg = JSON.parse(await read("package.json"));
  expect(pkg.dependencies["@opentf/web"]).toBe("latest");
  expect(pkg.devDependencies["@opentf/web-cli"]).toBe("latest");
  expect(pkg.dependencies["@opentf/micro-ui"]).toBe("file:../packages/micro-ui");
  expect(pkg.scripts["build:ssg"]).toBe("otfw build --ssg");
});

test("the public shell declares its favicon", async () => {
  const index = await read("index.html");
  const favicon = await read("public/favicon.svg");

  expect(index).toContain('href="/favicon.svg"');
  expect(favicon).toContain("#ff6b35");
});
