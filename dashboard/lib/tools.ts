import type { ToolDefinition } from "./types";

export const TOOLS: ToolDefinition[] = [
  {
    name: "ping",
    description: "Health check — verify server status and version.",
    icon: "ping",
  },
  {
    name: "analyze_csv",
    description: "Analyze a CSV file — totals, daily breakdown, cost tiers, top expensive rows.",
    icon: "chart",
    inputSchema: {
      csvPath: {
        type: "text",
        label: "CSV File Path",
        placeholder: "D:\\ai-sandbox\\csv_analyzer\\data.csv",
        required: true,
      },
    },
  },
  {
    name: "convert_document",
    description: "Convert documents between formats (md, pdf, docx, html, txt) with optional AI formatting.",
    icon: "swap",
    inputSchema: {
      inputPath: {
        type: "text",
        label: "Input File Path",
        placeholder: "D:\\path\\to\\document.md",
        required: true,
      },
      outputFormat: {
        type: "select",
        label: "Output Format",
        options: ["md", "pdf", "docx", "html", "txt"],
        defaultValue: "md",
      },
      aiFormat: {
        type: "toggle",
        label: "AI Format (when outputting MD)",
        defaultValue: true,
      },
    },
  },
  {
    name: "format_document",
    description: "Format a markdown file in-place using the LLM formatter.",
    icon: "sparkle",
    inputSchema: {
      inputPath: {
        type: "text",
        label: "Markdown File Path",
        placeholder: "D:\\path\\to\\file.md",
        required: true,
      },
      outputPath: {
        type: "text",
        label: "Output Path (optional)",
        placeholder: "Same as input if omitted",
      },
    },
  },
  {
    name: "render_video",
    description: "Render a Remotion composition to MP4 (or transparent WebM with --transparent).",
    icon: "film",
    inputSchema: {
      compositionId: {
        type: "select",
        label: "Composition",
        options: ["TitleCard", "InfoCard", "LowerThird", "OutroBumper", "BulletList", "ScriptVideo"],
        defaultValue: "TitleCard",
      },
      outputPath: {
        type: "text",
        label: "Output Path (optional)",
        placeholder: "Default: cache/videos/<composition>.<ext>",
      },
      transparent: {
        type: "toggle",
        label: "Transparent (WebM alpha)",
        defaultValue: false,
      },
    },
  },
  {
    name: "compose_from_script",
    description: "Render a full video from a Markdown production script (blocks of [HH:MM:SS → HH:MM:SS] kinds).",
    icon: "film",
    inputSchema: {
      scriptPath: {
        type: "text",
        label: "Production Script (Markdown)",
        placeholder: "D:\\ai-sandbox\\vid\\remotion\\samples\\weapons-101-ep4.md",
        required: true,
      },
      outputPath: {
        type: "text",
        label: "Output MP4 Path (optional)",
        placeholder: "Default: cache/videos/<script-basename>.mp4",
      },
    },
  },
  {
    name: "download_youtube_subtitles",
    description:
      "Download a YouTube video's transcript, optionally format it with an LLM, and save or return it as md, txt, or zip.",
    icon: "youtube",
    inputSchema: {
      url: {
        type: "text",
        label: "YouTube URL or Video ID",
        placeholder: "https://www.youtube.com/watch?v=...",
        required: true,
      },
      format: {
        type: "select",
        label: "Output Format",
        options: ["md", "txt", "zip", "raw"],
        defaultValue: "md",
      },
      formatWithLLM: {
        type: "toggle",
        label: "Format with LLM",
        defaultValue: true,
      },
      llmBaseUrl: {
        type: "text",
        label: "LLM Base URL",
        placeholder: "https://openrouter.ai/api/v1",
      },
      llmApiKey: {
        type: "text",
        label: "LLM API Key",
        placeholder: "sk-or-... (or set YT_LLM_API_KEY in env)",
      },
      llmModel: {
        type: "text",
        label: "LLM Model",
        placeholder: "google/gemma-4-31b-it:free",
      },
    },
  },
];
