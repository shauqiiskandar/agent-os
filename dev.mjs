#!/usr/bin/env node
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(__dirname, "web");
const IS_WIN = process.platform === "win32";

const HTTP_PORT = process.env.CC_HTTP_PORT || "3010";
const HTTP_URL = `http://127.0.0.1:${HTTP_PORT}`;
const WEB_PORT = process.env.WEB_PORT || "3000";

const ORCH = "\x1b[90m";
const HTTP_COLOR = "\x1b[36m";
const WEB_COLOR = "\x1b[35m";
const RESET = "\x1b[0m";

function startChild(label, color, cmd, args, cwd) {
  const child = spawn(cmd, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
    windowsHide: true,
  });
  const prefix = `${color}[${label}]${RESET} `;
  const pipe = (stream, target) => {
    let buf = "";
    stream.on("data", (d) => {
      buf += d.toString();
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) target.write(prefix + line + "\n");
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("error", (err) => {
    process.stderr.write(`${prefix}spawn error: ${err.message}\n`);
  });
  return child;
}

function killTree(child, label) {
  if (!child || child.killed) return;
  const pid = child.pid;
  if (!pid) return;
  if (IS_WIN) {
    try {
      spawn("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore", windowsHide: true });
    } catch (err) {
      process.stderr.write(`${ORCH}[orchestrator]${RESET} taskkill ${label} failed: ${err.message}\n`);
    }
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try { child.kill("SIGTERM"); } catch {}
    }
  }
}

async function waitFor(url, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  process.stderr.write(`${ORCH}[orchestrator]${RESET} waiting for ${label} (${url})...\n`);
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return true;
    } catch {}
    await sleep(300);
  }
  return false;
}

let http = null;
let web = null;
let shuttingDown = false;

const shutdown = (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stderr.write(`\n${ORCH}[orchestrator]${RESET} shutting down...\n`);
  killTree(http, "http");
  killTree(web, "web");
  setTimeout(() => process.exit(code), 800);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("exit", () => {
  killTree(http, "http");
  killTree(web, "web");
});

(async () => {
  process.stderr.write(`${ORCH}[orchestrator]${RESET} command_center dev stack\n`);
  process.stderr.write(`${ORCH}[orchestrator]${RESET} http: ${HTTP_URL}\n`);
  process.stderr.write(`${ORCH}[orchestrator]${RESET} web:  http://localhost:${WEB_PORT}\n`);
  process.stderr.write(`${ORCH}[orchestrator]${RESET} Ctrl+C to stop both\n\n`);

  http = startChild("http", HTTP_COLOR, "node", ["server/http.mjs"], __dirname);
  http.on("exit", (code) => {
    if (!shuttingDown) {
      process.stderr.write(`\n${HTTP_COLOR}[http]${RESET} exited with code ${code}\n`);
      shutdown(code ?? 1);
    }
  });

  const httpReady = await waitFor(`${HTTP_URL}/`, "command_center http");
  if (!httpReady) {
    process.stderr.write(`${ORCH}[orchestrator]${RESET} command_center http did not become ready in time\n`);
    shutdown(1);
    return;
  }
  process.stderr.write(`${ORCH}[orchestrator]${RESET} http ready\n\n`);

  web = startChild("web", WEB_COLOR, "node", ["node_modules/next/dist/bin/next", "dev", "-p", WEB_PORT], WEB_DIR);
  web.on("exit", (code) => {
    if (!shuttingDown) {
      process.stderr.write(`\n${WEB_COLOR}[web]${RESET} exited with code ${code}\n`);
      shutdown(code ?? 1);
    }
  });
})();
