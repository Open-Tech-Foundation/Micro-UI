// Runs test.html in a real browser and reports its result.
//
// The esdev DOM suite covers everything a test DOM can model, which is most
// of it — DOM identity, focus, selection ranges, scrollTop and media
// properties. What it cannot model is a browser actually painting, scrolling
// and playing, and those are exactly the guarantees test.html was written to
// check: that an <img> does not re-request, a <video> does not restart, a
// <canvas> keeps its pixels, focus and caret survive, scroll position holds.
//
// No new dependencies: esdev serves the files (`runtime:http`) and speaks CDP
// to a browser that is already on the machine (`runtime:system` spawns it,
// the `WebSocket` global drives it). Skips with a clear message when there is
// none, so `tsr check` still passes on a box without one.
import { exists, file } from "runtime:fs";
import { serve } from "runtime:http";
import { dirname, fromFileURL, join, normalize } from "runtime:path";
import { env, exit } from "runtime:process";
import { Command } from "runtime:system";

const here = dirname(fromFileURL(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..");
const PAGE = "test.html";

const envString = (key) => {
  const value = env[key];
  return typeof value === "string" && value !== "" ? value : undefined;
};

const BROWSERS = [
  envString("CHROME_BIN"),
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
].filter(Boolean);

async function findBrowser() {
  for (const bin of BROWSERS) {
    if (bin.includes("/")) {
      if (await exists(bin)) return bin;
      continue;
    }
    try {
      const result = await new Command(bin, {
        args: ["--version"],
        stdout: "null",
        stderr: "null",
      }).output();
      if (result.success) return bin;
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

async function startServer() {
  const server = serve({ hostname: "127.0.0.1", port: 0 }, async (request) => {
    const path = normalize(
      decodeURIComponent(new URL(request.url, "http://localhost").pathname),
    );
    if (path.includes("..")) return new Response("no", { status: 403 });

    const name = join(repoRoot, path === "/" ? `/${PAGE}` : path);
    if (!(await exists(name))) return new Response("not found", { status: 404 });

    const ext = name.slice(name.lastIndexOf("."));
    return new Response(await file(name).bytes(), {
      headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
    });
  });
  const { port } = await server.addr;
  return { server, port };
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
  if (!(await exists(dist))) {
    console.error("dist/index.js is missing — run `tsr build:js` first.");
    exit(1);
  }

  const browser = await findBrowser();
  if (!browser) {
    console.log(
      "browser tests SKIPPED: no chromium or chrome found.\n" +
        "  Install one, or set CHROME_BIN, to run test.html for real.",
    );
    return;
  }

  const { server, port: serverPort } = await startServer();
  const url = `http://127.0.0.1:${serverPort}/${PAGE}`;
  const port = 9333 + Math.floor(Math.random() * 500);
  // Outside the repo on purpose (Chrome creates the directory itself, so the
  // filesystem jail never comes into it). Chrome leaves broken symlinks in a
  // profile (SingletonLock and friends) that a file walker trips over — which
  // is how a project learns to ignore its own warnings.
  const profile = join(
    envString("TMPDIR") ?? envString("TEMP") ?? "/tmp",
    "micro-ui-browser-test-profile",
  );
  const proc = await new Command(browser, {
    args: [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-first-run",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      url,
    ],
    stdout: "null",
    stderr: "null",
  }).spawn();

  const cleanup = async () => {
    try {
      await proc.kill();
    } catch {}
    await server.stop();
  };

  let failed = false;
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
    failed = result.failed > 0;
  } finally {
    await cleanup();
  }
  if (failed) exit(1);
}

await main();
