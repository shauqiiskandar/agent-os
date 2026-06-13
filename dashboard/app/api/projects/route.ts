import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function GET() {
  try {
    const root = "D:\\ai-sandbox\\command_center";
    const registry = await readFile(join(root, "REGISTRY.md"), "utf-8");
    const progress = await readFile(join(root, "PROGRESS.md"), "utf-8");
    const agents = await readFile(join(root, "AGENTS.md"), "utf-8");

    const projects: any[] = [];
    const lines = registry.split("\n");
    let inTable = false;

    for (const line of lines) {
      if (line.includes("| Project") && line.includes("Path")) {
        inTable = true;
        continue;
      }
      if (inTable && line.startsWith("|---")) continue;
      if (inTable && line.startsWith("|")) {
        const cells = line
          .split("|")
          .map((c) => c.trim())
          .filter(Boolean);
        if (cells.length >= 5) {
          projects.push({
            name: cells[0],
            path: cells[1],
            type: cells[2],
            status: cells[3],
            toolName: cells[4].replace(/`/g, ""),
            notes: "",
          });
        }
      } else if (inTable) {
        inTable = false;
      }
    }

    const filtered = projects.filter(
      (p) =>
        p.name &&
        !p.name.startsWith("#") &&
        p.name !== "command_center" &&
        !p.status.includes("Not wrappable")
    );

    // Dedupe by path (and fall back to name). REGISTRY.md has duplicate name rows for
    // some projects; preserve the row with the richer `tool` cell, otherwise first-seen.
    const seen = new Map<string, any>();
    for (const p of filtered) {
      const key = `${p.path}::${p.name}`;
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, p);
      } else if (
        p.toolName &&
        p.toolName !== "—" &&
        (!existing.toolName || existing.toolName === "—")
      ) {
        seen.set(key, p);
      }
    }
    const deduped = Array.from(seen.values());

    // Enrich with progress mentions
    for (const proj of deduped) {
      const mentions = progress
        .split("\n")
        .filter((l) => l.toLowerCase().includes(proj.name.toLowerCase()))
        .slice(0, 3);
      if (mentions.length > 0) {
        proj.notes = mentions.map((m) => m.replace(/^#+\s*/, "").trim()).join("; ");
      }
    }

    return NextResponse.json({
      projects: deduped.length ? deduped : getFallbackProjects(),
      agents: agents.slice(0, 2000),
    });
  } catch (err) {
    return NextResponse.json(
      {
        projects: getFallbackProjects(),
        agents: "",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 200 }
    );
  }
}

function getFallbackProjects() {
  return [
    {
      name: "csv_analyzer",
      path: "D:\\ai-sandbox\\csv_analyzer\\",
      type: "Python script",
      status: "Runnable as-is",
      toolName: "analyze_csv",
      notes: "Wired in v0.1",
    },
    {
      name: "markdown-formatter/personal",
      path: "D:\\ai-sandbox\\markdown-formatter\\personal\\",
      type: "Express server",
      status: "Runnable",
      toolName: "convert_document",
      notes: "Wired in v0.1; reads LLM creds from config.js",
    },
    {
      name: "vid/remotion",
      path: "D:\\ai-sandbox\\vid\\remotion\\",
      type: "Remotion project",
      status: "Runnable",
      toolName: "render_video",
      notes: "Wired in v0.1; `npx remotion render`",
    },
  ];
}
