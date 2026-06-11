#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const serverPath = resolve("D:/ai-sandbox/command_center/server/index.mjs");
const child = spawn("node", [serverPath], { stdio: ["pipe", "pipe", "pipe"] });

let out = "";
child.stdout.on("data", (d) => (out += d.toString()));
child.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

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
    name: "render_video",
    arguments: {
      compositionId: "StickmanFight",
      outputPath: "D:/ai-sandbox/command_center/cache/videos/stickman.mp4",
    },
  }));
}, 200);

setTimeout(() => {
  child.kill();
  console.log("=== STDOUT (JSON-RPC) ===");
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.result && obj.result.content) {
        for (const c of obj.result.content) console.log(`[id=${obj.id}] ${c.text}`);
        if (obj.result.isError) console.log(`[id=${obj.id}] isError=true`);
      } else {
        console.log(`[id=${obj.id}]`, JSON.stringify(obj));
      }
    } catch { console.log("NON-JSON:", line); }
  }
  process.exit(0);
}, 600000); // 10 min max
