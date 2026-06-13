#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { pingTool, handlePing } from "../tools/ping.mjs";
import { analyzeCsvTool, handleAnalyzeCsv } from "../tools/analyze_csv.mjs";
import { convertDocumentTool, handleConvertDocument } from "../tools/convert_document.mjs";
import { renderVideoTool, handleRenderVideo } from "../tools/render_video.mjs";
import { composeFromScriptTool, handleComposeFromScript } from "../tools/compose_from_script.mjs";
import { askTool, handleAsk } from "../tools/ask.mjs";
import { formatDocumentTool, handleFormatDocument } from "../tools/format_document.mjs";
import { downloadYoutubeSubtitlesTool, handleDownloadYoutubeSubtitles } from "../tools/download_youtube_subtitles.mjs";

const hasLlmKey = !!(process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY);

const leafTools = [pingTool, analyzeCsvTool, convertDocumentTool, formatDocumentTool, renderVideoTool, composeFromScriptTool, downloadYoutubeSubtitlesTool];
const tools = hasLlmKey ? [...leafTools, askTool] : leafTools;

const handlers = {
  [pingTool.name]: handlePing,
  [analyzeCsvTool.name]: handleAnalyzeCsv,
  [convertDocumentTool.name]: handleConvertDocument,
  [formatDocumentTool.name]: handleFormatDocument,
  [renderVideoTool.name]: handleRenderVideo,
  [composeFromScriptTool.name]: handleComposeFromScript,
  [downloadYoutubeSubtitlesTool.name]: handleDownloadYoutubeSubtitles,
  ...(hasLlmKey ? { [askTool.name]: handleAsk } : {}),
};

const server = new Server(
  { name: "command-center", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const handler = handlers[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }
  try {
    return await handler(request.params.arguments ?? {});
  } catch (err) {
    const msg = err && err.stack ? err.stack : String(err);
    return {
      content: [{ type: "text", text: `Error in ${name}: ${msg}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
const hasKey = !!(process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY);
const keyPreview = hasKey
  ? (process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY).slice(0, 12) + "..."
  : "(not set)";
process.stderr.write(`[command_center] MCP server connected (${tools.length} tools, LLM_API_KEY=${keyPreview})\n`);
