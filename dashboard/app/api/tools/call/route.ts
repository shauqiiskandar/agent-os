import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";

// Cache tool handlers so we don't re-import on every request
let handlerCache: Record<string, Function> = {};

// Use absolute path from the project root
const TOOLS_DIR = "D:\\ai-sandbox\\command_center\\tools";

async function loadToolHandler(name: string): Promise<Function | null> {
  if (handlerCache[name]) return handlerCache[name];

  const handlerMap: Record<string, { file: string; export: string }> = {
    ping: { file: "ping.mjs", export: "handlePing" },
    analyze_csv: { file: "analyze_csv.mjs", export: "handleAnalyzeCsv" },
    convert_document: { file: "convert_document.mjs", export: "handleConvertDocument" },
    format_document: { file: "format_document.mjs", export: "handleFormatDocument" },
    render_video: { file: "render_video.mjs", export: "handleRenderVideo" },
    ask: { file: "ask.mjs", export: "handleAsk" },
    download_youtube_subtitles: { file: "download_youtube_subtitles.mjs", export: "handleDownloadYoutubeSubtitles" },
  };

  const config = handlerMap[name];
  if (!config) return null;

  try {
    const modulePath = path.join(TOOLS_DIR, config.file);
    // Check if file exists
    if (!fs.existsSync(modulePath)) {
      console.error(`Tool file not found: ${modulePath}`);
      return null;
    }

    const fileUrl = "file:///" + modulePath.replace(/\\/g, "/");
    console.log(`Importing tool ${name} from ${fileUrl}`);
    // webpackIgnore prevents Next from bundling this; import is at runtime
    const mod = await import(/* webpackIgnore: true */ fileUrl);
    const handler = mod[config.export];
    if (handler) {
      handlerCache[name] = handler;
    } else {
      console.error(`Handler ${config.export} not found in ${modulePath}`);
    }
    return handler || null;
  } catch (err) {
    console.error(`Failed to load tool ${name}:`, err);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    let body: any;
    try {
      body = await request.json();
    } catch (e: any) {
      console.error("Failed to parse JSON:", e?.message || e);
      return NextResponse.json(
        { content: [{ type: "text", text: `Request body must be JSON. Got error: ${e?.message || e}` }], isError: true },
        { status: 400 }
      );
    }
    const { name, arguments: args } = body;

    if (!name || typeof name !== "string") {
      console.error("Invalid tool name:", name, "typeof:", typeof name, "body:", JSON.stringify(body));
      return NextResponse.json(
        { content: [{ type: "text", text: "Missing or invalid 'name' field." }], isError: true },
        { status: 400 }
      );
    }

    const handler = await loadToolHandler(name);
    if (!handler) {
      return NextResponse.json(
        { content: [{ type: "text", text: `Unknown or unsupported tool: "${name}"` }], isError: true },
        { status: 400 }
      );
    }

    const result = await handler(args || {});

    const content = (result.content || []).map((item: any) => ({
      type: String(item.type || "text"),
      text: String(item.text || ""),
    }));

    const response: any = {
      content: content.length ? content : [{ type: "text", text: "Done (no content)" }],
      isError: !!result.isError,
    };

    // Pass through download payload for browser-triggered downloads
    if (result.download) {
      response.download = result.download;
    }

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        content: [
          { type: "text", text: `Tool execution error: ${err instanceof Error ? err.message : String(err)}` },
        ],
        isError: true,
      },
      { status: 502 }
    );
  }
}
