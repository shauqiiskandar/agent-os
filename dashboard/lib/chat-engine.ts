import type { ChatMessage, ToolCallInfo } from "./types";
import { generateId } from "./utils";

export interface ChatToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatOptions {
  history: Record<string, unknown>[];
  model: string;
  onSystem?: (text: string) => void;
}

const HISTORY_KEY = "command_center:chat_history";
const UI_KEY = "command_center:chat_ui";
const MAX_SAVED_MESSAGES = 20;

export function loadHistory(): Record<string, unknown>[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHistory(history: Record<string, unknown>[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = history.slice(-MAX_SAVED_MESSAGES);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch {}
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(HISTORY_KEY);
    window.localStorage.removeItem(UI_KEY);
  } catch {}
}

export function loadUiMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(UI_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is ChatMessage => !!m && typeof m === "object" && typeof m.id === "string" && typeof m.role === "string")
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: typeof m.content === "string" ? m.content : "",
        toolCalls: Array.isArray(m.toolCalls) ? m.toolCalls : undefined,
        toolCallId: typeof m.toolCallId === "string" ? m.toolCallId : undefined,
        timestamp: typeof m.timestamp === "number" ? m.timestamp : Date.now(),
        streaming: false,
      }));
  } catch {
    return [];
  }
}

export function saveUiMessages(messages: ChatMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    const snapshot = messages
      .filter((m) => m.role !== "system")
      .slice(-MAX_SAVED_MESSAGES)
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls,
        toolCallId: m.toolCallId,
        timestamp: m.timestamp,
        streaming: false,
      }));
    window.localStorage.setItem(UI_KEY, JSON.stringify(snapshot));
  } catch {}
}

const SYSTEM_PROMPT = `You are Command Center, an AI assistant with access to a suite of tools. When the user asks you to do something, use the available tools to accomplish the task. Always call tools when appropriate rather than guessing or making up answers.

Available tools:
- ping: Health check — verify the command center server is online.
- analyze_csv: Analyze a CSV file for totals, daily breakdown, cost tiers, and top 5 most expensive rows. Expects columns: Cost, Date, Total Tokens.
- convert_document: Convert a document between formats (md, pdf, docx, html, txt). Supports AI-powered markdown formatting.
- format_document: Format a markdown file in-place using the LLM formatter.
- render_video: Render a Remotion composition to MP4 video (currently supports StickmanFight).
- download_youtube_subtitles: Download a YouTube video's transcript, optionally format with an LLM.

Provide clear, concise results. When tools return data, summarize the key findings.`;

export function buildToolsArray(): ChatToolSpec[] {
  return [
    {
      type: "function",
      function: {
        name: "ping",
        description: "Health check — verify the command center server status and version.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "analyze_csv",
        description:
          "Analyze a CSV file for totals, daily breakdown, cost tiers, and top 5 most expensive rows. Expects columns: Cost, Date, Total Tokens.",
        parameters: {
          type: "object",
          properties: {
            csvPath: {
              type: "string",
              description: "Absolute path to the CSV file to analyze.",
            },
          },
          required: ["csvPath"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "convert_document",
        description:
          "Convert a document between formats (md, pdf, docx, html, txt). Supports optional AI-powered markdown formatting.",
        parameters: {
          type: "object",
          properties: {
            inputPath: { type: "string", description: "Absolute path to the input file" },
            outputFormat: {
              type: "string",
              enum: ["md", "pdf", "docx", "html", "txt"],
              description: "Target format",
            },
            aiFormat: { type: "boolean", description: "Run LLM-powered markdown formatter when output is md" },
          },
          required: ["inputPath"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "format_document",
        description: "Format a markdown file in-place using the LLM formatter. Reads the file, sends it to the formatter, writes the cleaned-up result back.",
        parameters: {
          type: "object",
          properties: {
            inputPath: { type: "string", description: "Absolute path to the markdown file" },
            outputPath: { type: "string", description: "Optional output path. Same as input if omitted." },
          },
          required: ["inputPath"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "render_video",
        description:
          "Render a Remotion composition to MP4 (or transparent WebM with transparent=true). Compositions: TitleCard, InfoCard, LowerThird, OutroBumper, BulletList, ScriptVideo.",
        parameters: {
          type: "object",
          properties: {
            compositionId: {
              type: "string",
              enum: ["TitleCard", "InfoCard", "LowerThird", "OutroBumper", "BulletList", "ScriptVideo"],
              description: "Remotion composition id to render",
            },
            props: {
              type: "object",
              description: "Per-composition props object (title, colors, bullets, etc.). For ScriptVideo, pass {blocks: [{kind, startFrame, durationFrames, payload}, ...]}.",
            },
            outputPath: {
              type: "string",
              description: "Absolute path for the output file. If transparent=true, must end in .webm; otherwise .mp4.",
            },
            transparent: {
              type: "boolean",
              description: "Render with VP8 + alpha for compositing. Output must be .webm.",
            },
          },
          required: ["compositionId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "compose_from_script",
        description:
          "Render a full video from a Markdown production script. Each block line is [HH:MM:SS → HH:MM:SS] <kind>: <payload>. Kinds: title-card, info-card, lower-third, outro-bumper, bullet-list, quote-card, blank.",
        parameters: {
          type: "object",
          properties: {
            scriptPath: {
              type: "string",
              description: "Absolute path to the .md production script",
            },
            outputPath: {
              type: "string",
              description: "Absolute path for the output MP4. Default: command_center/cache/videos/<script-basename>.mp4",
            },
          },
          required: ["scriptPath"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "download_youtube_subtitles",
        description:
          "Download a YouTube video's transcript, optionally format it with an LLM, and save it as md, txt, or zip.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "YouTube URL or 11-character video ID" },
            format: { type: "string", enum: ["md", "txt", "zip", "raw"], description: "Output format" },
            formatWithLLM: { type: "boolean", description: "Format the transcript with an LLM" },
          },
          required: ["url"],
        },
      },
    },
  ];
}

async function executeBackendTool(name: string, args: Record<string, unknown>): Promise<string> {
  const res = await fetch("/api/tools/call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, arguments: args }),
  });
  const data = await res.json();
  if (data.isError) {
    throw new Error(data.content?.[0]?.text || "Tool error");
  }
  return data.content?.map((c: { type: string; text: string }) => c.text).join("\n") || "Done";
}

function makeMsg(
  role: ChatMessage["role"],
  content: string,
  extra?: Partial<ChatMessage>
): ChatMessage {
  return { id: generateId(), role, content, timestamp: Date.now(), ...extra };
}

type SseEvent =
  | { event: "meta"; data: { model: string; baseURL: string } }
  | { event: "text"; data: { delta: string } }
  | { event: "tool_call_delta"; data: { index: number; id?: string; name?: string; arguments?: string } }
  | { event: "finish"; data: { reason: string } }
  | { event: "done"; data: {} }
  | { event: "error"; data: { message: string } };

async function* streamChatCompletion(
  messages: Record<string, unknown>[],
  tools: ChatToolSpec[],
  model: string
): AsyncGenerator<SseEvent> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, tools, model }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Chat server error (${res.status}): ${text || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      let event = "message";
      const dataLines: string[] = [];
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event: ")) {
          event = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          dataLines.push(line.slice(6));
        }
      }
      const dataStr = dataLines.join("\n");
      if (!dataStr) continue;
      try {
        const data = JSON.parse(dataStr);
        yield { event, data } as SseEvent;
      } catch {
        continue;
      }
    }
  }
}

export type ChatCallback = (message: ChatMessage) => void;

export async function runChat(
  userMessage: string,
  onMessage: ChatCallback,
  onReplace: (id: string, msg: ChatMessage) => void,
  opts: { history: Record<string, unknown>[]; model: string }
): Promise<{ messages: ChatMessage[]; updatedHistory: Record<string, unknown>[] }> {
  const { history, model } = opts;
  const resultMessages: ChatMessage[] = [];
  const messages: Record<string, unknown>[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userMessage },
  ];

  const tools = buildToolsArray();
  let iterations = 0;
  const maxIterations = 10;

  while (iterations < maxIterations) {
    iterations++;

    const assistantMsg = makeMsg("assistant", "");
    assistantMsg.streaming = true;
    onMessage(assistantMsg);

    let fullText = "";
    const toolCallAccumulator = new Map<number, { id: string; name: string; arguments: string }>();
    let finishReason = "stop";

    try {
      for await (const evt of streamChatCompletion(messages, tools, model)) {
        if (evt.event === "text") {
          fullText += evt.data.delta;
          assistantMsg.content = fullText;
          onReplace(assistantMsg.id, { ...assistantMsg });
        } else if (evt.event === "tool_call_delta") {
          const { index, id, name, arguments: argsChunk } = evt.data;
          const existing = toolCallAccumulator.get(index) || { id: "", name: "", arguments: "" };
          if (id) existing.id = id;
          if (name) existing.name = name;
          if (argsChunk) existing.arguments += argsChunk;
          toolCallAccumulator.set(index, existing);
        } else if (evt.event === "finish") {
          finishReason = evt.data.reason;
        } else if (evt.event === "error") {
          throw new Error(evt.data.message);
        }
      }
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      const isKeyError = errMessage.includes("API key") || errMessage.includes("401") || errMessage.includes("503");
      assistantMsg.content = isKeyError
        ? `LLM error: ${errMessage}\n\n` +
          `Make sure LLM_API_KEY (or NVIDIA_API_KEY / ANTHROPIC_API_KEY) is set in the environment where you started the dashboard, and that LLM_BASE_URL / LLM_MODEL point to your provider.`
        : `Error: ${errMessage}`;
      assistantMsg.streaming = false;
      onReplace(assistantMsg.id, assistantMsg);
      resultMessages.push(assistantMsg);
      break;
    }

    const toolCalls: ToolCallInfo[] = Array.from(toolCallAccumulator.entries())
      .sort(([a], [b]) => a - b)
      .map(([, v], i) => ({
        id: v.id || `tc-${i}-${Date.now()}`,
        name: v.name || "unknown",
        arguments: v.arguments || "{}",
        status: "pending" as const,
      }));

    assistantMsg.streaming = false;
    assistantMsg.content = fullText;
    if (toolCalls.length > 0) assistantMsg.toolCalls = toolCalls;
    onReplace(assistantMsg.id, assistantMsg);
    resultMessages.push(assistantMsg);

    if (toolCalls.length === 0 || finishReason === "stop") {
      messages.push({ role: "assistant", content: fullText });
      break;
    }

    const openaiToolCalls = toolCalls.map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: { name: tc.name, arguments: tc.arguments },
    }));
    messages.push({ role: "assistant", content: fullText || null, tool_calls: openaiToolCalls } as any);

    for (const tc of toolCalls) {
      tc.status = "running";
      onReplace(assistantMsg.id, { ...assistantMsg });

      let resultText: string;
      try {
        const parsedArgs = JSON.parse(tc.arguments || "{}");
        resultText = await executeBackendTool(tc.name, parsedArgs);
        tc.status = "done";
        tc.result = resultText;
      } catch (err) {
        resultText = `Error: ${err instanceof Error ? err.message : String(err)}`;
        tc.status = "error";
        tc.result = resultText;
      }

      onReplace(assistantMsg.id, { ...assistantMsg });

      const toolMsg = makeMsg("tool", resultText, { toolCallId: tc.id });
      onMessage(toolMsg);
      resultMessages.push(toolMsg);

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: resultText,
      } as any);
    }
  }

  return { messages: resultMessages, updatedHistory: messages.slice(1) };
}
