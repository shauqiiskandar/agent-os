import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname, parse } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = "D:\\ai-sandbox\\markdown-formatter\\personal";
const DEFAULT_PORT = 3001;
const BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}`;
const OUT_DIR = resolve(__dirname, "..", "cache", "converted_docs");

let serverProcess = null;
let serverReady = null;

export const formatDocumentTool = {
  name: "format_document",
  description:
    "AI-format a markdown file in place using the LLM formatter (OpenRouter). " +
    "Reads the file, sends its content to the markdown-formatter server's /api/format-markdown endpoint, " +
    "and writes the cleaned-up result back. " +
    "Auto-starts the markdown-formatter server if it's not already running. " +
    "Requires a working endpoint in D:\\ai-sandbox\\markdown-formatter\\personal\\config.js.",
  inputSchema: {
    type: "object",
    properties: {
      inputPath: {
        type: "string",
        description: "Absolute path to the markdown file to format.",
      },
      outputPath: {
        type: "string",
        description:
          "Optional absolute path for the formatted output. " +
          "If omitted, the original file is overwritten.",
      },
    },
    required: ["inputPath"],
  },
};

export async function handleFormatDocument(args) {
  const { inputPath, outputPath } = args;
  if (!inputPath) {
    return errorResult("inputPath is required");
  }

  const absInput = resolve(inputPath);
  let content;
  try {
    content = await readFile(absInput, "utf-8");
  } catch {
    return errorResult(`Input file not found: ${absInput}`);
  }

  let serverError;
  try {
    await ensureServer();
  } catch (err) {
    serverError = err;
  }
  if (serverError) {
    return errorResult(
      `Failed to start markdown-formatter server: ${serverError.message}\n` +
        `Project dir: ${PROJECT_DIR}`
    );
  }

  let res;
  try {
    res = await fetch(`${BASE_URL}/api/format-markdown`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    return errorResult(
      `HTTP request to markdown-formatter failed: ${err.message}. ` +
        `Is the server running at ${BASE_URL}?`
    );
  }

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 500);
    } catch {
      // ignore
    }
    return errorResult(`markdown-formatter returned HTTP ${res.status}\n${detail}`);
  }

  const { formatted } = await res.json();
  const absOutput = outputPath ? resolve(outputPath) : absInput;
  await mkdir(dirname(absOutput), { recursive: true });
  await writeFile(absOutput, formatted, "utf-8");

  return {
    content: [
      {
        type: "text",
        text:
          `input:    ${absInput}\n` +
          `output:   ${absOutput}\n` +
          `original: ${content.length} chars\n` +
          `formatted: ${formatted.length} chars\n`,
      },
    ],
  };
}

function errorResult(text) {
  return { content: [{ type: "text", text }], isError: true };
}

async function ensureServer() {
  if (serverReady) return serverReady;

  const health = await pingServer();
  if (health.ok) {
    serverReady = Promise.resolve();
    return serverReady;
  }

  serverReady = new Promise((resolveReady, rejectReady) => {
    const child = spawn("node", ["server.js"], {
      cwd: PROJECT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    serverProcess = child;

    let resolved = false;
    const onChunk = (chunk) => {
      const s = chunk.toString();
      if (!resolved && s.includes("Server running")) {
        resolved = true;
        setTimeout(resolveReady, 150);
      }
    };
    child.stdout.on("data", onChunk);
    child.stderr.on("data", (d) => process.stderr.write(`[md-fmt] ${d}`));

    child.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        rejectReady(err);
      }
    });
    child.on("exit", (code) => {
      serverProcess = null;
      serverReady = null;
      if (!resolved) {
        resolved = true;
        rejectReady(new Error(`server exited (code ${code}) before becoming ready`));
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        rejectReady(new Error("Timed out waiting for server to print 'Server running'"));
      }
    }, 15000);
  });

  return serverReady;
}

async function pingServer() {
  try {
    const res = await fetch(`${BASE_URL}/api/formats`, {
      signal: AbortSignal.timeout(1500),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

const shutdown = () => {
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch {
      // ignore
    }
    serverProcess = null;
  }
};
process.on("exit", shutdown);
process.on("SIGINT", () => { shutdown(); process.exit(0); });
process.on("SIGTERM", () => { shutdown(); process.exit(0); });
