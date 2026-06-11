#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const serverPath = resolve("D:/ai-sandbox/command_center/server/index.mjs");

const child = spawn("node", [serverPath], {
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    ANTHROPIC_API_KEY: "",
    ANTHROPIC_BASE_URL: "https://opencode.ai/zen",
    ANTHROPIC_MODEL: "minimax-m2.5-free",
  },
});

let out = "";
let err = "";
child.stdout.on("data", (d) => (out += d.toString()));
child.stderr.on("data", (d) => (err += d.toString()));

const req = (id, method, params) =>
  JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }) + "\n";
const send = (msg) => child.stdin.write(msg);

send(req(1, "initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "smoke-ask", version: "0.0.1" },
}));
send(req(2, "notifications/initialized"));
send(req(3, "tools/list"));

setTimeout(() => {
  send(req(4, "tools/call", {
    name: "ask",
    arguments: { task: "ping the hub" },
  }));
}, 200);

setTimeout(() => {
  send(req(5, "tools/call", {
    name: "ask",
    arguments: { agent: "nonexistent", task: "what is up" },
  }));
}, 400);

setTimeout(() => {
  send(req(6, "tools/call", {
    name: "ask",
    arguments: { agent: "router", task: "ping the hub" },
  }));
}, 600);

setTimeout(() => {
  child.kill();
  console.log("=== STDERR ===");
  console.log(err);

  console.log("=== RESPONSES (parsed) ===");
  let askListed = false;
  let missingKey = null;
  let unknownAgent = null;
  let noModel = null;

  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      console.log("NON-JSON:", line);
      continue;
    }

    if (obj.id === 3 && obj.result && Array.isArray(obj.result.tools)) {
      const names = obj.result.tools.map((t) => t.name);
      askListed = names.includes("ask");
      console.log("tools/list names:", names.join(", "));
    }

    if (obj.id === 4 && obj.result) {
      missingKey = obj.result;
      console.log("\n--- ask without key ---");
      console.log(JSON.stringify(obj.result, null, 2));
    }

    if (obj.id === 5 && obj.result) {
      unknownAgent = obj.result;
      console.log("\n--- ask with unknown agent ---");
      console.log(JSON.stringify(obj.result, null, 2));
    }

    if (obj.id === 6 && obj.result) {
      noModel = obj.result;
      console.log("\n--- ask with valid agent, no API key (should still hit missing-key) ---");
      console.log(JSON.stringify(obj.result, null, 2));
    }
  }

  console.log("\n=== ASSERTIONS ===");
  const results = [
    ["ask is in tools/list", askListed],
    [
      "ask without key returns clear 'ANTHROPIC_API_KEY is not set' error",
      missingKey &&
        missingKey.isError &&
        JSON.stringify(missingKey).includes("ANTHROPIC_API_KEY is not set"),
    ],
    [
      "ask with unknown agent returns 'Unknown sub-agent' error",
      unknownAgent &&
        unknownAgent.isError &&
        JSON.stringify(unknownAgent).includes("Unknown sub-agent"),
    ],
  ];
  let pass = 0;
  for (const [name, ok] of results) {
    console.log((ok ? "PASS" : "FAIL") + " - " + name);
    if (ok) pass++;
  }
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
}, 1500);
