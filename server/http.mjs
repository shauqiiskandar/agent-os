#!/usr/bin/env node
import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { pingTool, handlePing } from "../tools/ping.mjs";
import { analyzeCsvTool, handleAnalyzeCsv } from "../tools/analyze_csv.mjs";
import { convertDocumentTool, handleConvertDocument } from "../tools/convert_document.mjs";
import { renderVideoTool, handleRenderVideo } from "../tools/render_video.mjs";
import { downloadYoutubeSubtitlesTool, handleDownloadYoutubeSubtitles } from "../tools/download_youtube_subtitles.mjs";
import { askTool, handleAsk } from "../tools/ask.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TOOLS = [pingTool, analyzeCsvTool, convertDocumentTool, renderVideoTool, downloadYoutubeSubtitlesTool, askTool];
const HANDLERS = {
  [pingTool.name]: handlePing,
  [analyzeCsvTool.name]: handleAnalyzeCsv,
  [convertDocumentTool.name]: handleConvertDocument,
  [renderVideoTool.name]: handleRenderVideo,
  [downloadYoutubeSubtitlesTool.name]: handleDownloadYoutubeSubtitles,
  [askTool.name]: handleAsk,
};

const PORT = parseInt(process.env.CC_HTTP_PORT || "3010", 10);
const HOST = process.env.CC_HTTP_HOST || "127.0.0.1";
const ALLOWED_ORIGIN = process.env.CC_HTTP_ALLOWED_ORIGIN || "http://localhost:3000";

const app = express();
app.use(express.json({ limit: "10mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.get("/", (_req, res) => {
  res.json({
    name: "command_center",
    version: "0.3.0",
    mode: "http",
    tools: TOOLS.map((t) => t.name),
    endpoints: ["/tools", "/tools/call", "/ping", "/status", "/ask (SSE)"],
  });
});

app.get("/tools", (_req, res) => {
  res.json({ tools: TOOLS });
});

app.get("/status", (_req, res) => {
  res.json({
    ok: true,
    mode: "http",
    port: PORT,
    host: HOST,
    toolCount: TOOLS.length,
    modelConfigured: !!process.env.ANTHROPIC_MODEL,
    keyConfigured: !!process.env.ANTHROPIC_API_KEY,
    baseUrl: process.env.ANTHROPIC_BASE_URL || "https://opencode.ai/zen",
    projectRoot: ROOT,
  });
});

app.get("/ping", async (_req, res) => {
  try {
    const result = await handlePing({});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post("/tools/call", async (req, res) => {
  const { name, arguments: args } = req.body || {};
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const handler = HANDLERS[name];
  if (!handler) {
    res.status(404).json({ error: `Unknown tool: ${name}` });
    return;
  }
  try {
    const result = await handler(args || {});
    res.json(result);
  } catch (err) {
    const msg = err && err.stack ? err.stack : String(err);
    res.status(500).json({ error: msg, isError: true });
  }
});

app.post("/ask", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {}
  }, 15000);

  const cleanup = () => {
    clearInterval(heartbeat);
  };

  req.on("close", () => {
    cleanup();
  });

  try {
    const result = await handleAsk(req.body || {}, { onEvent: send });
    send({ type: "result", result });
    res.end();
  } catch (err) {
    const msg = err && err.stack ? err.stack : String(err);
    send({ type: "error", stage: "ask", message: msg });
    res.end();
  } finally {
    cleanup();
  }
});

app.use((err, _req, res, _next) => {
  const msg = err && err.stack ? err.stack : String(err);
  res.status(500).json({ error: msg });
});

const server = createServer(app);
server.listen(PORT, HOST, () => {
  process.stderr.write(`[command_center http] listening on http://${HOST}:${PORT}\n`);
  process.stderr.write(`[command_center http] tools: ${TOOLS.map((t) => t.name).join(", ")}\n`);
  process.stderr.write(`[command_center http] allowed origin: ${ALLOWED_ORIGIN}\n`);
});

const shutdown = () => {
  process.stderr.write("[command_center http] shutting down\n");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
