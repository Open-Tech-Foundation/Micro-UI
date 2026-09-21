// Drives the built docs site in a real browser and checks that the docs
// sidebar stays pinned while the page scrolls.
//
// The website content suite (`test:website`) pins the sources statically —
// markup, styles, config. What it cannot check is the actual behaviour: the
// sidebar sticking depends on layout and scrolling, which no test DOM models.
// So this drives the real thing: esdev serves `website/dist/` (`runtime:http`)
// and speaks CDP to a browser already on the machine (`runtime:system` spawns
// it, the `WebSocket` global drives it). Skips with a clear message when there
// is no browser or the site has not been built (`tsr website:build`), so the
// task still passes on a box without either.
import { exists, file, makeTempDir, mkdir, remove } from "runtime:fs";
import { serve } from "runtime:http";
import {
  dirname,
  extname,
  fromFileURL,
  join,
  normalize,
} from "runtime:path";
import { env, exit } from "runtime:process";
import { Command } from "runtime:system";

const repoRoot = join(dirname(fromFileURL(import.meta.url)), "..");
const distRoot = join(repoRoot, "dist");

const envString = (key) => {
  const value = env[key];
  return typeof value === "string" && value !== "" ? value : undefined;
};

const browserCandidates = [
  envString("CHROME_BIN"),
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
].filter(Boolean);

async function findBrowser() {
  for (const candidate of browserCandidates) {
    if (candidate.includes("/")) {
      if (await exists(candidate)) return candidate;
      continue;
    }
    try {
      const result = await new Command(candidate, {
        args: ["--version"],
        stdout: "null",
        stderr: "null",
      }).output();
      if (result.success) return candidate;
    } catch {}
  }
  return null;
}

const MIME = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

async function startServer() {
  const server = serve({ hostname: "127.0.0.1", port: 0 }, async (request) => {
    const requestPath = normalize(
      decodeURIComponent(new URL(request.url, "http://localhost").pathname),
    );
    if (requestPath.split("/").includes(".."))
      return new Response("forbidden", { status: 403 });

    const relativePath =
      requestPath === "/" || requestPath.endsWith("/")
        ? `${requestPath}index.html`
        : requestPath;
    const name = join(distRoot, relativePath);
    if (!(await exists(name))) return new Response("not found", { status: 404 });

    let body = await file(name).bytes();
    let contentType = MIME[extname(name)] ?? "application/octet-stream";
    if (extname(name) === ".html") {
      const html = new TextDecoder().decode(body);
      const stylesheetLink = html.match(
        /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/,
      );
      if (stylesheetLink) {
        const stylesheet = await file(
          join(distRoot, stylesheetLink[1]),
        ).text();
        // Keep this layout test independent of the test server's stylesheet MIME handling.
        body = new TextEncoder().encode(
          html.replace(stylesheetLink[0], `<style>${stylesheet}</style>`),
        );
        contentType = "text/html";
      }
    }
    return new Response(body, { headers: { "content-type": contentType } });
  });
  const { port } = await server.addr;
  return { server, port };
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
    message.error
      ? pending.reject(new Error(message.error.message))
      : pending.resolve(message.result);
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const browser = await findBrowser();
  if (!browser) {
    console.log(
      "docs e2e SKIPPED: browser E2E test requires Google Chrome or Chromium.",
    );
    return;
  }
  if (!(await exists(join(distRoot, "docs/api/mount/index.html")))) {
    console.log(
      "docs e2e SKIPPED: run `tsr website:build` before the docs browser test.",
    );
    return;
  }

  const { server, port: serverPort } = await startServer();
  // A unique profile per run, inside the repo's jail so it can be cleaned up.
  // (Chrome creates far worse than broken symlinks in a profile; the
  // gitignore keeps it out of the tree either way.)
  const profilesDir = join(repoRoot, "test", ".chrome-profiles");
  await mkdir(profilesDir, { recursive: true });
  const profile = await makeTempDir({
    dir: profilesDir,
    prefix: "micro-ui-docs-e2e-",
  });
  const debugPort = 9400 + Math.floor(Math.random() * 500);
  const chrome = await new Command(browser, {
    args: [
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
    stdout: "null",
    stderr: "null",
  }).spawn();

  let connection;
  try {
    let target;
    for (let attempt = 0; attempt < 100 && !target; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      try {
        const targets = await (
          await fetch(`http://127.0.0.1:${debugPort}/json/list`)
        ).json();
        target = targets.find(
          (item) => item.type === "page" && item.webSocketDebuggerUrl,
        );
      } catch {}
    }
    assert(target, "Chrome did not expose the docs page");

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

    assert(
      layout.ready === true,
      `the docs layout did not render at ${layout.url}`,
    );
    assert(
      layout.position === "sticky",
      `sidebar position is ${layout.position}: ${JSON.stringify(layout)}`,
    );
    assert(layout.shellOverflow === "clip", JSON.stringify(layout));
    assert(
      layout.pageScrollY > 0,
      `the docs page did not scroll: ${JSON.stringify(layout)}`,
    );
    assert(
      Math.abs(layout.after - layout.before) <= 1,
      `sidebar moved from ${layout.before}px to ${layout.after}px`,
    );
    console.log("docs e2e (docs sidebar pinned): 1 passed, 0 failed");
  } finally {
    connection?.close();
    try {
      await chrome.kill();
    } catch {}
    await server.stop();
    await remove(profile, { recursive: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(`docs e2e FAILED: ${error.message}`);
  exit(1);
}
