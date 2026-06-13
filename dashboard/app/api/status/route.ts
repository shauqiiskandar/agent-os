import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = "D:\\ai-sandbox\\command_center";

async function getInstalledToolCount(): Promise<number> {
  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(join(ROOT, "tools"));
    return entries.filter(e => e.endsWith(".mjs")).length;
  } catch {
    return 8;
  }
}

function getLlmConfig() {
  const key =
    process.env.LLM_API_KEY ||
    process.env.NVIDIA_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_AUTH_TOKEN ||
    "";
  const baseUrl =
    process.env.LLM_BASE_URL ||
    process.env.NVIDIA_BASE_URL ||
    process.env.ANTHROPIC_BASE_URL ||
    "";
  const model =
    process.env.LLM_MODEL ||
    process.env.NVIDIA_MODEL ||
    process.env.ANTHROPIC_MODEL ||
    "";
  return {
    keyConfigured: !!key,
    modelConfigured: !!(model || baseUrl || key),
    baseUrl,
    model,
  };
}

export async function GET() {
  try {
    const serverPath = join(ROOT, "server", "index.mjs");
    let serverExists = false;
    try {
      await readFile(serverPath);
      serverExists = true;
    } catch {
      serverExists = false;
    }

    const toolCount = await getInstalledToolCount();
    const llm = getLlmConfig();

    return NextResponse.json({
      ok: true,
      mode: "dashboard",
      port: 3000,
      host: "127.0.0.1",
      toolCount,
      modelConfigured: llm.modelConfigured,
      model: llm.model,
      keyConfigured: llm.keyConfigured,
      baseUrl: llm.baseUrl,
      projectRoot: ROOT,
      serverFilePresent: serverExists,
      version: "1.0.0",
      note: "Command Center MCP server runs separately via `node server/index.mjs`. Dashboard chat uses LLM_API_KEY / LLM_BASE_URL / LLM_MODEL env vars (NVIDIA, OpenAI, OpenRouter all work via OpenAI-compatible endpoint).",
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      mode: "dashboard",
      port: 3000,
      host: "127.0.0.1",
      toolCount: 6,
      modelConfigured: false,
      keyConfigured: false,
      baseUrl: "",
      projectRoot: ROOT,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
