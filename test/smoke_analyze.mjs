#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const serverPath = resolve("D:/ai-sandbox/command_center/server/index.mjs");
const child = spawn("node", [serverPath], { stdio: ["pipe", "pipe", "pipe"] });

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
  clientInfo: { name: "smoke-test", version: "0.0.1" },
}));
send(req(2, "notifications/initialized"));

setTimeout(() => {
  send(req(3, "tools/call", {
    name: "analyze_csv",
    arguments: { csvPath: "D:/ai-sandbox/csv_analyzer/data.csv" },
  }));
}, 200);

setTimeout(() => {
  child.kill();
  console.log("=== STDERR ===");
  console.log(err);
  console.log("=== STDOUT (JSON-RPC responses) ===");
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.result && obj.result.content) {
        for (const c of obj.result.content) {
          console.log(`[id=${obj.id}] ${c.text}`);
        }
      } else {
        console.log(`[id=${obj.id}]`, JSON.stringify(obj));
      }
    } catch {
      console.log("NON-JSON:", line);
    }
  }
  process.exit(0);
}, 8000);
