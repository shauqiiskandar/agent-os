# Command Center

> Centralized hub exposing all `D:\ai-sandbox\` projects as callable tools from any MCP-aware AI client (opencode, Claude Desktop, Cursor, etc.).

## Vision

From a single chat, trigger functionality across every project in the sandbox without caring which project handles it:

- "Convert `report.docx` to markdown" → `convert_document`
- "Render the intro video" → `render_video`
- "Analyze this CSV" → `analyze_csv`
- "Download this YouTube transcript" → `download_youtube_subtitles`
- "Format this markdown file" → `format_document`

## How It Works (non-technical)

There are three ways to use Command Center. Pick the one that fits what you're doing.

### Dashboard (web browser)

You open a web page in your browser. You see cards for each tool — analyze_csv, convert_document, render_video, etc. You fill in a form, click Run. The browser sends a request to a server on your machine. That server finds the right script, runs it (might spawn Python, ffmpeg, or other programs), waits for the result, and sends it back to your browser. The browser displays the result on screen.

The browser never runs anything directly. It's just a display. The server does all the work.

### AI client (opencode / Claude Desktop / Cursor)

You type in natural language: "analyze my CSV at D:\data\costs.csv". The AI client asks Command Center what tools exist (auto-discovery via MCP protocol), picks the right one, calls it, and shows you the result. This works through a pipe between the AI client and Command Center — no web browser needed.

### Scripts (curl, PowerShell, Python)

You call `curl localhost:3010/tools/call` with a JSON body describing which tool to run and what arguments. The HTTP API (a separate server on port 3010) receives it, runs the tool, and sends back the result. No browser, no AI client — useful for automation.

**All three paths end up running the same tool scripts. Only the way you trigger them is different.**

## Surfaces

| Surface | Port | Who uses it | How it works |
|---|---|---|---|
| **Dashboard** | 3000 | You (in a web browser) | Click cards, fill forms, hit Run — results display on screen |
| **MCP server** | stdio | AI clients (opencode, Claude Desktop, Cursor) | AI discovers tools automatically, calls them from chat |
| **HTTP API** | 3010 | Scripts (curl, Python, automation) | Send JSON requests, get JSON responses |
| **Dev orchestrator** | 3000+3010 | `npm run dev` or double-click `start-dev.bat` | Starts Dashboard and HTTP API together |

## Architecture

```
D:\ai-sandbox\
├── command_center/          ← This folder (the hub)
│   ├── server/
│   │   ├── index.mjs          MCP server entry (stdio)
│   │   └── http.mjs           HTTP API + SSE streaming (port 3010)
│   ├── tools/
   │   │   ├── ping.mjs
   │   │   ├── analyze_csv.mjs
   │   │   ├── compose_from_script.mjs
   │   │   ├── convert_document.mjs
   │   │   ├── download_youtube_subtitles.mjs
   │   │   ├── format_document.mjs
   │   │   ├── render_video.mjs
   │   │   └── ask.mjs
│   ├── dashboard/             Next.js 15 web GUI (port 3000)
│   │   ├── app/
│   │   ├── components/
│   │   └── ...
│   ├── sub_agents.json        Sub-agent registry (router agent)
│   ├── REGISTRY.md            Project inventory + tool mapping
│   ├── PROGRESS.md            Session log, decisions, next steps
│   └── AGENTS.md              Agent context (conventions, decisions)
│
├── csv_analyzer/             ← consumed project
├── markdown-formatter/
│   └── personal/             ← consumed project (port 3001)
├── vid/remotion/             ← consumed project
└── youtube-subtitle-download-plus-format/
    └── ...                     ← consumed project (port 3002)
```

**Rule:** `command_center/` only contains orchestration code. Project code stays in its own folder, untouched.

## Available Tools

| Tool | Purpose | Wraps |
|---|---|---|
| `ping` | Health check (version + tool count) | — |
| `analyze_csv` | Run csv_analyzer — totals, daily breakdown, cost tiers | `D:\ai-sandbox\csv_analyzer\` |
| `convert_document` | Convert md/pdf/docx/html/txt (optional LLM formatting) | `D:\ai-sandbox\markdown-formatter\personal\` (port 3001) |
| `format_document` | AI-format a markdown file in place | `D:\ai-sandbox\markdown-formatter\personal\` (port 3001) |
| `render_video` | Render a Remotion composition to MP4 | `D:\ai-sandbox\vid\remotion` |
| `compose_from_script` | Render a full video from a .md production script | `D:\ai-sandbox\vid\remotion` |
| `download_youtube_subtitles` | Fetch YouTube transcript, optionally LLM-format | `D:\ai-sandbox\youtube-subtitle-download-plus-format\` (port 3002) |
| `ask` | Natural-language → tool routing via sub-agent | All tools above |

## Quick Start

### Dashboard (Web GUI)

```bash
cd D:\ai-sandbox\command_center\dashboard
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

### Dev Orchestrator (recommended for development)

```bash
cd D:\ai-sandbox\command_center
npm install
npm run dev
```

Or double-click `start-dev.bat`. Starts both the HTTP API and Dashboard together with color-coded output.

### MCP Server (AI clients)

```bash
cd D:\ai-sandbox\command_center
npm install
node server/index.mjs
```

From any MCP client, the tools above are exposed via stdio.

### HTTP API (programmatic)

```bash
cd D:\ai-sandbox\command_center
npm run http
```

Endpoints:
- `GET /` — server info
- `GET /tools` — full tool list with schemas
- `GET /status` — health check
- `POST /tools/call` — call any tool by name
- `POST /ask` — SSE streaming of the ReAct loop

## Project Structure

```
command_center/
├── server/
│   ├── index.mjs              MCP server registration + tool handlers map
│   └── http.mjs               Express HTTP API + SSE streaming
├── tools/
│   ├── *.mjs                  One wrapper per tool (ESM, imports project binary)
│   └── ...
├── dashboard/                 Next.js 15 web app (see dashboard/README.md)
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── ...
├── sub_agents.json            Sub-agent registry (model, tools, system prompt)
├── REGISTRY.md                Full project inventory + tool mapping
├── PROGRESS.md                Session log, decisions, open threads
├── AGENTS.md                  Agent context (auto-injected)
├── start-dev.bat              Double-click launcher for dev orchestrator
└── .ai/memory/                Project memory / brain
```

## Contributing a New Tool

1. Add a row to `REGISTRY.md` inventory
2. Create `tools/<name>.mjs` wrapper (ESM, follow existing convention)
3. Register in `server/index.mjs` MCP tool list
4. Add to `dashboard/lib/tools.ts` if dashboard UI needed
5. Test: call from opencode chat or via the dashboard
6. Note the change in `PROGRESS.md`

## Configuration

Environment variables (used by `ask` sub-agent):

| Var | Purpose | Default |
|---|---|---|
| `LLM_API_KEY` | LLM auth (NVIDIA / NagaAI / OpenRouter / OpenAI) | Required for `ask` + dashboard chat |
| `LLM_BASE_URL` | LLM endpoint | `https://integrate.api.nvidia.com/v1` |
| `LLM_MODEL` | Model name | — |
| `YT_LLM_BASE_URL` | YouTube formatter LLM base URL | `https://openrouter.ai/api/v1` |
| `YT_LLM_API_KEY` | YouTube formatter LLM key | — |
| `YT_LLM_MODEL` | YouTube formatter model | `google/gemma-4-31b-it:free` |

Sub-agent model can also be overridden per-agent in `sub_agents.json`.

## See Also

- `dashboard/README.md` — Dashboard-specific docs
- `REGISTRY.md` — Full project inventory + tool mapping
- `PROGRESS.md` — Session log, decisions, open threads
