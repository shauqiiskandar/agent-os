import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = "D:\\ai-sandbox\\command_center";

async function getInstalledToolCount(): Promise<number> {
  try {
    // Check tools directory for .mjs files
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(join(ROOT, "tools"));
    return entries.filter(e => e.endsWith(".mjs")).length;
  } catch {
    return 6; // Fallback to known count
  }
}

export async function GET() {
  try {
    // Check if the MCP server main file exists as a simple health indicator
    const serverPath = join(ROOT, "server", "index.mjs");
    let serverExists = false;
    try {
      await readFile(serverPath);
      serverExists = true;
    } catch {
      serverExists = false;
    }

    const toolCount = await getInstalledToolCount();

    return NextResponse.json({
      ok: true,
      mode: "dashboard",
      port: 3000,
      host: "127.0.0.1",
      toolCount,
      modelConfigured: !!process.env.ANTHROPIC_MODEL,
      keyConfigured: !!process.env.ANTHROPIC_API_KEY,
      baseUrl: process.env.ANTHROPIC_BASE_URL || "https://opencode.ai/zen",
      projectRoot: ROOT,
      serverFilePresent: serverExists,
      version: "1.0.0",
      note: "Command Center MCP server is run separately via `node server/index.mjs`",
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
