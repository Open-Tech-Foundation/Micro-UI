import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = join(repoRoot, "dist");
const browserCandidates = [
  process.env.CHROME_BIN,
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
].filter(Boolean);

function findBrowser() {
  for (const candidate of browserCandidates) {
    if (candidate.includes("/")) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    try {
      execFileSync("which", [candidate], { stdio: "ignore" });
      return candidate;
    } catch {}
  }
  return null;
}

function serve() {
  const mime = {
    ".css": "text/css",
    ".html": "text/html",
    ".js": "text/javascript",
    ".json": "application/json",
    ".svg": "image/svg+xml",
  };
  const server = createServer((request, response) => {
    const requestPath = normalize(
      decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname),
    );
    if (requestPath.split("/").includes("..")) {
      response.writeHead(403);
      response.end("forbidden");
      return;
    }

    const relativePath = requestPath === "/" || requestPath.endsWith("/")
      ? `${requestPath}index.html`
      : requestPath;
    const file = join(distRoot, relativePath);
    if (!existsSync(file)) {
      response.writeHead(404);
      response.end("not found");
      return;
    }

    let contents = readFileSync(file);
    if (extname(file) === ".html") {
      const html = contents.toString();
      const stylesheetLink = html.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/);
      if (stylesheetLink) {
        const stylesheetHref = stylesheetLink[1];
        const stylesheet = readFileSync(join(distRoot, stylesheetHref));
        // Keep this layout test independent of the test server's stylesheet MIME handling.
        contents = Buffer.from(
          html.replace(stylesheetLink[0], `<style>${stylesheet}</style>`),
        );
      }
    }
    response.statusCode = 200;
    response.setHeader("Content-Length", contents.byteLength);
    response.setHeader("Content-Type", mime[extname(file)] ?? "application/octet-stream");
    response.end(contents);
  });

  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("error", onError);
      reject(error);
    };
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve({ server, port: server.address().port });
    });
  });
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("could not connect to Chrome DevTools"));
  });

  let id = 0;
  const waiting = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const pending = waiting.get(message.id);
    if (!pending) return;
    waiting.delete(message.id);
    message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
  };

  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const messageId = ++id;
        waiting.set(messageId, { resolve, reject });
        ws.send(JSON.stringify({ id: messageId, method, params }));
      });
    },
    close() {
      ws.close();
    },
  };
}

const browser = findBrowser();
const skipReason = !browser
  ? "browser E2E test requires Google Chrome or Chromium"
  : !existsSync(join(distRoot, "docs/api/mount/index.html"))
    ? "run `pnpm run build` before the docs browser test"
    : false;

test("docs sidebar remains pinned while the page scrolls", { skip: skipReason }, async () => {
  const { server, port: serverPort } = await serve();
  const profile = mkdtempSync(join(tmpdir(), "micro-ui-docs-e2e-"));
  const debugPort = 9400 + (process.pid % 500);
  const chrome = spawn(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-first-run",
      "--disable-dev-shm-usage",
      "--window-size=1280,900",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      `http://127.0.0.1:${serverPort}/docs/api/mount/`,
    ],
    { stdio: "ignore" },
  );

  let connection;
  try {
    let target;
    for (let attempt = 0; attempt < 100 && !target; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      try {
        const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
        target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      } catch {}
    }
    assert.ok(target, "Chrome did not expose the docs page");

    connection = await connect(target.webSocketDebuggerUrl);
    await connection.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    let layout;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const result = await connection.send("Runtime.evaluate", {
        expression: `(async () => {
          const sidebar = document.querySelector(".otfw-sidebar");
          const shell = document.querySelector(".site-shell");
          if (!sidebar || !shell) return { ready: false, url: location.href };
          const before = sidebar.getBoundingClientRect().top;
          window.scrollTo({ top: 400, behavior: "instant" });
          const after = sidebar.getBoundingClientRect().top;
          return {
            ready: true,
            before,
            after,
            position: getComputedStyle(sidebar).position,
            shellOverflow: getComputedStyle(shell).overflow,
            pageScrollY: window.scrollY,
          };
        })()`,
        awaitPromise: true,
        returnByValue: true,
      });
      layout = result.result.value;
      if (layout.ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    assert.equal(layout.ready, true, `the docs layout did not render at ${layout.url}`);
    assert.equal(layout.position, "sticky", JSON.stringify(layout));
    assert.equal(layout.shellOverflow, "clip");
    assert.ok(layout.pageScrollY > 0, `the docs page did not scroll: ${JSON.stringify(layout)}`);
    assert.ok(Math.abs(layout.after - layout.before) <= 1, `sidebar moved from ${layout.before}px to ${layout.after}px`);
  } finally {
    connection?.close();
    chrome.kill();
    server.close();
    rmSync(profile, { recursive: true, force: true });
  }
});
