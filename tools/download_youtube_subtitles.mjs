import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = "D:\\ai-sandbox\\youtube-subtitle-download-plus-format";
const DEFAULT_PORT = 3002;
const BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}`;
const OUT_DIR = resolve(__dirname, "..", "cache", "youtube_subtitles");

let serverProcess = null;
let serverReady = null;

export const downloadYoutubeSubtitlesTool = {
  name: "download_youtube_subtitles",
  description:
    "Download a YouTube video's transcript, optionally format it with an LLM, " +
    "and return or save it in the specified format (md, txt, zip, raw). " +
    `Auto-starts the subtitle server (${PROJECT_DIR}) if not running.`,
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description:
          "Full YouTube URL or just the 11-character video ID. " +
          'Example: "https://www.youtube.com/watch?v=VIDEO_ID"',
      },
      format: {
        type: "string",
        enum: ["md", "txt", "zip", "raw"],
        default: "md",
        description:
          "Output format. 'md' = formatted markdown, 'txt' = plain text, " +
          "'zip' = both txt+md bundled, 'raw' = return without downloading.",
      },
      downloadToBrowser: {
        type: "boolean",
        default: false,
        description:
          "When true, returns the content for direct browser download instead of saving to disk.",
      },
    },
    required: ["url"],
  },
};

export async function handleDownloadYoutubeSubtitles(args) {
  const {
    url,
    format = "md",
    downloadToBrowser = false,
    formatWithLLM = true,
    llmBaseUrl,
    llmApiKey,
    llmModel,
  } = args;

  if (!url) {
    return errorResult("url is required");
  }

  if (!["md", "txt", "zip", "raw"].includes(format)) {
    return errorResult(
      `Unsupported format: ${format}. Supported: md, txt, zip, raw`
    );
  }

  try {
    await ensureServer();
  } catch (err) {
    return errorResult(
      `Failed to start YouTube subtitle server: ${err.message}\nProject dir: ${PROJECT_DIR}`
    );
  }

  let fetchRes;
  try {
    const res = await fetch(`${BASE_URL}/api/fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "(unable to read error body)");
      return errorResult(`Subtitle server fetch failed (HTTP ${res.status}): ${errText}`);
    }
    fetchRes = await res.json();
  } catch (err) {
    return errorResult(`Failed to fetch transcript: ${err.message}`);
  }

  const { videoId, text: rawText, segments } = fetchRes;

  if (!rawText) {
    return errorResult("No transcript text returned from subtitle server.");
  }

  let content = rawText;
  if ((format === "md" || format === "zip") && formatWithLLM) {
    try {
      const fmtBody = { content: rawText };
      if (llmBaseUrl) fmtBody.baseUrl = llmBaseUrl;
      if (llmApiKey) fmtBody.apiKey = llmApiKey;
      if (llmModel) fmtBody.model = llmModel;

      const res = await fetch(`${BASE_URL}/api/format`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fmtBody),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "(unable to read error body)");
        return errorResult(`LLM formatting failed (HTTP ${res.status}): ${errText}`);
      }
      const fmt = await res.json();
      content = fmt.formatted ?? rawText;
    } catch (err) {
      return errorResult(`LLM formatting request failed: ${err.message}`);
    }
  }

  if (format === "raw") {
    return {
      content: [
        {
          type: "text",
          text: rawText.slice(0, 4000) + (rawText.length > 4000 ? "\n\n... (truncated)" : ""),
        },
      ],
    };
  }

  // Generate filename from content (first H1) or video ID
  const filename = generateFilenameFromContent(content, videoId, format);

  if (downloadToBrowser) {
    const isMd = format === "md";
    const fileContent = isMd ? content : rawText;
    const mimeType = isMd ? "text/markdown" : "text/plain";
    return {
      content: [
        {
          type: "text",
          text: `Ready for download: ${filename}`,
        },
      ],
      download: {
        filename,
        data: Buffer.from(fileContent).toString("base64"),
        mimeType,
      },
    };
  }

  // Legacy: save to disk
  await mkdir(OUT_DIR, { recursive: true });
  const safeVideoId = videoId || "transcript";
  const outPath = join(OUT_DIR, `${safeVideoId}.${format}`);

  if (format === "zip") {
    try {
      const res = await fetch(`${BASE_URL}/api/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { txt: rawText, md: content },
          filename: safeVideoId,
          format: "zip",
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "(unable to read error body)");
        return errorResult(`Download failed (HTTP ${res.status}): ${errText}`);
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      await writeFile(outPath, buffer);
      return {
        content: [
          {
            type: "text",
            text: `videoId: ${videoId}\nsegments: ${segments}\noutput: ${outPath} (${buffer.length} bytes)\nformat: zip`,
          },
        ],
      };
    } catch (err) {
      return errorResult(`Download zip failed: ${err.message}`);
    }
  } else {
    const isMd = format === "md";
    const fileContent = isMd ? content : rawText;
    const buffer = Buffer.from(fileContent, "utf-8");
    await writeFile(outPath, buffer);
    return {
      content: [
        {
          type: "text",
          text: `videoId: ${videoId}\nsegments: ${segments}\noutput: ${outPath} (${buffer.length} bytes)\nformat: ${format}\nformattedWithLLM: ${isMd ? "true" : "false"}`,
        },
      ],
    };
  }
}

function generateFilenameFromContent(content, videoId, format) {
  // Try to extract the first H1 from markdown
  const h1Match = content.match(/^#\s*(.+)$/m);
  if (h1Match) {
    const title = h1Match[1].trim();
    const sanitized = sanitizeFilename(title);
    return `${sanitized}.${format}`;
  }
  // Fallback to video ID
  return `${videoId || "transcript"}.${format}`;
}

function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")  // Remove special chars
    .trim()
    .replace(/\s+/g, "-")            // Replace spaces with -
    .replace(/-+/g, "-")             // Collapse multiple dashes
    .substring(0, 80);               // Keep length reasonable
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
    let stderrData = "";

    const onStdout = (chunk) => {
      const s = chunk.toString();
      if (!resolved && s.includes("Server running")) {
        resolved = true;
        setTimeout(() => {
          resolveReady();
        }, 150);
      }
    };

    const onStderr = (chunk) => {
      const s = chunk.toString();
      stderrData += s;
      process.stderr.write(`[yt-subtitle] ${s}`);
    };

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);

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
        const reason = stderrData.trim() || "(no error output)";
        rejectReady(
          new Error(
            `server exited (code ${code}) before becoming ready. ` +
            `Did a different process already claim port ${DEFAULT_PORT}? ` +
            `Or the server may have a startup error. Stderr: ${reason.slice(0, 500)}`
          )
        );
      }
    });

    // If the server takes longer than expected, maybe something is wrong
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        const reason = stderrData.trim() || "(no error output)";
        rejectReady(
          new Error(
            `Timed out waiting for subtitle server (15s). ` +
            `Stderr: ${reason.slice(0, 500)}`
          )
        );
      }
    }, 15000);
  });

  return serverReady;
}

async function pingServer() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, {
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
    } catch {}
    serverProcess = null;
  }
};
process.on("exit", shutdown);
process.on("SIGINT", () => { shutdown(); process.exit(0); });
process.on("SIGTERM", () => { shutdown(); process.exit(0); });
