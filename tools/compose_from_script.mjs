import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT_DIR = resolve(__dirname, "..", "cache", "videos");
const FPS = 30;

const VALID_KINDS = ["title-card", "info-card", "lower-third", "outro-bumper", "bullet-list", "quote-card", "blank"];

export const composeFromScriptTool = {
  name: "compose_from_script",
  description:
    "Render a complete video from a Markdown production script. Each block line in the script is " +
    "[HH:MM:SS → HH:MM:SS] <kind>: <payload>. Kinds: " + VALID_KINDS.join(", ") + ". " +
    "Continuation lines (key: value) attach to the previous block. The script is parsed into a " +
    "ScriptVideo timeline and rendered via the Remotion ScriptVideo composition. " +
    "Output is a single MP4. Path to script is required. Output path is optional (defaults to " +
    "command_center/cache/videos/<script-basename>.mp4). Returns the absolute path of the output MP4.",
  inputSchema: {
    type: "object",
    properties: {
      scriptPath: {
        type: "string",
        description: "Absolute path to the .md production script",
      },
      outputPath: {
        type: "string",
        description: "Absolute path for the output MP4. If omitted, defaults to command_center/cache/videos/<script-basename>.mp4",
      },
      fps: {
        type: "number",
        description: "Frames per second. Default 30.",
      },
    },
    required: ["scriptPath"],
  },
};

function parseTimestamp(str) {
  const m = String(str).trim().match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, hh, mm, ss] = m;
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss);
}

function timeToFrames(secs, fps) {
  return Math.max(0, Math.round(secs * fps));
}

function formatKind(name) {
  return VALID_KINDS.includes(name) ? name : null;
}

function parsePayloadLines(rawText, kind) {
  const lines = rawText.split(/\r?\n/);
  const payload = {};
  const bullets = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const value = trimmed.slice(colonIdx + 1).trim();

    if (!value && key === "bullets") continue;

    if (key === "bullets") {
      const m = value.match(/^\[(.*)\]$/s);
      if (m) {
        const items = m[1].split(",").map((s) => s.trim()).filter(Boolean);
        for (const it of items) bullets.push(it.replace(/^["']|["']$/g, ""));
      } else if (value) {
        bullets.push(value.replace(/^["']|["']$/g, ""));
      }
      continue;
    }

    if (
      key === "title" ||
      key === "subtitle" ||
      key === "name" ||
      key === "description" ||
      key === "brand" ||
      key === "tagline" ||
      key === "heading" ||
      key === "attribution" ||
      key === "quote" ||
      key === "primary-color" ||
      key === "primarycolor" ||
      key === "accent-color" ||
      key === "accentcolor" ||
      key === "position" ||
      key === "c1" ||
      key === "c2"
    ) {
      payload[normalizeKey(key)] = value.replace(/^["']|["']$/g, "");
    }
  }

  if (bullets.length > 0) {
    payload.bullets = bullets;
  }

  return payload;
}

function normalizeKey(k) {
  if (k === "primary-color" || k === "primarycolor") return "primaryColor";
  if (k === "accent-color" || k === "accentcolor") return "accentColor";
  return k;
}

function parseScriptText(text, fps) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let pending = null;

  const headerRe = /^\s*\[(\d{1,2}:\d{2}:\d{2})\s*[→\->]\s*(\d{1,2}:\d{2}:\d{2})\]\s*(.+?)\s*$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#") && trimmed.length > 1 && !trimmed.startsWith("# ")) continue;
    if (trimmed.startsWith("//") || trimmed.startsWith(";")) continue;

    const m = trimmed.match(headerRe);
    if (m) {
      if (pending) blocks.push(pending);
      const [, startStr, endStr, kindRaw] = m;
      const startSecs = parseTimestamp(startStr);
      const endSecs = parseTimestamp(endStr);
      if (startSecs === null || endSecs === null || endSecs <= startSecs) {
        continue;
      }
      const kind = formatKind(kindRaw.toLowerCase());
      if (!kind) continue;
      const headerBody = trimmed.replace(headerRe, "").trim();
      pending = {
        kind,
        startFrame: timeToFrames(startSecs, fps),
        durationFrames: timeToFrames(endSecs - startSecs, fps),
        payload: {},
        _restOfHeader: headerBody,
      };
      continue;
    }

    if (pending) {
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) {
        if (pending._restOfHeader) {
          const k = pending.kind;
          if (k === "title-card") pending.payload.title = (pending._restOfHeader + " " + trimmed).trim();
          else if (k === "info-card") pending.payload.heading = (pending._restOfHeader + " " + trimmed).trim();
          else if (k === "lower-third") pending.payload.name = (pending._restOfHeader + " " + trimmed).trim();
          else if (k === "outro-bumper") pending.payload.brand = (pending._restOfHeader + " " + trimmed).trim();
          else if (k === "bullet-list") pending.payload.heading = (pending._restOfHeader + " " + trimmed).trim();
          else if (k === "quote-card") pending.payload.quote = (pending._restOfHeader + " " + trimmed).trim();
          pending._restOfHeader = "";
        }
        continue;
      }

      const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
      const value = trimmed.slice(colonIdx + 1).trim();
      if (key === "bullets") {
        const m2 = value.match(/^\[(.*)\]$/s);
        if (m2) {
          pending.payload.bullets = m2[1]
            .split(",")
            .map((s) => s.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean);
        }
      } else {
        pending.payload[normalizeKey(key)] = value.replace(/^["']|["']$/g, "");
      }
    }
  }

  if (pending) blocks.push(pending);

  for (const b of blocks) delete b._restOfHeader;

  return blocks;
}

export async function handleComposeFromScript(args) {
  if (!args?.scriptPath) {
    return errorResult("scriptPath is required.");
  }
  const scriptPath = isAbsolute(args.scriptPath) ? args.scriptPath : resolve(args.scriptPath);
  const fps = Number(args.fps || FPS);

  let text;
  try {
    text = await readFile(scriptPath, "utf8");
  } catch (err) {
    return errorResult(`Failed to read script: ${err.message || err}`);
  }

  const blocks = parseScriptText(text, fps);
  if (blocks.length === 0) {
    return errorResult(
      "No valid blocks parsed. Expected at least one [HH:MM:SS → HH:MM:SS] <kind> line. " +
      "Valid kinds: " + VALID_KINDS.join(", ") + "."
    );
  }

  const scriptBase = scriptPath.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
  const outPath = args.outputPath
    ? (isAbsolute(args.outputPath) ? args.outputPath : resolve(args.outputPath))
    : resolve(DEFAULT_OUT_DIR, `${scriptBase}.mp4`);

  if (!outPath.toLowerCase().endsWith(".mp4")) {
    return errorResult(`outputPath must end in .mp4: ${outPath}`);
  }

  const { mkdir } = await import("node:fs/promises");
  await mkdir(dirname(outPath), { recursive: true });

  const { handleRenderVideo } = await import("./render_video.mjs");
  const result = await handleRenderVideo({
    compositionId: "ScriptVideo",
    outputPath: outPath,
    props: { blocks, fps },
  });

  const summary = [
    `script:        ${scriptPath}`,
    `blocks parsed: ${blocks.length}`,
    `output:        ${outPath}`,
    "",
    "## Block summary",
    ...blocks.map((b, i) => {
      const start = b.startFrame;
      const end = b.startFrame + b.durationFrames;
      const startSecs = (start / fps).toFixed(2);
      const endSecs = (end / fps).toFixed(2);
      const payloadKeys = Object.keys(b.payload).join(", ");
      return `  ${i + 1}. [${startSecs}s → ${endSecs}s] ${b.kind} (${payloadKeys || "default"})`;
    }),
    "",
  ].join("\n");

  if (result.isError) {
    return {
      content: [
        {
          type: "text",
          text: `${summary}\n## Render result\n${result.content?.[0]?.text || "unknown error"}`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: `${summary}${result.content?.[0]?.text || ""}`,
      },
    ],
  };
}

function errorResult(text) {
  return { content: [{ type: "text", text }], isError: true };
}
