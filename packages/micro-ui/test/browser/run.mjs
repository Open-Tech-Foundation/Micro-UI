// Runs test.html in a real browser and reports its result.
//
// The jsdom suite covers everything jsdom can model, which is most of it —
// DOM identity, focus, selection ranges, scrollTop and media properties. What
// it cannot model is a browser actually painting, scrolling and playing, and
// those are exactly the guarantees test.html was written to check: that an
// <img> does not re-request, a <video> does not restart, a <canvas> keeps its
// pixels, focus and caret survive, scroll position holds.
//
// No new dependencies: bun serves the files and speaks CDP to a browser that
// is already on the machine. Skips with a clear message when there is none,
// so `tsr check` still passes on a box without one.
import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..");
const PAGE = "test.html";

const BROWSERS = [
  process.env.CHROME_BIN,
  "chromium",
  "chromium-browser",
  "google-chrome",
  "google-chrome-stable",
].filter(Boolean);

function findBrowser() {
  for (const bin of BROWSERS) {
    if (bin.includes("/")) {
      if (existsSync(bin)) return bin;
      continue;
    }
    try {
      execSync(`command -v ${bin}`, { stdio: "ignore" });
      return bin;
    } catch {}
  }
  return null;
}

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function serve() {
  return Bun.serve({
    port: 0,
    fetch(req) {
      const path = normalize(decodeURIComponent(new URL(req.url).pathname));
      if (path.includes("..")) return new Response("no", { status: 403 });
      const file = join(repoRoot, path === "/" ? `/${PAGE}` : path);
      if (!existsSync(file)) return new Response("not found", { status: 404 });
      const ext = file.slice(file.lastIndexOf("."));
      return new Response(readFileSync(file), {
        headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
      });
    },
  });
}

async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, bad) => {
    ws.onopen = ok;
    ws.onerror = () => bad(new Error("could not open a CDP connection"));
  });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    const slot = waiting.get(msg.id);
    if (!slot) return;
    waiting.delete(msg.id);
    msg.error ? slot.bad(new Error(msg.error.message)) : slot.ok(msg.result);
  };
  return {
    send: (method, params = {}) =>
      new Promise((ok, bad) => {
        const n = ++id;
        waiting.set(n, { ok, bad });
        ws.send(JSON.stringify({ id: n, method, params }));
      }),
    close: () => ws.close(),
  };
}

async function main() {
  const dist = join(repoRoot, "packages/micro-ui/dist/index.js");
  if (!existsSync(dist)) {
    console.error("dist/index.js is missing — run `tsr build:js` first.");
    process.exit(1);
  }

  const browser = findBrowser();
  if (!browser) {
    console.log(
      "browser tests SKIPPED: no chromium or chrome found.\n" +
        "  Install one, or set CHROME_BIN, to run test.html for real.",
    );
    return;
  }

  const server = serve();
  const url = `http://127.0.0.1:${server.port}/${PAGE}`;
  const port = 9333 + (process.pid % 500);
  const proc = spawn(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-first-run",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${port}`,
      // Outside the repo on purpose. Chrome leaves broken symlinks in a
      // profile (SingletonLock and friends), and Biome walks the tree and
      // warns about every one of them — two warnings on every `tsr lint`,
      // which is how a project learns to ignore its own warnings.
      "--user-data-dir=" + join(tmpdir(), "micro-ui-browser-test-profile"),
      url,
    ],
    { stdio: "ignore" },
  );

  const cleanup = () => {
    try {
      proc.kill();
    } catch {}
    server.stop(true);
  };

  try {
    // Wait for the debugging endpoint, then find the page target.
    let target = null;
    for (let i = 0; i < 100 && !target; i++) {
      await new Promise((r) => setTimeout(r, 100));
      try {
        const list = await (
          await fetch(`http://127.0.0.1:${port}/json/list`)
        ).json();
        target = list.find(
          (t) => t.type === "page" && t.webSocketDebuggerUrl && t.url.includes(PAGE),
        );
      } catch {}
    }
    if (!target) throw new Error("the browser never opened the test page");

    const conn = await cdp(target.webSocketDebuggerUrl);
    await conn.send("Runtime.enable");

    // The page appends #summary[data-done] when every test has finished.
    let result = null;
    for (let i = 0; i < 300 && !result; i++) {
      const r = await conn.send("Runtime.evaluate", {
        expression: `(() => {
          const s = document.getElementById("summary");
          if (!s || !s.getAttribute("data-done")) return null;
          const failed = [...document.querySelectorAll(".fail")]
            .map((n) => n.textContent.trim())
            .filter(Boolean);
          return JSON.stringify({
            passed: +s.getAttribute("data-passed"),
            failed: +s.getAttribute("data-failed"),
            messages: failed,
          });
        })()`,
        returnByValue: true,
      });
      if (r.result?.value) result = JSON.parse(r.result.value);
      else await new Promise((r2) => setTimeout(r2, 100));
    }
    conn.close();

    if (!result)
      throw new Error(
        "the page never finished — no #summary after 30s. Open test.html in a browser to see where it stopped.",
      );

    for (const m of result.messages) console.error(`  FAIL ${m}`);
    console.log(
      `browser (${browser}): ${result.passed} passed, ${result.failed} failed`,
    );
    if (result.failed > 0) process.exitCode = 1;
  } finally {
    cleanup();
  }
}

await main();
