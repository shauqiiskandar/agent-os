#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { resolve } from "node:path";

const CC_DIR = resolve("D:/ai-sandbox/command_center");
const WEB_DIR = resolve("D:/ai-sandbox/command_center/web");
const CC_PORT = "3011";
const WEB_PORT = "3012";

console.log("building next.js production bundle (one-time)...");
try {
  const build = spawnSync("node", ["node_modules/next/dist/bin/next", "build"], {
    cwd: WEB_DIR,
    stdio: "inherit",
  });
  if (build.status !== 0) {
    console.log("FAIL - next build returned non-zero");
    process.exit(1);
  }
} catch (err) {
  console.log("FAIL - next build failed:", err && err.message);
  process.exit(1);
}

const cc = spawn("node", ["server/http.mjs"], {
  cwd: CC_DIR,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, ANTHROPIC_API_KEY: "", CC_HTTP_PORT: CC_PORT },
});
let ccStderr = "";
cc.stderr.on("data", (d) => (ccStderr += d.toString()));
cc.stdout.on("data", () => {});

const web = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", WEB_PORT], {
  cwd: WEB_DIR,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, CC_HTTP_PORT: CC_PORT, CC_HTTP_BASE_URL: `http://127.0.0.1:${CC_PORT}` },
});
let webStderr = "";
web.stderr.on("data", (d) => (webStderr += d.toString()));
web.stdout.on("data", () => {});

const IS_WIN = process.platform === "win32";
const killTree = (child) => {
  if (!child || child.killed) return;
  try {
    if (IS_WIN) spawn("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
    else child.kill("SIGTERM");
  } catch {}
};
const cleanup = () => {
  killTree(cc);
  killTree(web);
};

process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(1); });

let pass = 0;
let total = 0;
const check = (name, ok, extra = "") => {
  total++;
  if (ok) pass++;
  console.log((ok ? "PASS" : "FAIL") + " - " + name + (extra ? "  " + extra : ""));
};

const waitFor = async (url, label, timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return true;
    } catch {}
    await sleep(300);
  }
  console.log(`TIMEOUT waiting for ${label} (${url})`);
  console.log("cc stderr:", ccStderr.slice(-500));
  console.log("web stderr:", webStderr.slice(-500));
  return false;
};

try {
  const ccReady = await waitFor(`http://127.0.0.1:${CC_PORT}/`, "command_center http");
  check("command_center http server ready", ccReady);

  const webReady = await waitFor(`http://127.0.0.1:${WEB_PORT}/`, "next.js server", 60000);
  check("next.js server ready", webReady);

  if (!ccReady || !webReady) {
    process.exit(1);
  }

  const pageRes = await fetch(`http://127.0.0.1:${WEB_PORT}/`);
  const pageHtml = await pageRes.text();
  check(
    "GET / renders the mission control page",
    pageRes.status === 200 && pageHtml.includes("command_center") && pageHtml.includes("mission control"),
    `bytes=${pageHtml.length}`
  );

  const proxyRes = await fetch(`http://127.0.0.1:${WEB_PORT}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: "ping the hub" }),
  });

  check("POST /api/ask returns 200 + SSE content-type", proxyRes.status === 200 && (proxyRes.headers.get("content-type") || "").includes("text/event-stream"));

  const reader = proxyRes.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const events = [];
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const { done, value } = await Promise.race([
      reader.read(),
      new Promise((r) => setTimeout(() => r({ done: true, value: undefined }), 2000)),
    ]);
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const blocks = buf.split("\n\n");
    buf = blocks.pop() || "";
    for (const block of blocks) {
      const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      try {
        events.push(JSON.parse(dataLine.slice(6)));
      } catch {}
    }
  }
  try { await reader.cancel(); } catch {}

  const types = events.map((e) => e.type);
  check(
    "/api/ask proxies SSE events from command_center (error + result, no key)",
    types.includes("error") && types.includes("result"),
    `events: ${types.join(",")}`
  );

  const proxyDownOk = await testProxyDown(CC_PORT, WEB_PORT);
  check(
    "/api/ask surfaces proxy error when command_center is down",
    proxyDownOk
  );
} catch (err) {
  console.log("UNEXPECTED ERROR:", err && err.stack ? err.stack : err);
} finally {
  console.log(`\n${pass}/${total} passed`);
  cleanup();
  await sleep(200);
  process.exit(pass === total ? 0 : 1);
}

async function testProxyDown(ccPort, webPort) {
  killTree(cc);
  await sleep(500);

  const res = await fetch(`http://127.0.0.1:${webPort}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: "x" }),
  });

  let body = "";
  try {
    const r = res.body.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await Promise.race([
        r.read(),
        new Promise((res2) => setTimeout(() => res2({ done: true, value: undefined }), 2000)),
      ]);
      if (done) break;
      body += dec.decode(value, { stream: true });
    }
  } catch {}

  return body.includes("proxy") || body.includes("Cannot reach");
}
