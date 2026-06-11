#!/usr/bin/env node
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { resolve } from "node:path";

const CC_DIR = resolve("D:/ai-sandbox/command_center");

const orch = spawn("node", ["dev.mjs"], {
  cwd: CC_DIR,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, FORCE_COLOR: "1" },
});

let orchOut = "";
let orchErr = "";
orch.stdout.on("data", (d) => (orchOut += d.toString()));
orch.stderr.on("data", (d) => (orchErr += d.toString()));

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
      const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (r.status < 500) return true;
    } catch {}
    await sleep(300);
  }
  return false;
};

const tryFetch = async (url) => {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
};

try {
  const orchReady = await waitFor("http://127.0.0.1:3010/", "command_center http", 30000);
  check("orchestrator starts command_center http within 30s", orchReady);

  const webReady = await waitFor("http://localhost:3000/", "next.js web", 30000);
  check("orchestrator starts next.js web within 30s of http", webReady);

  const webRes = await fetch("http://localhost:3000/");
  const webHtml = await webRes.text();
  check("web page renders mission control", webRes.status === 200 && webHtml.includes("mission control"));

  const httpRes = await fetch("http://127.0.0.1:3010/status");
  const httpBody = await httpRes.json();
  check("http /status reports the server", httpRes.status === 200 && httpBody.name === "command_center" || httpBody.mode === "http", `body mode=${httpBody.mode}`);

  const proxyRes = await fetch("http://localhost:3000/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: "ping the hub" }),
  });
  check("web → http proxy works through the orchestrator", proxyRes.status === 200);

  let gotEvents = false;
  if (proxyRes.body) {
    const r = proxyRes.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const { done, value } = await Promise.race([
        r.read(),
        new Promise((res2) => setTimeout(() => res2({ done: true, value: undefined }), 1500)),
      ]);
      if (done) break;
      buf += dec.decode(value, { stream: true });
      if (buf.includes("data:")) gotEvents = true;
    }
    try { await r.cancel(); } catch {}
  }
  check("orchestrator path: SSE events stream through the proxy", gotEvents);

  orch.kill("SIGINT");
  await sleep(3000);

  const httpDead = !(await tryFetch("http://127.0.0.1:3010/"));
  const webDead = !(await tryFetch("http://localhost:3000/"));
  check("orchestrator kills command_center http on Ctrl+C", httpDead);
  check("orchestrator kills next.js web on Ctrl+C", webDead);
} catch (err) {
  console.log("UNEXPECTED ERROR:", err && err.stack ? err.stack : err);
} finally {
  try { orch.kill("SIGKILL"); } catch {}
  console.log(`\n${pass}/${total} passed`);
  if (pass < total) {
    console.log("\n=== last 60 lines of orchestrator output ===");
    const all = (orchOut + orchErr).split("\n");
    for (const line of all.slice(-60)) console.log(line);
  }
  setTimeout(() => process.exit(pass === total ? 0 : 1), 100);
}
