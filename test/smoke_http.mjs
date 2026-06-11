#!/usr/bin/env node
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.CC_HTTP_PORT || "3010";
const HOST = process.env.CC_HTTP_HOST || "127.0.0.1";
const BASE = `http://${HOST}:${PORT}`;

const child = spawn("node", ["server/http.mjs"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, ANTHROPIC_API_KEY: "" },
});

let stderr = "";
child.stderr.on("data", (d) => (stderr += d.toString()));
child.stdout.on("data", () => {});

const waited = await sleep(800);

const assertions = [];
const check = (name, ok, extra = "") => {
  assertions.push({ name, ok, extra });
  console.log((ok ? "PASS" : "FAIL") + " - " + name + (extra ? "  " + extra : ""));
};

const get = async (path) => {
  const r = await fetch(`${BASE}${path}`);
  return { status: r.status, body: await r.json() };
};
const post = async (path, body) => {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return { status: r.status, body: await r.json() };
};

try {
  const root = await get("/");
  check("GET / returns server info", root.status === 200 && root.body.name === "command_center", `tools: ${root.body.tools?.join(",")}`);

  const tools = await get("/tools");
  const toolNames = (tools.body.tools || []).map((t) => t.name);
  check("GET /tools lists all 5", tools.status === 200 && toolNames.length === 5, `names: ${toolNames.join(",")}`);

  const status = await get("/status");
  check("GET /status reports model + key state", status.status === 200 && status.body.keyConfigured === false, `model=${status.body.modelConfigured} key=${status.body.keyConfigured}`);

  const ping = await get("/ping");
  const pingText = ping.body?.content?.[0]?.text || "";
  check("GET /ping returns ok", ping.status === 200 && pingText.includes('"status": "ok"'));

  const noName = await post("/tools/call", {});
  check("POST /tools/call without name → 400", noName.status === 400);

  const badName = await post("/tools/call", { name: "nope" });
  check("POST /tools/call with unknown name → 404", badName.status === 404);

  const csvMissing = await post("/tools/call", { name: "analyze_csv", arguments: { csvPath: "D:/nonexistent.csv" } });
  const csvText = JSON.stringify(csvMissing.body);
  check("POST /tools/call analyze_csv missing file → returns clear error", csvMissing.status === 200 && csvText.includes("CSV not found"));

  const askNoKey = await post("/tools/call", { name: "ask", arguments: { task: "ping" } });
  const askText = JSON.stringify(askNoKey.body);
  check("POST /tools/call ask (no key) → ANTHROPIC_API_KEY error", askNoKey.status === 200 && askText.includes("ANTHROPIC_API_KEY is not set"));

  const askBadAgent = await post("/tools/call", { name: "ask", arguments: { agent: "ghost", task: "ping" } });
  const askBadText = JSON.stringify(askBadAgent.body);
  check("POST /tools/call ask (bad agent) → Unknown sub-agent error", askBadAgent.status === 200 && askBadText.includes("Unknown sub-agent"));

  const askSseRaw = await new Promise(async (resolve, reject) => {
    try {
      const r = await fetch(`${BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ task: "ping" }),
      });
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      const events = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() || "";
        for (const block of lines) {
          const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            events.push(JSON.parse(dataLine.slice(6)));
          } catch {}
        }
      }
      resolve(events);
    } catch (e) {
      reject(e);
    }
  });

  const eventTypes = askSseRaw.map((e) => e.type);
  const sawError = eventTypes.includes("error");
  const sawResult = eventTypes.includes("result");
  check(
    "POST /ask (SSE) streams events: error + result (key empty)",
    sawError && sawResult && eventTypes[0] === "error",
    `events: ${eventTypes.join(",")}`
  );
} catch (err) {
  console.log("UNEXPECTED ERROR:", err && err.stack ? err.stack : err);
  assertions.push({ name: "no uncaught error", ok: false });
} finally {
  child.kill();
  await sleep(200);
  const pass = assertions.filter((a) => a.ok).length;
  console.log(`\n${pass}/${assertions.length} passed`);
  if (stderr.trim()) {
    console.log("\n=== HTTP server stderr (last 30 lines) ===");
    const lines = stderr.trim().split("\n");
    for (const line of lines.slice(-30)) console.log(line);
  }
  process.exit(pass === assertions.length ? 0 : 1);
}
