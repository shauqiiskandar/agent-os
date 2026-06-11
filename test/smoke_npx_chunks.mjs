// Verify the runNpx chunk-type fix without re-rendering video.
// Replicates the runNpx function from tools/render_video.mjs against `node -e`.
import { spawn } from "node:child_process";

const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

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
    });
    child.stderr.on("data", (d) => {
      const s = typeof d === "string" ? d : d.toString("utf8");
      errChunks.push(s);
    });
    child.on("error", (err) => {
      resolveRun({
        code: -1,
        stdout: outChunks.join(""),
        stderr: `spawn failed: ${err.message}\n` + errChunks.join(""),
      });
    });
    child.on("close", (code) => {
      resolveRun({
        code: code ?? -1,
        stdout: outChunks.join(""),
        stderr: errChunks.join(""),
        sampleTypes: { outFirst: typeof outChunks[0], errFirst: typeof errChunks[0] },
      });
    });
  });
}

const r = await runNpx(process.cwd(), ["--version"]);
console.log("exit:", r.code);
console.log("stdout:", JSON.stringify(r.stdout));
console.log("stderr:", JSON.stringify(r.stderr));
console.log("chunk types:", r.sampleTypes);
