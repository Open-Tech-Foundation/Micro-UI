// The README hands people import specifiers. Every one of them has to resolve
// through package.json's exports map to a file the build actually produces —
// the split style partials were documented for a release without being
// exported or built, so all three threw ERR_PACKAGE_PATH_NOT_EXPORTED.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, "..", "..");
const repoRoot = join(pkgDir, "..", "..");
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
const tasks = readFileSync(join(repoRoot, "tasks.toml"), "utf8");

const NAME = pkg.name;

/** Resolve a bare specifier through the exports map, wildcards included. */
function resolveExport(specifier) {
  const sub = specifier === NAME ? "." : `.${specifier.slice(NAME.length)}`;
  const exp = pkg.exports;
  const direct = exp[sub];
  if (direct) return typeof direct === "string" ? direct : direct.import;
  for (const [pattern, target] of Object.entries(exp)) {
    if (!pattern.includes("*")) continue;
    const [head, tail] = pattern.split("*");
    if (sub.startsWith(head) && sub.endsWith(tail)) {
      const star = sub.slice(head.length, sub.length - tail.length);
      const t = typeof target === "string" ? target : target.import;
      return t.replace("*", star);
    }
  }
  return null;
}

// Bare specifiers only — the CDN URLs in the README are a separate contract.
const documented = [
  ...new Set(
    [...readme.matchAll(/["'](@opentf\/micro-ui(?:\/[\w./-]+)?)["']/g)].map(
      (m) => m[1],
    ),
  ),
];

test("exports: the README documents at least the entry point and the styles", () => {
  assert.ok(documented.length >= 2, `found only: ${documented.join(", ")}`);
  assert.ok(documented.includes(NAME));
});

test("exports: every specifier in the README resolves through the exports map", () => {
  const broken = documented.filter((s) => resolveExport(s) === null);
  assert.deepEqual(
    broken,
    [],
    `not exported (consumers get ERR_PACKAGE_PATH_NOT_EXPORTED): ${broken.join(", ")}`,
  );
});

test("exports: every resolved target is something the build produces", () => {
  for (const spec of documented) {
    const target = resolveExport(spec);
    assert.ok(target.startsWith("./dist/"), `${spec} -> ${target}`);
    // dist/ is git-ignored, so assert the build declares the output rather
    // than requiring a build to have run first.
    const out = target.slice(2);
    assert.ok(
      tasks.includes(out) || existsSync(join(pkgDir, out)),
      `${spec} -> ${target} is neither built by any task in tasks.toml nor present`,
    );
  }
});

test("exports: each style partial has a source file behind it", () => {
  for (const part of ["tokens", "base", "components"]) {
    const target = resolveExport(`${NAME}/styles/${part}.css`);
    assert.equal(target, `./dist/styles/${part}.css`);
    assert.ok(
      existsSync(join(pkgDir, "src", "styles", `${part}.css`)),
      `src/styles/${part}.css is missing`,
    );
  }
});

test("exports: the published file list carries dist/", () => {
  assert.ok(pkg.files.includes("dist"));
});
