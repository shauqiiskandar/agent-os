# Command Center Dashboard

Mission-control GUI for the Command Center MCP hub. Run tools, track pending tasks, and monitor project progress from a single dark-themed dashboard.

## Features

### Tool Runner
Grid of tool cards for every registered Command Center tool. Each card has:
- Inputs matching the tool's schema (text fields, dropdowns, toggles, textareas)
- A Run button that calls the tool and shows the result inline
- Status indicator (Ready / Running / Success / Error)
- Expandable output panel
- **Save As button** — appears when a tool returns downloadable content (e.g. YouTube subtitles). Triggers the browser's native Save As dialog (Chrome/Edge File System Access API, with fallback to anchor download).

**Available tools:**

| Tool | What it does |
|---|---|
| `ping` | Health check for the MCP server |
| `analyze_csv` | Totals, daily breakdown, cost tiers, top rows for a CSV |
| `convert_document` | Convert between md, pdf, docx, html, txt (with optional AI formatting for markdown) |
| `format_document` | AI-format a markdown file in place using the LLM formatter |
| `render_video` | Render a Remotion composition to MP4 |
| `ask` | Run a natural-language task through a sub-agent |
| `download_youtube_subtitles` | Fetch a YouTube transcript, optionally restructure with an LLM, and download as md/txt/zip |

### Pending Tasks
Interactive task list backed by `pending.txt`. Add, check off, and delete tasks. Completed tasks collapse below a divider with a "Clear completed" button.

### Project Progress
Cards for every project in the Command Center registry. Each card shows the project name, path, type, status, mapped tool name, and recent notes from the progress log. Data is pulled from `REGISTRY.md` and `PROGRESS.md`.

### Settings
Displays current server status (online/offline), LLM configuration (model, API key, base URL), tool count, and dashboard version.

## Tech Stack

- Next.js 15 (App Router)
- React 19
- Tailwind CSS v4
- TypeScript

## Getting Started

### Prerequisites

- Node.js 18+
- The Command Center tool files at `D:\ai-sandbox\command_center\tools\` (the API routes import handlers directly from these files at runtime)

### Install

```bash
cd D:\ai-sandbox\command_center\dashboard
npm install
```

### Development

```bash
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

### Production Build

```bash
npm run build
npm start
```

## Project Structure

```
dashboard/
├── app/
│   ├── layout.tsx          Root layout (dark theme, fonts)
│   ├── page.tsx            Home page (sidebar + routed sections)
│   ├── globals.css         Tailwind theme + custom animations
│   └── api/
│       ├── status/route.ts       Server health check
│       ├── pending/route.ts      Read/write pending.txt
│       ├── projects/route.ts     Parse REGISTRY.md + PROGRESS.md
│       └── tools/call/route.ts   Execute tools via direct handler import
├── components/
│   ├── sidebar.tsx         Navigation sidebar
│   ├── top-bar.tsx         Top bar with server status dot
│   ├── tool-runner.tsx     Tool runner grid
│   ├── tool-card.tsx       Individual tool card with form + status
│   ├── pending-tasks.tsx   Task list with add/toggle/delete
│   ├── project-progress.tsx  Project cards from registry
│   ├── settings.tsx        Server + config info
│   └── icon.tsx            SVG icon component
├── lib/
│   ├── types.ts            TypeScript interfaces
│   ├── tools.ts            Tool definitions with input schemas
│   └── utils.ts            Helpers (cn, generateId)
├── pending.txt             Persistent task storage
├── package.json
├── tsconfig.json
├── next.config.ts
└── postcss.config.mjs
```

## How Tool Execution Works

When you click Run on a tool card:

1. The frontend sends a POST to `/api/tools/call` with `{ name, arguments }`
2. The API route dynamically imports the handler from `D:\ai-sandbox\command_center\tools\<tool>.mjs`
3. The handler runs and returns a result (file paths, analysis output, etc.)
4. The result displays in the card's expandable output panel

Handlers are cached after the first import so repeated calls are fast.

### Auto-start behavior

- `convert_document` and `format_document` auto-start the markdown-formatter server at `http://127.0.0.1:3001` if it isn't already running
- `download_youtube_subtitles` auto-starts the subtitle server at `http://127.0.0.1:3002` if it isn't already running
- `render_video` auto-downloads and caches Chromium on first render (can take several minutes; subsequent renders are faster)
- `ping` checks whether the MCP server entry point exists and reports tool count

## Data Sources

| Data | Source |
|---|---|
| Project list | `D:\ai-sandbox\command_center\REGISTRY.md` (parsed table) |
| Project notes | `D:\ai-sandbox\command_center\PROGRESS.md` (grep for mentions) |
| Pending tasks | `D:\ai-sandbox\command_center\dashboard\pending.txt` |
| Server status | `D:\ai-sandbox\command_center\server\index.mjs` (file existence check + tool scan) |

## Theme

Dark mission-control aesthetic. Key colors:

| Token | Hex | Use |
|---|---|---|
| `bg` | `#0a0a0a` | Page background |
| `bg-elev` | `#141414` | Card surfaces |
| `accent` | `#10b981` | Primary actions, status dot |
| `cyan` | `#06b6d4` | Folder icons |
| `amber` | `#f59e0b` | Warnings, running state |
| `red` | `#ef4444` | Errors |
| `text` | `#e5e5e5` | Primary text |
| `text-dim` | `#a3a3a3` | Secondary text |
| `text-faint` | `#666666` | Tertiary / placeholders |

Fonts: Inter (UI), JetBrains Mono (code/paths).
