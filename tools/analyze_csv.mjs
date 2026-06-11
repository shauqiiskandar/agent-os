import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, "..", "cache", "csv_runs");
const PROJECT_DIR = "D:\\ai-sandbox\\csv_analyzer";
const SCRIPT = join(PROJECT_DIR, "analyze.py");

export const analyzeCsvTool = {
  name: "analyze_csv",
  description:
    "Analyze a CSV file using the csv_analyzer project (D:\\ai-sandbox\\csv_analyzer\\analyze.py). " +
    "Expects columns: Cost, Date, Total Tokens. Returns totals, daily breakdown, cost-tier breakdown, and top 5 most expensive rows as text. " +
    "Wraps the project script in a temp directory so the original CSV is never modified.",
  inputSchema: {
    type: "object",
    properties: {
      csvPath: {
        type: "string",
        description: "Absolute path to the CSV file to analyze.",
      },
    },
    required: ["csvPath"],
  },
};

export async function handleAnalyzeCsv(args) {
  const csvPath = args.csvPath;
  if (!csvPath) {
    return {
      content: [{ type: "text", text: "csvPath is required" }],
      isError: true,
    };
  }

  const absCsv = resolve(csvPath);
  try {
    await stat(absCsv);
  } catch {
    return {
      content: [{ type: "text", text: `CSV not found: ${absCsv}` }],
      isError: true,
    };
  }

  await mkdir(CACHE_DIR, { recursive: true });
  const tempDir = await mkdtemp(join(CACHE_DIR, "run-"));
  const stagedCsv = join(tempDir, "data.csv");
  await copyFile(absCsv, stagedCsv);

  const pythonCmd = process.env.CC_PYTHON || "python";

  try {
    const { stdout, stderr, code } = await runPython(pythonCmd, SCRIPT, tempDir);
    if (code !== 0) {
      return {
        content: [
          {
            type: "text",
            text:
              `analyze.py exited with code ${code}\n` +
              `--- stderr ---\n${stderr.trim()}\n` +
              `--- stdout ---\n${stdout.trim()}`,
          },
        ],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text:
            `csvPath: ${absCsv}\n` +
            `project: ${PROJECT_DIR}\n\n` +
            stdout.trim(),
        },
      ],
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function runPython(cmd, scriptName, cwd) {
  return new Promise((resolveRun) => {
    const child = spawn(cmd, [scriptName], { cwd, windowsHide: true });
    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on("data", (d) => stdoutChunks.push(d));
    child.stderr.on("data", (d) => stderrChunks.push(d));
    child.on("error", (err) => {
      resolveRun({
        code: -1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: `Failed to spawn ${cmd}: ${err.message}\n` + Buffer.concat(stderrChunks).toString("utf8"),
      });
    });
    child.on("close", (code) => {
      resolveRun({
        code: code ?? -1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    });
  });
}
