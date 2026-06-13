import OpenAI from "openai";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeCsvTool, handleAnalyzeCsv } from "./analyze_csv.mjs";
import { convertDocumentTool, handleConvertDocument } from "./convert_document.mjs";
import { renderVideoTool, handleRenderVideo } from "./render_video.mjs";
import { composeFromScriptTool, handleComposeFromScript } from "./compose_from_script.mjs";
import { downloadYoutubeSubtitlesTool, handleDownloadYoutubeSubtitles } from "./download_youtube_subtitles.mjs";
import { pingTool, handlePing } from "./ping.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUB_AGENTS_PATH = join(__dirname, "..", "sub_agents.json");

const LEAF_TOOLS = [
  { def: analyzeCsvTool, handler: handleAnalyzeCsv },
  { def: convertDocumentTool, handler: handleConvertDocument },
  { def: renderVideoTool, handler: handleRenderVideo },
  { def: composeFromScriptTool, handler: handleComposeFromScript },
  { def: downloadYoutubeSubtitlesTool, handler: handleDownloadYoutubeSubtitles },
  { def: pingTool, handler: handlePing },
];

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
    type: "function",
    function: {
      name: def.name,
      description: def.description,
      parameters: def.inputSchema,
    },
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

  let key = process.env.ANTHROPIC_API_KEY;
  let baseURL = process.env.ANTHROPIC_BASE_URL;

  // Fallback: read from opencode.json if env vars are empty
  if (!key || !baseURL) {
    try {
      const os = await import("node:os");
      const path = await import("node:path");
      const fs = await import("node:fs/promises");
      const home = os.homedir();
      const opencodePaths = [
        path.join(home, ".config", "opencode", "opencode.json"),
        path.join(home, ".opencode", "opencode.json"),
      ];
      let found = false;
      for (const p of opencodePaths) {
        try {
          await fs.access(p);
          const raw = await fs.readFile(p, "utf8");
          const cleaned = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
          const cfg = JSON.parse(cleaned);
          const env = cfg?.mcp?.command_center?.environment || cfg?.mcp?.command_center?.env || {};
          if (env.ANTHROPIC_API_KEY) { key = env.ANTHROPIC_API_KEY; found = true; }
          if (env.ANTHROPIC_BASE_URL) { baseURL = env.ANTHROPIC_BASE_URL; found = true; }
          if (found) break;
        } catch (e) {
          emit({ type: "debug", stage: "opencode_fallback", path: p, error: e?.message || String(e) });
        }
      }
      if (!found) {
        emit({ type: "debug", stage: "opencode_fallback", message: "no opencode.json found or parsed", keyEmpty: !key, baseUrlEmpty: !baseURL, home });
      }
    } catch (e) {
      emit({ type: "debug", stage: "opencode_fallback", message: "outer catch: " + (e?.message || String(e)) });
    }
  }

  if (!key) {
    const msg = "No API key found: ANTHROPIC_API_KEY env var is empty and opencode.json fallback also failed.";
    emit({ type: "error", stage: "validate", message: msg });
    return { content: [{ type: "text", text: msg }], isError: true };
  }

  baseURL = baseURL || "https://openrouter.ai/api";
  const client = new OpenAI({
    apiKey: key,
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

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: task },
  ];
  const log = [];
  let finalText = "";
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;
    emit({ type: "iteration", iteration: iterations, maxIterations });

    let response;
    try {
      response = await client.chat.completions.create({
        model,
        max_tokens: 4096,
        tools: llmTools.length ? llmTools : undefined,
        messages,
      });
    } catch (err) {
      const keyPreview = key ? key.slice(0, 15) + "..." : "(not set)";
      const msg = `LLM call failed (iteration ${iterations}): ${err.message || err} [key=${keyPreview}, url=${baseURL}, model=${model}]`;
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

    const choice = response.choices[0];
    const finishReason = choice.finish_reason;
    const msgContent = choice.message.content || "";
    const toolCalls = choice.message.tool_calls || [];

    if (msgContent) {
      emit({ type: "llm_text", iteration: iterations, text: msgContent });
    }

    log.push({
      iteration: iterations,
      stop_reason: finishReason,
      text: msgContent.slice(0, 500),
      tool_calls: toolCalls.map((t) => ({ name: t.function.name, input: t.function.arguments })),
    });

    // Append assistant message to conversation history
    const assistantMsg = { role: "assistant", content: msgContent || null };
    if (toolCalls.length) {
      assistantMsg.tool_calls = toolCalls.map((tc) => ({
        id: tc.id,
        type: tc.type,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));
    }
    messages.push(assistantMsg);

    const finished = toolCalls.length === 0 || finishReason === "stop";

    if (finished) {
      finalText = msgContent;
      break;
    }

    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      let toolInput = {};
      try {
        toolInput = JSON.parse(tc.function.arguments);
      } catch {}

      emit({ type: "tool_use", iteration: iterations, id: tc.id, name: toolName, input: toolInput });
      const result = await callLeafTool(toolName, toolInput);
      const resultText = result.content || "";

      emit({
        type: "tool_result",
        iteration: iterations,
        tool_use_id: tc.id,
        name: toolName,
        content: result.content,
        is_error: result.isError || undefined,
      });

      messages.push({ role: "tool", tool_call_id: tc.id, content: resultText || "Done (no content)" });
    }
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
