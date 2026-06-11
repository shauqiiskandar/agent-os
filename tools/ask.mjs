import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeCsvTool, handleAnalyzeCsv } from "./analyze_csv.mjs";
import { convertDocumentTool, handleConvertDocument } from "./convert_document.mjs";
import { renderVideoTool, handleRenderVideo } from "./render_video.mjs";
import { downloadYoutubeSubtitlesTool, handleDownloadYoutubeSubtitles } from "./download_youtube_subtitles.mjs";
import { pingTool, handlePing } from "./ping.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUB_AGENTS_PATH = join(__dirname, "..", "sub_agents.json");

const LEAF_TOOLS = [
  { def: analyzeCsvTool, handler: handleAnalyzeCsv },
  { def: convertDocumentTool, handler: handleConvertDocument },
  { def: renderVideoTool, handler: handleRenderVideo },
  { def: downloadYoutubeSubtitlesTool, handler: handleDownloadYoutubeSubtitles },
  { def: pingTool, handler: handlePing },
];

const ENV_HINT =
  "Set ANTHROPIC_API_KEY (and optionally ANTHROPIC_BASE_URL, ANTHROPIC_MODEL) " +
  "in opencode.json under mcp.command_center.environment, then restart opencode.";

async function loadSubAgents() {
  const raw = await readFile(SUB_AGENTS_PATH, "utf8");
  return JSON.parse(raw);
}

function resolveModel(agentConfig, fileConfig) {
  return (
    (agentConfig && agentConfig.model) ||
    fileConfig.default_model ||
    process.env.ANTHROPIC_MODEL ||
    null
  );
}

function buildLlmTools(allowedTools) {
  const unfiltered = Array.isArray(allowedTools) && allowedTools.includes("*");
  const allowed = new Set(allowedTools || []);
  return LEAF_TOOLS.filter(
    ({ def }) => unfiltered || allowed.has(def.name)
  ).map(({ def }) => ({
    name: def.name,
    description: def.description,
    input_schema: def.inputSchema,
  }));
}

async function callLeafTool(name, input) {
  const entry = LEAF_TOOLS.find(({ def }) => def.name === name);
  if (!entry) {
    return { isError: true, content: `Unknown leaf tool: ${name}` };
  }
  try {
    const result = await entry.handler(input || {});
    const text = (result.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return { isError: !!result.isError, content: text || "(no text content)" };
  } catch (err) {
    const msg = err && err.stack ? err.stack : String(err);
    return { isError: true, content: `Tool error in ${name}: ${msg}` };
  }
}

export const askTool = {
  name: "ask",
  description:
    "Run a natural-language task through a configured sub-agent. A sub-agent is an LLM " +
    "with a system prompt, an optional model override, and a set of command_center leaf " +
    "tools it can call. Use this for free-form requests that don't map to a single tool. " +
    "Omit agent for a plain LLM call with no tool access.",
  inputSchema: {
    type: "object",
    properties: {
      agent: {
        type: "string",
        description:
          "Name of the sub-agent to invoke. Must be defined in sub_agents.json. " +
          "If omitted, runs a plain LLM call (no tool access).",
      },
      task: {
        type: "string",
        description: "The natural-language task for the sub-agent to handle.",
      },
    },
    required: ["task"],
  },
};

function makeEmit(onEvent) {
  return (event) => {
    try {
      onEvent(event);
    } catch (err) {
      process.stderr.write(`[ask] onEvent handler threw: ${err && err.stack ? err.stack : err}\n`);
    }
  };
}

function failResponse(emit, message) {
  emit({ type: "error", stage: "validate", message });
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

export async function handleAsk(args, hooks = {}) {
  const emit = makeEmit(hooks.onEvent || (() => {}));
  const { agent: agentName, task } = args || {};

  if (!task || typeof task !== "string") {
    return failResponse(emit, "task is required and must be a string");
  }

  let fileConfig;
  try {
    fileConfig = await loadSubAgents();
  } catch (err) {
    return failResponse(emit, `Failed to load sub_agents.json: ${err.message || err}`);
  }

  const agentConfig = agentName
    ? fileConfig.agents.find((a) => a.name === agentName)
    : null;

  if (agentName && !agentConfig) {
    const known = fileConfig.agents.map((a) => a.name).join(", ") || "(none)";
    return failResponse(emit, `Unknown sub-agent: "${agentName}". Known: ${known}.`);
  }

  const model = resolveModel(agentConfig, fileConfig);
  if (!model) {
    return failResponse(
      emit,
      "No model configured. Set one of: " +
        "(1) sub_agents.json default_model, " +
        "(2) sub_agents.json agents[i].model, " +
        "(3) ANTHROPIC_MODEL in opencode.json mcp.command_center.environment."
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return failResponse(emit, `ANTHROPIC_API_KEY is not set. ${ENV_HINT}`);
  }

  const baseURL = process.env.ANTHROPIC_BASE_URL || "https://opencode.ai/zen";
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL,
  });

  const llmTools = agentConfig ? buildLlmTools(agentConfig.allowed_tools || []) : [];
  const maxIterations = fileConfig.max_iterations || 10;
  const systemPrompt = agentConfig
    ? agentConfig.system_prompt
    : "You are a helpful assistant. Answer concisely.";

  emit({
    type: "start",
    agent: agentName || null,
    model,
    allowedTools: agentConfig ? agentConfig.allowed_tools || [] : [],
    maxIterations,
  });

  const messages = [{ role: "user", content: task }];
  const log = [];
  let finalText = "";
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;
    emit({ type: "iteration", iteration: iterations, maxIterations });

    let response;
    try {
      response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: llmTools.length ? llmTools : undefined,
        messages,
      });
    } catch (err) {
      const msg = `LLM call failed (iteration ${iterations}): ${err.message || err}`;
      emit({ type: "error", stage: "llm", message: msg, iteration: iterations });
      const errLog = [
        `## Error (agent: ${agentName || "<none>"}, model: ${model}, iterations: ${iterations})`,
        "",
        msg,
        "",
        "## Loop log so far",
        "```json",
        JSON.stringify(log, null, 2),
        "```",
      ].join("\n");
      return {
        content: [{ type: "text", text: errLog }],
        isError: true,
      };
    }

    const textParts = [];
    const toolUses = [];
    for (const block of response.content || []) {
      if (block.type === "text") textParts.push(block.text);
      else if (block.type === "tool_use") toolUses.push(block);
    }

    if (textParts.length > 0) {
      emit({ type: "llm_text", iteration: iterations, text: textParts.join("\n") });
    }

    log.push({
      iteration: iterations,
      stop_reason: response.stop_reason,
      text: textParts.join(" ").slice(0, 500),
      tool_calls: toolUses.map((t) => ({ name: t.name, input: t.input })),
    });

    messages.push({ role: "assistant", content: response.content });

    const finished =
      toolUses.length === 0 ||
      response.stop_reason === "end_turn" ||
      response.stop_reason === "max_tokens";

    if (finished) {
      finalText = textParts.join("\n");
      break;
    }

    const toolResults = [];
    for (const tu of toolUses) {
      emit({ type: "tool_use", iteration: iterations, id: tu.id, name: tu.name, input: tu.input });
      const result = await callLeafTool(tu.name, tu.input);
      emit({
        type: "tool_result",
        iteration: iterations,
        tool_use_id: tu.id,
        name: tu.name,
        content: result.content,
        is_error: result.isError || undefined,
      });
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: result.content,
        is_error: result.isError || undefined,
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  if (!finalText) {
    finalText = `Stopped after ${iterations} iteration(s) without a final text answer. See log for details.`;
  }

  emit({ type: "final", text: finalText, iterations, log });

  const summary = [
    `## Final answer (agent: ${agentName || "<none>"}, model: ${model}, iterations: ${iterations})`,
    "",
    finalText,
    "",
    "## Loop log",
    "```json",
    JSON.stringify(log, null, 2),
    "```",
  ].join("\n");

  return { content: [{ type: "text", text: summary }] };
}
