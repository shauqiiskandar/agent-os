# Project Registry

> Single source of truth for what projects exist, what they do, and how command_center will expose them.

## Inventory

| Project | Path | Type | Status | command_center tool name |
|---|---|---|---|---|
| csv_analyzer | `D:\ai-sandbox\csv_analyzer\` | Python script | Runnable as-is | `analyze_csv` (wired v0.1) |
| markdown-formatter/personal | `D:\ai-sandbox\markdown-formatter\personal\` | Express server | Runnable (`npm start`); reads LLM creds from `config.js` | `convert_document` (wired v0.1) |
| vid/remotion | `D:\ai-sandbox\vid\remotion\` | Remotion project | Runnable (`npm run studio` / `npx remotion render`) | `render_video` (planned) |
| youtube-subtitle-download-plus-format | `D:\ai-sandbox\youtube-subtitle-download-plus-format\` | Express server | Runnable (`npm start`); auto-starts, avoids yt-dlp binary | `download_youtube_subtitles` (wired v0.2) |
| resume-optimizer | `D:\ai-sandbox\resume-optimizer\` | Next.js app | Runnable (`npm run dev`); needs `OPENAI_API_KEY` | `optimize_resume` (planned) |
| openui/genui-chat-app | `D:\ai-sandbox\openui\genui-chat-app\` | Next.js app | Runnable (`npm run dev`) | (not yet scoped) |
| colab-client | `D:\ai-sandbox\colab-client\` | Python CLI | Runnable; needs `pyyaml`, `requests` | (not yet scoped) |
| algo-trading-bot | `D:\ai-sandbox\algo-trading-bot\` | Empty repo (just `.git` + a `.sisyphus` plan for an AI influencer, not trading) | Not wrappable | — |
| trading-bot | `D:\ai-sandbox\trading-bot\` | Empty Python scaffold (`src/{core,backtest,live,skills,utils,data}` all empty; has `project-structure.md` plan + 232K conv dump + 165K JSON) | Not wrappable yet | — |
| voice-cloner | `D:\ai-sandbox\voice-cloner\` | Single ComfyUI workflow JSON (Qwen3-TTS, Chinese filename) | Asset, not a project | — |
| openui/genui-chat-app | `D:\ai-sandbox\openui\genui-chat-app\` | Next.js 16 app; `POST /api/chat` streams from `gpt-5.2` via `OPENAI_API_KEY` | Runnable; candidate for v0.2 (`ask_openui_agent` / `build_app` / `start_dev_server`) | TBD |
| text_File_Converter | `D:\ai-sandbox\text_File_Converter\` | Express server | Runnable (`npm start`) | **dropped** — superseded by markdown-formatter |
| command_center | `D:\ai-sandbox\command_center\` | The hub itself | v0.1 (3 tools wired) | — |

## Excluded (not tools, just data/notes/templates)

`biz-stuff/`, `content-creation/`, `influencer/`, `markdown-formatter/text-convert-format-public/` (duplicate of personal/, not wired — personal/ is canonical), `scrapper/` (scraped output files), `scripturesofman/`, `Obsidian Vault/`, `timer-cleaner/` (output files only), `viral-forge-personal/`, `viral-generator/`, `code-nomad/`, `SillyTavern/`, `digimonvscode/`, `lang-chat/`, `language/`, `security-skill-sop/`, `vid/` (parent of remotion), `islam-history-channel/`, `ai_lang_prac/`, `ai-slop-detector/`

## Planned Tool Definitions

```ts
// Each wrapper in tools/ follows this shape:
{
  name: "convert_document",
  description: "Convert a document between formats (pdf, docx, md, txt, html) using markdown-formatter/personal",
  inputSchema: {
    inputPath:    { type: "string", required: true, description: "Absolute path to input file" },
    outputFormat: { type: "string", required: true, enum: ["md", "pdf", "docx", "html", "txt"] },
    aiFormat:     { type: "boolean", default: true, description: "When outputFormat=md, run the LLM formatter" }
  },
  execute: async (args) => {
    // lazy-spawn markdown-formatter/personal server.js on port 3001
    // POST multipart to /api/convert
    // write response to cache/converted_docs/<name>.<fmt>
    // return the output path
  }
}
```

## Wiring Up a New Project (process)

1. Add row to inventory table above
2. Create `tools/<name>.mjs` wrapper (ESM; matches the existing convention)
3. Register in `server/index.mjs` MCP tool list (add to the `tools` array + `handlers` map)
4. Add to `PROGRESS.md` done list
5. Test: call from opencode chat or via `test/smoke_*.mjs`

## Hub Tools (v0.3)

| Tool | Purpose | Wraps |
|---|---|---|
| `ping` | Health check (version + tool list) | — |
| `analyze_csv` | Run csv_analyzer on a CSV | `D:\ai-sandbox\csv_analyzer\analyze.py` |
| `convert_document` | Convert md/pdf/docx/html/txt (optional LLM formatting) | `D:\ai-sandbox\markdown-formatter\personal\server.js` |
| `render_video` | Render a Remotion composition to MP4 | `D:\ai-sandbox\vid\remotion` |
| `download_youtube_subtitles` | Download YouTube transcript, optionally format with LLM | `D:\ai-sandbox\youtube-subtitle-download-plus-format\server.js` |
| `ask` | Natural-language → tool routing via a sub-agent (LLM with ReAct loop) | The 5 leaf tools above |

## Surfaces (v0.3)

| Surface | Port | Purpose | Entry point |
|---|---|---|---|
| MCP server (stdio) | — | For opencode / Claude Desktop / Cursor | `npm run mcp` or `npm start` |
| HTTP API (REST + SSE) | 3010 (configurable) | For the web UI, curl, Postman, scripts | `npm run http` |
| Web UI (mission control) | 3000 | Browser dashboard for the `ask` tool with live ReAct visualizer | `cd web && npm run dev` |

All three surfaces share the same tool handlers (no duplication). The MCP server and HTTP server both import from `tools/*.mjs` and the web UI proxies `/api/ask` to the HTTP server's SSE stream.

## Sub-Agents (`sub_agents.json`)

Named LLM personas with their own system prompt and tool allowlist. Invoked via `ask` with `{ agent: "<name>", task: "..." }`. Omit `agent` for a plain LLM call with no tools.

| Agent | Tools | Default model | Purpose |
|---|---|---|---|
| `router` | `["*"]` (all leaf tools) | `ANTHROPIC_MODEL` env | Translate natural-language intent into tool calls. Default dispatcher. |

**Adding a new sub-agent:** append an entry to `sub_agents.json`:
```json
{
  "name": "video-script",
  "model": null,
  "system_prompt": "...",
  "allowed_tools": ["render_video", "analyze_csv"]
}
```

`model: null` → falls back to `sub_agents.json default_model` → `ANTHROPIC_MODEL` env. Never hardcoded.

## Hub Configuration

`mcp.command_center.environment` in `~/.config/opencode/opencode.json`:
| Var | Purpose | Default if unset |
|---|---|---|
| `ANTHROPIC_API_KEY` | Auth for the LLM endpoint | `ask` tool errors with a clear pointer |
| `ANTHROPIC_BASE_URL` | LLM endpoint | `https://opencode.ai/zen` |
| `ANTHROPIC_MODEL` | Default model for any sub-agent without an explicit `model` field | `ask` tool errors with a clear pointer |

## Update Strategy

When a project is added, removed, or its location changes:
1. Update this file
2. Verify the wrapper still works
3. Note the change in `PROGRESS.md`
