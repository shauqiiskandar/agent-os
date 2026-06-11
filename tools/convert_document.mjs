import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve, dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = "D:\\ai-sandbox\\markdown-formatter\\personal";
const DEFAULT_PORT = 3001;
const BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}`;
const OUT_DIR = resolve(__dirname, "..", "cache", "converted_docs");

const SUPPORTED_INPUT_EXTS = [".pdf", ".docx", ".md", ".txt"];
const SUPPORTED_OUTPUT_FORMATS = ["md", "pdf", "docx", "html", "txt"];

let serverProcess = null;
let serverReady = null;

export const convertDocumentTool = {
  name: "convert_document",
  description:
    "Convert a document (PDF, DOCX, MD, TXT) into another format using the markdown-formatter project " +
    "(D:\\ai-sandbox\\markdown-formatter\\personal\\). Supports output formats: md, pdf, docx, html, txt. " +
    "When outputFormat=md and aiFormat=true (default), the markdown is cleaned up by an LLM formatter " +
    "(OpenRouter, configured in D:\\ai-sandbox\\markdown-formatter\\personal\\config.js). " +
    "Returns the absolute path of the converted file.",
  inputSchema: {
    type: "object",
    properties: {
      inputPath: {
        type: "string",
        description: "Absolute path to the input file (.pdf, .docx, .md, or .txt).",
      },
      outputFormat: {
        type: "string",
        enum: SUPPORTED_OUTPUT_FORMATS,
        description: "Target format.",
      },
      aiFormat: {
        type: "boolean",
        default: true,
        description:
          "When outputFormat=md, run the LLM-powered markdown formatter. Ignored for other formats. " +
          "Requires a working endpoint in D:\\ai-sandbox\\markdown-formatter\\personal\\config.js.",
      },
    },
    required: ["inputPath", "outputFormat"],
  },
};

export async function handleConvertDocument(args) {
  const { inputPath, outputFormat, aiFormat = true } = args;
  if (!inputPath) {
    return errorResult("inputPath is required");
  }
  if (!SUPPORTED_OUTPUT_FORMATS.includes(outputFormat)) {
    return errorResult(
      `Unsupported outputFormat: ${outputFormat}. Supported: ${SUPPORTED_OUTPUT_FORMATS.join(", ")}`
    );
  }

  const absInput = resolve(inputPath);
  let inputStat;
  try {
    inputStat = await stat(absInput);
  } catch {
    return errorResult(`Input file not found: ${absInput}`);
  }
  if (!inputStat.isFile()) {
    return errorResult(`Not a file: ${absInput}`);
  }

  const { ext, name } = parse(absInput);
  const inputExt = ext.toLowerCase();
  if (!SUPPORTED_INPUT_EXTS.includes(inputExt)) {
    return errorResult(
      `Unsupported input extension: ${inputExt}. Supported: ${SUPPORTED_INPUT_EXTS.join(", ")}`
    );
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

  const buffer = await readFile(absInput);
  const originalName = name + ext;
  const form = new FormData();
  form.set("file", new Blob([buffer]), originalName);
  form.set("format", outputFormat);
  if (outputFormat === "md" && aiFormat) {
    form.set("aiFormat", "true");
  }

  let res;
  try {
    res = await fetch(`${BASE_URL}/api/convert`, { method: "POST", body: form });
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
    return errorResult(
      `markdown-formatter returned HTTP ${res.status}\n${detail}`
    );
  }

  const outBuf = Buffer.from(await res.arrayBuffer());
  const outName = `${name}.${outputFormat}`;
  const outPath = join(OUT_DIR, outName);
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(outPath, outBuf);

  const contentType = res.headers.get("content-type") || "(none)";
  return {
    content: [
      {
        type: "text",
        text:
          `input:   ${absInput} (${inputStat.size} bytes)\n` +
          `output:  ${outPath} (${outBuf.length} bytes)\n` +
          `format:  ${outputFormat}\n` +
          `aiFormat: ${outputFormat === "md" ? String(!!aiFormat) : "n/a"}\n` +
          `content-type: ${contentType}\n`,
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
    child.on("exit", async (code) => {
      serverProcess = null;
      serverReady = null;
      if (!resolved) {
        // Server exited before "ready": maybe port is already taken
        const secondHealth = await pingServer();
        if (secondHealth.ok) {
          resolved = true;
          resolveReady();
          return;
        }
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
