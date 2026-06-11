# command_center / web

Mission-control UI for the `ask` sub-agent. Watches the ReAct loop in real-time as the LLM reasons, calls tools, and produces a final answer.

## Architecture

```
browser (port 3000)
   │
   ▼  POST /api/ask (SSE)
Next.js app (port 3000)
   │
   ▼  POST /ask (SSE proxy)
command_center HTTP API (port 3010, default)
   │
   ▼  LLM ReAct loop
Anthropic SDK  ──►  leaf tools (analyze_csv, convert_document, render_video, ping)
```

The Next.js app is a thin client. All tool execution happens in the command_center HTTP server. The web app just renders the SSE event stream as it lands.

## Prerequisites

- Node 20+ (tested with 24.11.0)
- `command_center` HTTP server running on port 3010 (default)
- For live LLM calls: `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` set in the environment that starts `npm run http`

## Run

```powershell
# Terminal 1: command_center HTTP server (root of the hub)
cd D:\ai-sandbox\command_center
npm run http

# Terminal 2: this web app
cd D:\ai-sandbox\command_center\web
npm run dev
# → http://localhost:3000
```

## Configure

| Env var | Default | Purpose |
|---|---|---|
| `CC_HTTP_BASE_URL` | `http://127.0.0.1:3010` | Where the Next.js route proxies `/api/ask` to. Set this if command_center is on a different host/port. |
| `CC_HTTP_PORT` (in command_center/) | `3010` | Port the command_center HTTP server listens on. |
| `CC_HTTP_ALLOWED_ORIGIN` (in command_center/) | `http://localhost:3000` | CORS allowlist. The Next.js dev port. |

## Build

```powershell
npm run build
npm start
```

`outputFileTracingRoot` in `next.config.ts` is set to `web/` so Next.js doesn't get confused by the parent command_center `package-lock.json`.

## Files

| Path | Purpose |
|---|---|
| `app/page.tsx` | Main mission-control page |
| `app/api/ask/route.ts` | SSE proxy to command_center `/ask` |
| `app/globals.css` | Tailwind v4 theme (dark + neon) |
| `components/StatusBar.tsx` | Top bar: agent selector, run state, event count |
| `components/ChatInput.tsx` | Bottom input + send button |
| `components/ReActTimeline.tsx` | Groups events into iterations |
| `components/EventCard.tsx` | Per-event renderer (start / iteration / turn / tool call / final / error) |
| `lib/types.ts` | Shared TypeScript types for SSE events |

## What you see

```
command_center / mission control                [idle]                    [agent: router] [clear]

  ●  started
  agent=router  model=minimax-m2.5-free  tools=["*"]  max_iters=10

  ── iteration 1 of 10 ──

  ┌─ turn 1 ─────────────────────────────────────┐
  │ LLM thought:                                  │
  │ I should call ping to verify the hub is up.   │
  │                                              │
  │ → ping({})                                    │  42 chars
  │   result: { "status": "ok", ... }             │
  └──────────────────────────────────────────────┘

  ── iteration 2 of 10 ──

  ■ final answer · 2 iterations
  The hub is online and responding to ping.
```

## Known gaps (v0.3)

- **No event persistence**: refresh the page and the timeline is gone. Activity log panel deferred to v0.4.
- **No multi-user**: this is a single-browser UI. The HTTP server is stateless.
- **Heartbeat is invisible**: the SSE heartbeat (15s `: ping` line) keeps the connection alive but isn't rendered.
- **Tool result truncation is by character count, not by lines**: long results get a `chars` indicator but no toggle in the collapsed view.
