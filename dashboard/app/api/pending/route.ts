import { NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

const PENDING_PATHS = [
  join(process.cwd(), "pending.txt"),
  "C:\\Users\\iquah\\Obsidian Vault\\command-center\\pending.md",
];

async function findPendingFile(): Promise<string | null> {
  for (const p of PENDING_PATHS) {
    try {
      await readFile(p, "utf-8");
      return p;
    } catch {
      // continue
    }
  }
  return null;
}

function parsePendingText(raw: string) {
  const lines = raw.split("\n").filter((l) => l.trim());
  return lines.map((line, i) => {
    const done = line.startsWith("[x] ") || line.startsWith("[X] ") || line.startsWith("- [x] ") || line.startsWith("- [X] ");
    const text = line
      .replace(/^-\s*\[([ xX])\]\s*/, "")
      .replace(/^\[[ xX]\]\s*/, "")
      .replace(/^-\s*/, "")
      .trim();
    return { id: String(i), text, done };
  });
}

export async function GET() {
  const filePath = await findPendingFile();
  if (!filePath) {
    return NextResponse.json({ tasks: [], source: null });
  }
  try {
    const raw = await readFile(filePath, "utf-8");
    const tasks = parsePendingText(raw);
    return NextResponse.json({ tasks, source: filePath });
  } catch {
    return NextResponse.json({ tasks: [], source: filePath });
  }
}

export async function POST(request: Request) {
  try {
    const { tasks } = await request.json();
    const lines = (tasks as Array<{ text: string; done: boolean }>).map(
      (t) => (t.done ? "- [x] ": "- [ ] ") + t.text
    );
    const content = lines.join("\n") + "\n";

    // Write to local pending.txt
    const targetPath = PENDING_PATHS[0];
    try {
      await writeFile(targetPath, content, "utf-8");
    } catch {
      // If write fails (e.g., file doesn't exist), create it
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, content, "utf-8");
    }
    return NextResponse.json({ ok: true, path: targetPath });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
