# Command Center

> Centralized hub exposing all `D:\ai-sandbox\` projects as callable tools from any MCP-aware AI client (opencode, Claude Desktop, Cursor, etc.).

## Quick Facts

- **Version:** v0.6
- **7 tools wired:** `ping`, `analyze_csv`, `convert_document`, `format_document`, `render_video`, `download_youtube_subtitles`, `ask`
- **Dashboard chat:** SSE-streamed from local `/api/chat` → user's LLM provider via OpenAI SDK (NVIDIA / NagaAI / OpenRouter / OpenAI direct)
- **Dashboard:** port 3000 | **HTTP API:** port 3010
- **Run:** `npm run dev` (starts both) or double-click `start-dev.bat`

## Key Files

- `PROGRESS.md` — session log + open threads
- `REGISTRY.md` — project inventory + tool mapping
- `sub_agents.json` — sub-agent registry (model, allowed tools, system prompt)
- `dashboard/.env.local` — sets `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` for dashboard chat (NVIDIA, NagaAI, OpenRouter, OpenAI all interchangeable)

## Conventions

- Tools live in `tools/*.mjs` (ESM)
- Projects referenced by absolute path (never modified)
- No hardcoded API keys — all from env vars (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` accepted, also `NVIDIA_*` and `ANTHROPIC_*` legacy)
- MCP tool list = leaf tools only; `ask` wrapper is never in LLM's tool list (prevents recursive self-call)
- Dashboard image/video generation: explicitly out of scope (no free path)

## Surfaces

| Surface | Port | Entry |
|---|---|---|
| MCP server | stdio | `node server/index.mjs` |
| HTTP API | 3010 | `npm run http` |
| Dashboard | 3000 | `cd dashboard && npm run dev` |
| Dev orchestrator | both | `npm run dev` |

## Architecture

```
command_center/
├── server/
│   ├── index.mjs          MCP server entry (stdio)
│   └── http.mjs           HTTP API + SSE streaming
├── tools/*.mjs            One wrapper per tool (ESM)
├── dashboard/
│   ├── app/
│   │   ├── api/chat/      SSE proxy → NVIDIA/NagaAI/OpenRouter via OpenAI SDK
│   │   ├── api/tools/call Dynamic import of tools/*.mjs handlers
│   │   └── api/status     Health + LLM config introspection
│   ├── lib/chat-engine.ts Function-calling loop, history persist (localStorage)
│   ├── lib/tools.ts       Tool definitions for the Tools tab
│   └── .env.local         LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
├── sub_agents.json        Sub-agent registry
├── REGISTRY.md            Project inventory + tool mapping
├── PROGRESS.md            Session log, decisions, next steps
├── AGENTS.md              This file (auto-injected into agent context)
└── start-dev.bat          Double-click launcher for dev orchestrator
```

## Open Questions

- Which sub-agents to add next? (`video-script`, `markdown-clean`, `data`)
- Wire `colab-client`, `resume-optimizer`, `openui/genui-chat-app`?
- Multi-provider dashboard chat: should model selector persist per-session, or always reset?
