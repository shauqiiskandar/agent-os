import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { resolve, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = "D:\\ai-sandbox\\vid\\remotion";
const ENTRY_FILE = "src/index.ts";
const DEFAULT_OUT_DIR = resolve(__dirname, "..", "cache", "videos");
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

const VALID_COMPOSITIONS = ["TitleCard", "InfoCard", "LowerThird", "OutroBumper", "BulletList", "ScriptVideo"];

export const renderVideoTool = {
  name: "render_video",
  description:
    "Render a Remotion composition to MP4 (or transparent WebM with --transparent) " +
    "using the vid/remotion project (D:\\ai-sandbox\\vid\\remotion). " +
    "Available compositions: TitleCard, InfoCard, LowerThird, OutroBumper, BulletList, ScriptVideo. " +
    "ScriptVideo renders a full video from a `blocks` array per the ScriptVideo timeline format. " +
    "First render downloads/extracts Chromium if not cached, which can take several minutes; subsequent renders are faster. " +
    "Returns the absolute path of the output file.",
  inputSchema: {
    type: "object",
    properties: {
      compositionId: {
        type: "string",
        enum: VALID_COMPOSITIONS,
        description: "Remotion composition id to render",
        default: "TitleCard",
      },
      props: {
        type: "object",
        description:
          "Props for the composition (per-composition schema). For ScriptVideo, pass `{blocks: [{kind, startFrame, durationFrames, payload}, ...]}`.",
      },
      outputPath: {
        type: "string",
        description:
          "Absolute path for the output file. If transparent=true, must end in .webm. Otherwise .mp4. " +
          "If omitted, defaults to command_center/cache/videos/<compositionId><.ext>.",
      },
      transparent: {
        type: "boolean",
        description:
          "When true, render with VP8 codec + YUVA420P pixel format so the output has an alpha channel. Useful for compositing. Adds '.webm' to default extension. Default: false (h264 mp4).",
        default: false,
      },
      durationInFrames: {
        type: "number",
        description:
          "Optional override for composition duration in frames. Useful for ScriptVideo when total duration differs from default.",
      },
      fps: {
        type: "number",
        description: "Optional override of fps (default 30).",
      },
    },
    required: ["compositionId"],
  },
};

export async function handleRenderVideo(args) {
  const compositionId = String(args.compositionId || "TitleCard");

  if (!VALID_COMPOSITIONS.includes(compositionId)) {
    return errorResult(
      `Unknown compositionId: "${compositionId}". Valid: ${VALID_COMPOSITIONS.join(", ")}.`
    );
  }

  const transparent = args.transparent === true;
  const defaultExt = transparent ? ".webm" : ".mp4";

  const requestedOut = args.outputPath
    ? (isAbsolute(args.outputPath) ? args.outputPath : resolve(args.outputPath))
    : resolve(DEFAULT_OUT_DIR, `${compositionId}${defaultExt}`);

  if (transparent && !requestedOut.toLowerCase().endsWith(".webm")) {
    return errorResult(`transparent=true requires outputPath to end in .webm: ${requestedOut}`);
  }
  if (!transparent && !requestedOut.toLowerCase().endsWith(".mp4")) {
    return errorResult(`transparent=false requires outputPath to end in .mp4: ${requestedOut}`);
  }

  await mkdir(dirname(requestedOut), { recursive: true });

  const argv = ["remotion", "render", ENTRY_FILE, compositionId, requestedOut];

  if (args.props !== undefined && args.props !== null && args.props !== "") {
    // Windows shell mangles inline JSON in command-line arguments. Pass via a temp file.
    const { writeFile, unlink } = await import("node:fs/promises");
    const propsFile = resolve(
      dirname(requestedOut),
      `.props-${compositionId}-${Date.now()}.json`
    );
    await writeFile(propsFile, JSON.stringify(args.props), "utf8");
    argv.push(`--props=${propsFile}`);
    process.stderr.write(`[render_video] props temp file: ${propsFile}\n`);
  }

  if (transparent) {
    argv.push("--codec=vp8", "--pixel-format=yuva420p");
  }

  process.stderr.write(`[render_video] cwd=${PROJECT_DIR} cmd=${NPX} ${argv.join(" ")}\n`);

  const { code, stdout, stderr } = await runNpx(PROJECT_DIR, argv);

  if (code !== 0) {
    return {
      content: [
        {
          type: "text",
          text:
            `remotion render failed (exit ${code})\n` +
            `--- stdout ---\n${stdout.trim()}\n` +
            `--- stderr ---\n${stderr.trim()}`,
        },
      ],
      isError: true,
    };
  }

  let sizeInfo = "";
  try {
    const s = await stat(requestedOut);
    sizeInfo = ` (${(s.size / 1024 / 1024).toFixed(2)} MB)`;
  } catch {}

  return {
    content: [
      {
        type: "text",
        text:
          `composition: ${compositionId}\n` +
          `output:      ${requestedOut}${sizeInfo}\n` +
          `transparent: ${transparent}\n` +
          `entry:       ${PROJECT_DIR}\\${ENTRY_FILE}\n` +
          (args.props ? `props:       ${JSON.stringify(args.props)}\n` : ""),
      },
    ],
  };
}

function errorResult(text) {
  return { content: [{ type: "text", text }], isError: true };
}

function runNpx(cwd, argv) {
  return new Promise((resolveRun) => {
    const child = spawn(NPX, argv, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: true,
    });
    const outChunks = [];
    const errChunks = [];
    child.stdout.on("data", (d) => {
      const s = typeof d === "string" ? d : d.toString("utf8");
      outChunks.push(s);
      process.stderr.write(`[remotion] ${s}`);
    });
    child.stderr.on("data", (d) => {
      const s = typeof d === "string" ? d : d.toString("utf8");
      errChunks.push(s);
      process.stderr.write(`[remotion] ${s}`);
    });
    child.on("error", (err) => {
      resolveRun({
        code: -1,
        stdout: outChunks.join(""),
        stderr: `spawn npx failed: ${err.message}\n` + errChunks.join(""),
      });
    });
    child.on("close", (code) => {
      resolveRun({
        code: code ?? -1,
        stdout: outChunks.join(""),
        stderr: errChunks.join(""),
      });
    });
  });
}
