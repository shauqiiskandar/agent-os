import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { resolve, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = "D:\\ai-sandbox\\vid\\remotion";
const ENTRY_FILE = "src/index.ts";
const DEFAULT_OUT_DIR = resolve(__dirname, "..", "cache", "videos");
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

export const renderVideoTool = {
  name: "render_video",
  description:
    "Render a Remotion composition to MP4 using the vid/remotion project " +
    "(D:\\ai-sandbox\\vid\\remotion). " +
    "Currently exposes the 'StickmanFight' composition (1920x1080, 5s, 30fps). " +
    "First render downloads/extracts Chromium if not cached, which can take several minutes; subsequent renders are faster. " +
    "Returns the absolute path of the output MP4.",
  inputSchema: {
    type: "object",
    properties: {
      compositionId: {
        type: "string",
        description: "Remotion composition id. Currently 'StickmanFight'.",
        default: "StickmanFight",
      },
      outputPath: {
        type: "string",
        description:
          "Absolute path for the output .mp4 file. If the parent dir doesn't exist, it'll be created. " +
          "If omitted, defaults to command_center/cache/videos/<compositionId>.mp4.",
      },
      props: {
        type: "object",
        description:
          "Optional input props for the composition, passed as JSON. The current composition has no props.",
      },
    },
  },
};

export async function handleRenderVideo(args) {
  const compositionId = args.compositionId || "StickmanFight";
  const props = args.props;

  const outPath = args.outputPath
    ? resolve(args.outputPath)
    : resolve(DEFAULT_OUT_DIR, `${compositionId}.mp4`);

  if (!outPath.toLowerCase().endsWith(".mp4")) {
    return errorResult(`outputPath must end in .mp4: ${outPath}`);
  }

  await mkdir(dirname(outPath), { recursive: true });

  const argv = ["remotion", "render", ENTRY_FILE, compositionId, outPath];
  if (props !== undefined) {
    argv.push(`--props=${JSON.stringify(props)}`);
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
    const s = await stat(outPath);
    sizeInfo = ` (${(s.size / 1024 / 1024).toFixed(2)} MB)`;
  } catch {
    // ignore
  }

  return {
    content: [
      {
        type: "text",
        text:
          `composition: ${compositionId}\n` +
          `output:      ${outPath}${sizeInfo}\n` +
          `entry:       ${PROJECT_DIR}\\${ENTRY_FILE}\n` +
          (props ? `props:       ${JSON.stringify(props)}\n` : ""),
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
