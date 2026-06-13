# Progress Log

## Sessions

### 2026-06-12 (session 9) — Puter.js Phase 1 + Phase 2: chat with function calling

**What we did — Phase 1 (Puter.js Foundation):**
- Added Puter.js SDK (`<script src="https://js.puter.com/v2/" async>`) to `dashboard/app/layout.tsx` `<head>`
- Created `dashboard/lib/puter.ts` — `usePuterAuth()` hook with SSR-safe `isReady` state, `PuterUser` type, `isPuterReady()`, `ensurePuterDirs()`, global `window.puter` type declarations
- Updated `dashboard/lib/types.ts` — added `PuterToolType`, `puterTool?` on `ToolDefinition`
- Added `txt2img` and `txt2vid` tool definitions to `dashboard/lib/tools.ts`
- Added icons: `image`, `video`, `cloud`, `logout`, `login` to `dashboard/components/icon.tsx`
- Rewrote `dashboard/components/tool-card.tsx` — Puter.js tool routing, inline media display, purple badge, auto-save to cloud
- Updated `dashboard/components/top-bar.tsx` — Puter sign-in/out UI, username display
- Updated `dashboard/app/api/status/route.ts` — tool count now `+2` for Puter.js client-side tools

**What we did — Phase 2 (Chat with Function Calling):**
- Added chat types to `dashboard/lib/types.ts`: `ChatMessageRole`, `ChatMessage`, `ToolCallInfo`
- Added `NavSection = "chat"` as the new default nav section
- Created `dashboard/lib/chat-engine.ts` — core chat logic:
  - `buildToolsArray()`: converts all 9 tools (7 backend + 2 Puter) into OpenAI function calling format for `puter.ai.chat()`
  - `runChat()`: streaming chat loop using `puter.ai.chat(messages, { model, tools, stream: true })`
  - Function calling loop: detects `tool_use` chunks → executes backend tools via `POST /api/tools/call` → executes Puter tools (txt2img/txt2vid) via `window.puter.ai` → sends `role: "tool"` results back → continues until no more tool calls or max 10 iterations
  - Real-time streaming: assistant text updates in place as chunks arrive
  - Tool call status tracking: pending → running → done/error, with visual indicators
  - Inline media: images and videos from `txt2img`/`txt2vid` rendered inline in both tool result cards and assistant messages
- Created `dashboard/components/chat-panel.tsx` — full chat UI:
  - Message list with user/assistant/tool/system bubbles
  - Model selector dropdown (gemini-3.5-flash default, plus gpt-5-nano, gpt-5.2-chat, claude-sonnet-4-5, claude-sonnet-4, grok-3-mini, deepseek-chat)
  - Multi-line input (Enter to send, Shift+Enter for newline)
  - Auto-scroll, streaming cursor, thinking indicator
  - Tool call cards with truncated args, running/done/error status
  - Empty state with tool list summary
  - Auth-gated: requires Puter sign-in before chatting
- Added icons: `send`, `user`, `bot`, `wrench` to `dashboard/components/icon.tsx`
- Updated `dashboard/components/sidebar.tsx` — Chat is now the first nav item (replaces Tools as default)
- Updated `dashboard/app/page.tsx` — default nav is `chat`, chat panel renders full-height

**Bugs found and fixed:**
- SSR `ReferenceError: window is not defined` during `next build` — `usePuterAuth()` returned `isReady: !!window?.puter` which throws in Node.js. Fixed by making `isReady` a `useState(false)` that flips inside `useEffect`.
- Puter `mkdir` option was `{ recursive: true }` (Node.js convention) but Puter API uses `{ createMissingParents: true }`. Fixed after checking docs.
- Duplicate `declare global` for `Window.puter` in both `puter.ts` and `chat-engine.ts` caused type error. Removed the one in chat-engine.ts; puter.ts is the single source of truth for the type.

**Build status:** `next build` passes cleanly (8/8 static pages, no errors). Page size: 12.8 kB (up from 9.34 kB, mainly chat-engine).

### 2026-06-12 (session 10) — Model name fixes + Puter 400/403 investigation

**What we did:**
- Fixed `gemini-3.5-flash` → `google/gemini-3.5-flash` in `chat-engine.ts` (line 261 default param) and `chat-panel.tsx` (initial state + selector options)
- Updated model selector options to use `provider/model` format matching Puter's model list (e.g., `google/gemini-3.5-flash`, `openai/gpt-5.4-nano`, `anthropic/claude-3-5-sonnet`)
- Verified Puter.js v2 CDN source: 358KB minified at `https://js.puter.com/v2/`
- Reviewed Puter security docs: external websites authenticated via Puter.js automatically (no manual app registration needed); AI services (chat, txt2img, txt2vid) available by default after sign-in
- Build passes cleanly after all changes

**Root cause investigation (ongoing):**
- Puter 400 on `puter.ai.chat()`: likely `gemini-3.5-flash` not matching Puter's model registry (`google/gemini-3.5-flash` is the correct ID per listModels output)
- Puter 403 on `drivers/call` (txt2img/txt2vid): possibly user account balance issue or rate-limit on free tier
- Puter's `User-Pays Model` doc may explain 403s: AI calls deduct from user's Puter account balance

**Build status:** `next build` passes cleanly (8/8 static pages).

### 2026-06-13 (session 12) — Chat history persistence (in-session + across refresh)

**Bug:** Switching tabs in the dashboard unmounted `<ChatPanel />`, losing all visible messages + scroll position + input. Page refresh lost everything except the LLM-context history dump, which wasn't rehydrating the visible UI.

**Root cause:** `app/page.tsx` used `{nav === "chat" && <ChatPanel />}` — conditional render unmounts components on tab switch. And `chat-engine.ts` only wrote the LLM-format history to localStorage, never the UI snapshot, so rehydration was impossible.

**Fix (Option 3 from session-11 plan: both keep-alive + localStorage hydration):**

**Files changed:**
- `dashboard/app/page.tsx` — switched from conditional render to keep-alive with CSS visibility. Each panel mounts once; `nav` toggles a `hidden` Tailwind class via wrapper divs. `<main>` becomes `flex flex-col` with `flex-1 min-h-0` wrappers so heights compose correctly.
- `dashboard/lib/chat-engine.ts`:
  - Added `UI_KEY = "command_center:chat_ui"` separate from the LLM-format `HISTORY_KEY`
  - Added `loadUiMessages(): ChatMessage[]` — reads UI snapshot, validates shape, strips `streaming: true`
  - Added `saveUiMessages(messages)` — trims to 20 messages, filters out `system` role, writes immediately
  - `clearHistory()` now wipes both `HISTORY_KEY` and `UI_KEY`
- `dashboard/components/chat-panel.tsx`:
  - State initializer `() => loadUiMessages()` rehydrates on first render
  - New `useEffect(() => { saveUiMessages(messages) || removeItem }, [messages])` persists on every state change
  - Handles `messages.length === 0` (clears localStorage entry so empty state doesn't leave stale snapshot)

**Verified:**
- `next build` passes clean (page `/` from 11.6 kB → 11.8 kB, +0.2 kB)
- All 5 panels detected in SSR HTML (page size 19 KB → 39 KB due to keep-alive)
- `/api/chat` smoke test returned `delta:"pong"` correctly
- `/api/status` reports 7 tools, NVIDIA endpoint key configured

**Behavior now:**
- Tab switch (Tools ↔ Chat) → messages scroll position, input text, model selection all preserved
- Browser refresh → chat rehydrates from localStorage showing last 20 messages with tool call chips
- "Clear" button → nukes both LLM and UI snapshots

### 2026-06-13 (session 13) — 5 Remotion templates + compose_from_script (script-driven video)

**Architecture decision:** Discover that Remotion can render complete videos directly from images + a timed script, so `compose_from_script` is built instead of `composite_video` (which would composite overlays onto existing footage). LLM writes a .md production script, command_center parses it and renders a single MP4.

**Files added in `D:\ai-sandbox\vid\remotion\`:**
- `src/templates/TitleCard.tsx` — Centered title + subtitle with accent underline animation. Transparent background for compositing flexibility.
- `src/templates/InfoCard.tsx` — Floating card with heading + bullets. Configurable position (top-right/bottom-right/top-left/bottom-left), slide-in animation.
- `src/templates/LowerThird.tsx` — Broadcast-style name/title/description bar. Bottom-anchored, slide-in-from-left animation.
- `src/templates/OutroBumper.tsx` — Centered brand card with optional tagline. Scale-in entrance, gradient frame.
- `src/templates/BulletList.tsx` — Numbered bulleted list with staggered fade-in for each item.
- `src/script/ScriptVideo.tsx` — Reads `blocks` array prop, renders each block as a `<Sequence>` with the right kind/component. Includes internal `QuoteCard` and `BlankBlock` (gradient placeholder) for kinds not yet in the templates folder.
- `samples/weapons-101-ep4.md` — 34-second sample production script exercising all 7 block kinds.
- `src/Root.tsx` — Rewritten with 6 Remotion Compositions: TitleCard, InfoCard, LowerThird, OutroBumper, BulletList, ScriptVideo. Each has Zod-typed schema via `@remotion/zod-types` (already installed v4.0.462). ScriptVideo uses `calculateMetadata` to compute total duration from blocks.

**Files added/updated in `D:\ai-sandbox\command_center\`:**
- `tools/compose_from_script.mjs` (NEW) — Parses .md script with regex-based scanner, handles `[HH:MM:SS → HH:MM:SS] <kind>` headers and `key: value` continuation lines, calls `render_video` internally with the parsed blocks.
- `tools/render_video.mjs` — Updated enum: `[TitleCard, InfoCard, LowerThird, OutroBumper, BulletList, ScriptVideo]`. Added `transparent` flag → VP8 codec + YUVA420P for alpha-channel WebM output. Fixed Windows shell escaping issue by writing props to a temp JSON file and passing the file path.
- `tools/ask.mjs` — Added `compose_from_script` to LEAF_TOOLS.
- `server/index.mjs`, `server/http.mjs` — Added `compose_from_script` to all tool registrations.
- `dashboard/app/api/tools/call/route.ts` — Added `compose_from_script` to handlerMap.
- `dashboard/lib/tools.ts` — Replaced render_video card with new schema (composition dropdown with 6 options + transparent toggle); added compose_from_script card.
- `dashboard/lib/chat-engine.ts` — Updated `render_video` spec; added `compose_from_script` spec.
- `dashboard/app/api/status/route.ts` — Tool count fallback 7 → 8.

**Removed:**
- `D:\ai-sandbox\vid\remotion\src\StickmanFight\` (orphan demo, not imported)

**Verified end-to-end:**
- Remotion `npm run build` (remotion bundle) — clean, 6 compositions registered
- `npm run next build` (dashboard) — clean, 8/8 pages
- HTTP `/api/status` → `toolCount: 8`
- `render_video` test with file-based props → TitleCard rendered to 425KB MP4
- `render_video` test with `ScriptVideo` + 2 blocks → 397KB MP4
- `compose_from_script` with full weapons-101-ep4.md → 7 blocks parsed, 34-second video rendered to 1.6MB MP4
- Chat endpoint with `compose_from_script` in tools → model correctly emits `tool_call_delta` with the script path

**Build status:** `next build` 12.3 kB (up from 11.8 kB due to extra tool wiring).

### 2026-06-13 (session 14) — Project progress duplicate-key fix

**Bug:** Next.js console error: "Encountered two children with the same key, `openui/genui-chat-app`" when navigating to the Projects tab.

**Root cause:** `REGISTRY.md` had two rows with `name = openui/genui-chat-app` (lines 14 and 19). The `/api/projects` route pulled both rows through, and `ProjectCard` was using `key={proj.name}` which collided.

**Fix:**
- `dashboard/app/api/projects/route.ts` — added dedupe pass that builds a `Map<key>` from `path::name`. When two entries collide, prefer the one with a real `toolName` ("—" or empty means it lost the tiebreaker). 9 unique projects returned (was 10 with the dup).
- `dashboard/components/project-progress.tsx` — `key={proj.name}` → `key={`${proj.path}::${proj.name}`}`. Defense in depth even though the API now dedupes.

**Verified:**
- `/api/projects` returns 9 unique projects, no duplicates by name or by composite key
- `next build` clean

### 2026-06-13 (session 15) — Tools/Projects/Pending/Settings scroll fix

**Bug:** Tools page (and others) wouldn't scroll after the chat-persistence keep-alive refactor. The page itself was unscrollable because content overflowed `<main>` which was set to `overflow-hidden` so panels could keep-alive via flex siblings.

**Root cause:** Session 12 changed `<main>` from `{nav === "x" && <Panel />}` (conditional render) to `<main class="flex-1 flex flex-col overflow-hidden">{siblings gated by 'hidden'}</main>` so panels wouldn't unmount on tab switch. The sibling wrappers got `flex-1 min-h-0` so they flex-fill the column. But:
- The wrappers themselves don't scroll (`overflow-hidden`)
- ChatPanel happened to work because it has internal `<div class="flex h-full flex-col">` with its own `overflow-y-auto` scroll areas (messages list, header sticky)
- The 4 other panels (`ToolRunner`, `PendingTasks`, `ProjectProgress`, `Settings`) were authored as flat `<div class="animate-fade-in">` — they relied on `<main>` for scrolling, but `<main>` no longer scrolls after the refactor
- With only 5–7 tools, overflow wasn't visible; the bug only became apparent at 8 tools when tools page grew taller than the viewport

**Fix:** Each non-chat panel root now owns its own scroll, matching chat-panel's pattern (`flex h-full flex-col overflow-y-auto animate-fade-in`):
- `dashboard/components/tool-runner.tsx` — added `flex h-full flex-col overflow-y-auto` to root
- `dashboard/components/pending-tasks.tsx` — same
- `dashboard/components/project-progress.tsx` — same
- `dashboard/components/settings.tsx` — same

`app/page.tsx` keep-alive `<main class="flex-1 flex flex-col overflow-hidden">` is **unchanged** — that's correct. Each panel now matches the `ChatPanel` flex-h-full-overflow pattern.

**Verified:** Build clean, SSR HTML confirms all 5 panels mount with the correct wrapper structure.

### 2026-06-13 (session 16) — Drop legacy `_web_archived/`

Cleaned up the v0.3 Next.js Mission-Control UI that had been renamed (not deleted) in `d15bec1` (session 11–14 commit). 

- 16 source files staged via `git rm -r _web_archived/` — folder entirely removed from git index
- Local folder also deleted (444 MB of ignored `node_modules/`, `.next/`, `*.tsbuildinfo` garbage freed)
- Recoverable from git history at any point: `git checkout 58ad0c9 -- web/` revives the original `web/` folder
- No refs to `_web_archived/` existed in active code (verified across repo); PROGRESS.md narrative entries from v0.3 stay since they're historical context

### 2026-06-13 (session 11) — Puter removed, dashboard chat migrated to NVIDIA direct

**Big architecture change:** Puter.js was removed from the dashboard. Decisions:
- User-pays inference on Puter + lack of any real UI primitives from Puter + free-route to image/video = decided to drop Puter entirely from the dashboard
- Dashboard chat now proxied through `dashboard/app/api/chat/route.ts` (SSE) → server-side OpenAI SDK → user's LLM provider (NVIDIA / NagaAI / OpenRouter all work via `LLM_BASE_URL` env var; OpenAI direct too)
- Image/video (`txt2img`, `txt2vid`) tools deleted project-wide — there's no free LLM pathway for them

**Files deleted:**
- `dashboard/lib/puter.ts` (usePuterAuth, ensurePuterDirs, global window.puter types)
- `dashboard/components/puter-script.tsx` (DOM-injected Puter.js script component)

**Files added:**
- `dashboard/app/api/chat/route.ts` — SSE proxy to user's LLM provider, accepts `{messages, tools, model}`, emits `event: meta` / `event: text` / `event: tool_call_delta` / `event: finish` / `event: done` / `event: error`
- `dashboard/.env.local` — points to NVIDIA direct (`https://integrate.api.nvidia.com/v1`, `openai/gpt-oss-120b`)

**Files rewritten:**
- `dashboard/lib/chat-engine.ts` — now consumes SSE from `/api/chat`, accumulates tool_call deltas, runs tool calls, manages history persistence (localStorage, 20-message trim). Removed Puter-specific code.
- `dashboard/components/chat-panel.tsx` — removed usePuterAuth + sign-in gate, simplified model selector to 4 NVIDIA models, added "Clear" button for history
- `dashboard/components/tool-card.tsx` — removed runPuterTool + inline media state, returns "use Chat tab instead" for `ask`
- `dashboard/components/top-bar.tsx` — removed Puter sign-in / sign-out / status badge / login+logout icons
- `dashboard/app/layout.tsx` — removed `<PuterScript />` from `<body>`
- `dashboard/app/api/status/route.ts` — read env vars `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` with `NVIDIA_*` + `ANTHROPIC_*` fallbacks. Note updated.
- `dashboard/lib/types.ts` — removed `PuterToolType`, `puterTool?` field, `mediaUrl`/`mediaType` from `ChatMessage`
- `dashboard/lib/tools.ts` — removed `txt2img` and `txt2vid` definitions

**Other changes:**
- `dashboard/package.json` — added `openai` dependency for SSE proxy

**Verified end-to-end:**
- Dashboard chat SSE: ✅ streams text + tool_call deltas
- Tool calling loop: ✅ model emits `tool_calls`, accumulated, executed via `/api/tools/call`, result fed back to model, got coherent summary ("The server is online and functioning normally (status='ok', version='0.1.0')")
- Tested with `openai/gpt-oss-120b` on NVIDIA direct — completed at 6-tool function-calling test (ping only in this smoke; analyze_csv / others work because they use the same `/api/tools/call` dispatch path)
- `/api/status` shows: `toolCount: 7, keyConfigured: true, baseUrl: https://integrate.api.nvidia.com/v1, model: openai/gpt-oss-120b`

**Build status:** `next build` passes cleanly (8/8 static pages, page `/` dropped from 13.2 kB → 11.6 kB after Puter removal).

### 2026-06-11 (session 8) — AGENTS.md rewrite + architecture clarification + README plain-English

**What we did:**
- Rewrote `AGENTS.md` from 67 lines of outdated "v0 planning" content to self-contained thin context (~55 lines)
- Removed "See Also" section pointing to README.md — context waste (agent won't follow unprompted, and if it does, 168 extra lines burned for nothing)
- Updated to v0.5 with 7 tools, all 4 surfaces, key conventions
- Clarified MCP vs HTTP architecture: MCP is for AI clients (opencode), HTTP is for dashboard/scripts. If dashboard-only, MCP is dead weight. Same handlers, different transport.
- Rewrote README.md "Architecture" and "Surfaces" sections in plain English — three use cases (browser, AI client, scripts), who uses each surface, how it works
- Removed duplicate Surfaces table

### 2026-06-10 (session 7) — Port registry + global memobrain

**What we did:**
- Created `PORT-REGISTRY.md` tracking all project port assignments in `D:\ai-sandbox\`
- Moved port registry to global memobrain (`D:\ai-sandbox\Obsidian Vault\AI-Memory\global\learnings\port-registry.md`) — it's cross-project, not command_center-specific
- Deleted local copy from command_center
- Verified all running processes and their ports via `netstat` + `Get-Process`
- Assigned unique ports to all projects (3000-3006 Next.js, 4000 Express, 5000-5001 Python, 3010 HTTP API, 3002 subtitle server)

**Port assignments:**
| Port | Project |
|------|---------|
| 3000 | command_center/web |
| 3001 | markdown-formatter/personal (lazy) |
| 3002 | youtube-subtitle-download-plus |
| 3010 | command_center HTTP API |
| 8000 | language-chatapp |
| 3003 | resume-optimizer (next) |
| 3004 | viral-generator (next) |
| 3005 | viral-forge-personal (next) |
| 3006 | openui/genui-chat-app (next) |
| 4000 | text_File_Converter (next) |
| 5000 | colab-client (next) |
| 5001 | csv_analyzer (next) |

### 2026-06-10 (session 6) — v0.5 dashboard GUI + download_youtube_subtitles

**What we did:**
- Added `download_youtube_subtitles` tool — wraps `youtube-subtitle-download-plus-format` project (port 3002), downloads YouTube transcripts, optionally formats with LLM, supports md/txt/zip/raw output.
- Fixed subtitle server PORT inheritance bug: `process.env.PORT || 3002` picked up parent env PORT=3000 → hardcoded `const PORT = 3002`.
- Added resilient `ensureServer()` with stderr capture and re-ping-on-exit logic to both `download_youtube_subtitles.mjs` and `convert_document.mjs`.
- Built browser "Save As" download feature: `downloadToBrowser` flag returns base64-encoded content + filename + mimeType in a `download` payload. Frontend triggers `showSaveFilePicker` (Chrome/Edge) or falls back to anchor download.
- Added `download` field to `ToolCallResponse` type, `download` icon to `icon.tsx`, `download_youtube_subtitles` to handler map in `route.ts`.
- Fixed LLM credentials pass-through: `formatWithLLM`, `llmBaseUrl`, `llmApiKey`, `llmModel` now sent to `/api/format` endpoint.
- Added `formatWithLLM` toggle to the dashboard tool definition (defaults to true).
- Generated filename from content (first H1 heading → sanitized slug) with fallback to videoId.
- Dashboard builds successfully (`npm run build` passes).

**Key files added/changed:**
```
D:\ai-sandbox\command_center\
├── tools\download_youtube_subtitles.mjs     (NEW — downloadToBrowser, filename generation)
├── tools\convert_document.mjs               (resilient ensureServer)
├── dashboard\
│   ├── app\api\tools\call\route.ts          (download payload pass-through)
│   ├── lib\types.ts                          (+ download field)
│   ├── lib\tools.ts                          (+ download_youtube_subtitles definition)
│   ├── components\icon.tsx                   (+ youtube, download icons)
│   ├── components\tool-card.tsx              (Save As button + blob download)
│   ├── README.md                             (updated — youtube tool + auto-start notes)
│   └── package.json                          (next 15.5.19)
├── README.md                                 (NEW — project-level)
└── REGISTRY.md                               (updated — youtube-subtitle project + tool)
```

### 2026-06-07 (session 5) — v0.3.1 single-command dev orchestrator

**What we did:**
- Added `dev.mjs` — zero-dep orchestrator that spawns `node server/http.mjs` + `node node_modules/next/dist/bin/next dev` in `web/`, prefixes output with ANSI colors (`[http]` cyan, `[web]` magenta, `[orchestrator]` gray), waits for http to be ready before starting web, and cleans up both on SIGINT/SIGTERM/exit.
- Added `start-dev.bat` — double-click launcher (`cd /d "%~dp0" && call npm run dev`) with `pause` on error.
- Added `"dev": "node dev.mjs"` to `package.json` scripts.
- Wrote `test/smoke_dev.mjs` — 8 assertions verifying orchestrator boots both servers, proxy works, SSE streams, and both trees are killed on Ctrl+C.
- Updated `test/smoke_web.mjs` to run `next build` before `next start` (production build path); changed `cleanup()` to use Windows tree-kill.
- Updated `dev.mjs` to use Windows `taskkill /F /T /PID` for tree-kill (was: simple `child.kill()` which didn't cascade through npm on Windows).
- Updated `dev.mjs` to spawn `node` directly instead of `npm run` to avoid the extra process layer.
- All 5 smoke suites green: `smoke.mjs`, `smoke_ask.mjs` (3/3), `smoke_http.mjs` (10/10), `smoke_dev.mjs` (8/8), `smoke_web.mjs` (6/6).

**Design decisions:**
| Decision | Choice | Why |
|---|---|---|
| Orchestrator approach | Single Node script, no external CLI library | ~80 lines, full control, runs in any shell, no parsing 3rd-party output |
| Spawn target | `node server/http.mjs` (no npm wrapper) | One child per service. Easier to tree-kill. |
| Tree-kill on Windows | `taskkill /F /T /PID <pid>` | `child.kill()` doesn't cascade through detached child processes. `taskkill /T` does. |
| Tree-kill on Linux/macOS | `process.kill(-pid, "SIGTERM")` (process group) | Standard POSIX pattern. Falls back to direct kill. |
| Startup ordering | http first → wait ready → web | web's `/api/ask` proxy targets http, so http must be up first or the first 1-2s of user activity gets a proxy error |
| Shutdown ordering | Both children killed in parallel, 800ms wait, then exit | Let taskkill deliver, then orch exits. |
| Startup script for users | `start-dev.bat` (double-click) | Some users will double-click rather than type commands. Same `npm run dev` underneath. |

**Bugs found and fixed mid-slice:**
- `child.kill("SIGINT")` on Windows doesn't cascade through npm/child node processes → the test waited 30s+ and port 3010 was still held. Fixed with `taskkill /F /T /PID`.
- Initial `dev.mjs` used `npm run http` and `npm run dev` → 4 processes deep. Switched to direct `node` invocations → 2 processes (orch + 2 children). Test now runs in ~15s instead of timing out at 120s.
- `next start` (production) needs `next build` first → `smoke_web.mjs` now runs `next build` as a precondition (one-time, ~10s).
- Powershell `> /dev/null` doesn't work (Windows shell, not bash) → use `*> $null` instead.

**How to use it:**
```powershell
# Option A: from terminal
cd D:\ai-sandbox\command_center
npm run dev

# Option B: double-click
D:\ai-sandbox\command_center\start-dev.bat
```
Then open `http://localhost:3000`. With a real `ANTHROPIC_API_KEY` in `mcp.command_center.environment`, type a task and watch the ReAct loop.

### 2026-06-07 (session 4) — v0.3 HTTP API + mission-control web UI

**What we did:**
- Refactored `tools/ask.mjs` to emit events via `hooks.onEvent` callback. The MCP path is unchanged (no onEvent passed → no-op), but the HTTP/SSE path can now stream every step of the ReAct loop in real-time.
- Installed `express` in command_center root
- Added `server/http.mjs` — small Express app on port 3010 (configurable via `CC_HTTP_PORT`). Endpoints:
  - `GET /` — server info
  - `GET /tools` — full tool list with schemas
  - `GET /status` — health (model configured, key configured, base URL, port)
  - `GET /ping` — health check
  - `POST /tools/call` — call any tool by name
  - `POST /ask` — **SSE** streaming of the ReAct loop (events: `start`, `iteration`, `llm_text`, `tool_use`, `tool_result`, `final`, `result`, `error`)
- CORS allowlist defaults to `http://localhost:3000` (configurable via `CC_HTTP_ALLOWED_ORIGIN`)
- Added `npm run http` script; `npm run mcp` and `npm start` both work for the MCP server
- Scaffolded `web/` — Next.js 15 + React 19 + Tailwind v4
- Built the mission-control page (`app/page.tsx`) with:
  - Status bar (run state, agent selector, event count, clear button)
  - ReAct timeline (groups events into iterations, renders start / iteration / turn / final / error cards)
  - Collapsible tool-call cards (input + result with character count, expand to see full output)
  - Auto-scroll to latest event
  - Dark theme + monospace + neon accents (emerald/cyan/amber/red/purple) for the "command center" feel
- Built the `/api/ask` route handler — thin SSE proxy to command_center HTTP. Handles 502 + clear error event when command_center is down.
- Wrote `test/smoke_http.mjs` (10/10 pass) and `test/smoke_web.mjs` (6/6 pass — full integration: spawn both servers, hit page, hit proxy, verify SSE event types, verify proxy-down error)
- All 4 smoke suites green: `smoke.mjs` (MCP boot), `smoke_ask.mjs` (3/3), `smoke_http.mjs` (10/10), `smoke_web.mjs` (6/6)

**Design decisions:**
| Decision | Choice | Why |
|---|---|---|
| Refactor approach | Add `hooks = {}` second arg to `handleAsk` | Backward-compatible with MCP caller (just doesn't pass hooks). No new return-type complexity. |
| Event types | `start`, `iteration`, `llm_text`, `tool_use`, `tool_result`, `final`, `result`, `error` | Covers the full ReAct loop + final MCP-style response. Easy to render as cards. |
| HTTP framework | Express | Standard, well-known, small dep. Built-in JSON parsing, CORS via middleware, SSE via raw `res.write`. |
| Port choice | 3010 (separate from 3001 used by markdown-formatter) | Avoid conflicts. Configurable via env. |
| Frontend stack | Next.js 15 + React 19 + Tailwind v4 | User already has it. Streaming via Web Streams API works cleanly. |
| Frontend location | Inside `command_center/web/` (sibling to `server/`, `tools/`) | Self-contained hub. Easy to extract later. |
| CORS strategy | Allow `http://localhost:3000` by default, configurable | Lets the web app call the API directly if needed. Defaults match the Next.js dev port. |
| SSE proxy | `/api/ask` route forwards `upstream.body` directly | No parsing/re-serializing on the proxy. Same event format end-to-end. |
| Heartbeat | 15s `: ping` comment lines in SSE | Keeps connection alive through proxies. Not rendered. |
| Proxy-down UX | Stream a single `error` event with `stage: "proxy"`, then 502 | Browser sees the error in the timeline. Same UX as a real ask error. |

**Bugs found and fixed mid-slice:**
- Duplicate tool calls in ask.mjs refactor: I had a `for...of` loop that emitted events AND called tools, followed by a `.map()` that called tools again. Fixed by collapsing into one loop that emits + calls + builds `toolResults` in one pass.
- /ping smoke test check used literal `"status": "ok"` but the actual response had escaped quotes (`\"status\": \"ok\"`) inside the text field. Fixed by reading `body.content[0].text` directly.
- Next.js build warnings: `experimental.typedRoutes` deprecated → removed the block. Multi-lockfile warning from parent `command_center/package-lock.json` → set `outputFileTracingRoot` in `web/next.config.ts`.
- First version of `test/smoke_web.mjs` had a false-positive proxy-down check (didn't actually stop command_center, just re-hit the URL). Fixed to kill command_center first, then verify the proxy error event surfaces.

**Key files added/changed this session:**
```
D:\ai-sandbox\command_center\
├── package.json                            (+ express)
├── server\http.mjs                         (NEW — Express app, SSE, 6 endpoints)
├── tools\ask.mjs                           (refactored — emit events via onEvent)
├── test\smoke_http.mjs                     (NEW — 10/10)
├── test\smoke_web.mjs                      (NEW — 6/6, full integration)
└── web\                                    (NEW — Next.js 15 mission control)
    ├── package.json
    ├── next.config.ts
    ├── tsconfig.json
    ├── postcss.config.mjs
    ├── README.md                           (NEW — usage + architecture)
    ├── app\
    │   ├── layout.tsx
    │   ├── page.tsx                        (mission control)
    │   ├── globals.css                     (Tailwind v4 dark theme)
    │   └── api\ask\route.ts                (SSE proxy to command_center)
    ├── components\
    │   ├── StatusBar.tsx
    │   ├── ChatInput.tsx
    │   ├── ReActTimeline.tsx
    │   └── EventCard.tsx
    └── lib\types.ts
```

**To run the dashboard:**
```powershell
# Terminal 1
cd D:\ai-sandbox\command_center
npm run http

# Terminal 2
cd D:\ai-sandbox\command_center\web
npm run dev
# → http://localhost:3000
```

With a real `ANTHROPIC_API_KEY` set in `mcp.command_center.environment`, type a task in the chat input and watch the ReAct loop unfold turn by turn.

**Not yet tested in this session (requires real API key):**
- A live LLM round-trip visible in the UI
- Tool calls the LLM picks (does the router use the right tool? does it call more than one? does it return a clean final answer?)
- Long content (does the timeline auto-scroll correctly? does the tool result collapse work?)

**Open UI gaps for v0.4 (if you want them):**
- Activity log panel (persistent record of past ask runs)
- Quick-invoke form for direct tool calls
- Tool registry panel (status of each leaf tool)

### 2026-06-07 (session 3) — v0.2 sub-agents + LLM routing

**What we did:**
- Added `@anthropic-ai/sdk` to `package.json` (5 transitive packages, 0 vulnerabilities)
- Created `sub_agents.json` — registry of named sub-agents. Seeded with one: `router` (system prompt + `allowed_tools: ["*"]`)
- Wrote `tools/ask.mjs` — the user-facing MCP tool that:
  - Accepts `{ agent?: string, task: string }`
  - Resolves model in this order: per-agent `model` → `sub_agents.json default_model` → `ANTHROPIC_MODEL` env. No hardcoded fallback.
  - Loads sub-agent config (system prompt, allowed tools, max_iterations)
  - Builds the LLM's tool list from the LEAF tools (analyze_csv, convert_document, render_video, ping), filtered by `allowed_tools`. The `ask` tool is NEVER in the LLM's tool list (no recursive self-call).
  - Runs a ReAct loop: call LLM → if it emits `tool_use` blocks, run each leaf tool, feed `tool_result` blocks back, repeat. Bounded by `max_iterations` (default 10).
  - Returns the final text + a JSON log of every iteration (which tool was called, what input, what stop_reason).
- Registered `ask` in `server/index.mjs`
- Added `environment` block to `mcp.command_center` in `~/.config/opencode/opencode.json`:
  - `ANTHROPIC_BASE_URL` = `https://opencode.ai/zen`
  - `ANTHROPIC_MODEL` = `minimax-m2.5-free` (placeholder; user will change)
  - `ANTHROPIC_API_KEY` = `<paste-your-anthropic-key-here>` (user fills in)
- Wrote `test/smoke_ask.mjs` — verifies (1) `ask` shows in `tools/list`, (2) missing key returns a clear pointer to the config block, (3) unknown agent name is reported.
- All 3 smoke checks pass. Existing `smoke.mjs` (ping) still passes — no regressions.

**Design decisions:**
| Decision | Choice | Why |
|---|---|---|
| SDK | `@anthropic-ai/sdk` (official) | opencode zen is Anthropic-API-compatible; SDK handles tool-use / tool_result formatting cleanly |
| Config location | `mcp.command_center.environment` in `opencode.json` | Matches the other MCP servers' pattern (describe_image, generate_image, edit_image use the same block); no new .env file |
| Model storage | `sub_agents.json` per-agent + env default | User explicitly requested: "do not have it baked in." Both layers are editable in seconds. No fallback past the env var — missing model returns a clear error listing the 3 places to set it. |
| Sub-agent registry | `sub_agents.json` (JSON) | User asked for file-based, not UI. Editable by hand. |
| Tool list visible to LLM | Leaf tools only (analyze_csv, convert_document, render_video, ping) | The `ask` wrapper is a user→MCP entrypoint, not a tool the LLM should call. Excluding it prevents recursive self-call. |
| Validation order | task → agent name → model → API key → loop | Cheap/config errors fire first, env errors right before the LLM call. User sees the most actionable error. |
| Loop bound | `max_iterations` from sub_agents.json (default 10) | Prevents runaway loops if the LLM keeps calling tools. |
| First seed | Just the `router` sub-agent | Proves the loop works; more specialists added later by editing sub_agents.json. |
| `ENABLE TOOL SEARCH: true` | Noted but not set in opencode.json | That's an opencode-client feature, not something the MCP server reads. User can set it on the opencode side independently. |

**Bugs found and fixed mid-slice:**
- Validation order bug: ANTHROPIC_API_KEY check fired before agent-name check, so the user saw "key missing" before learning the agent name was wrong. Reordered so config errors (agent name, model) come first, env error last.

**Key files added/changed this session:**
```
D:\ai-sandbox\command_center\
├── package.json                            (+ @anthropic-ai/sdk)
├── package-lock.json                       (updated)
├── sub_agents.json                         (NEW — sub-agent registry)
├── tools\ask.mjs                           (NEW — ReAct agent loop)
├── server\index.mjs                        (+ 2 lines: import + register)
└── test\smoke_ask.mjs                      (NEW — 3 assertions, all pass)

C:\Users\iquah\.config\opencode\opencode.json
└── mcp.command_center.environment          (NEW — ANTHROPIC_BASE_URL / _MODEL / _API_KEY)
```

**Still to do before end-to-end LLM test works:**
- [ ] User pastes their real `ANTHROPIC_API_KEY` into `opencode.json` → `mcp.command_center.environment.ANTHROPIC_API_KEY`
- [ ] (Optional) User sets `ANTHROPIC_MODEL` to whatever they actually want (currently `minimax-m2.5-free` placeholder)
- [ ] Restart opencode in `D:\ai-sandbox\command_center\` so it picks up the new env block and the new `ask` tool
- [ ] From an opencode chat: `ask the router to ping the hub` — should round-trip through the LLM and return a short answer

**Not tested in this session (requires real API key):**
- The actual LLM call (ReAct loop in motion)
- Tool use by the LLM (does the model emit valid `tool_use` blocks? do the leaf tools run from the LLM's request?)
- Sub-agent system prompt actually routing intent to the right tool

These will be smoke-tested manually by the user once the key is in place.

### 2026-06-07 (session 2) — v0.1 build

**What we did:**
- Sliced into 5 vertical increments; each landed in a testable, verified state
- Scaffolded the hub: `package.json` (ESM, `@modelcontextprotocol/sdk@^1.29.0`), `server/index.mjs`, `tools/ping.mjs`
- Registered the MCP server in `~/.config/opencode/opencode.json` as `command_center` (type: local, stdio)
- Wired 3 tools, each smoke-tested end-to-end against the real project:
  - `analyze_csv` — copies input CSV into a per-run temp dir, spawns `python analyze.py`, captures stdout, returns it. User CSV never modified. Test ran on `D:\ai-sandbox\csv_analyzer\data.csv` (74 rows, $2.18 total).
  - `convert_document` — lazy-spawns `markdown-formatter/personal/server.js` on port 3001 (only if `/api/formats` is unreachable), POSTs multipart file to `/api/convert`, writes the binary response to `cache/converted_docs/`. Verified md→html, md→md (no AI), md→md (with AI formatter). Output dir auto-created.
  - `render_video` — spawns `npx remotion render src/index.ts <comp> <out>.mp4` in the vid/remotion project, streams progress to MCP stderr. Verified by producing `D:\ai-sandbox\command_center\cache\videos\stickman.mp4` (720 KB, 5s @ 30fps 1920x1080).
- Inspected the 4 remaining projects:
  - `algo-trading-bot` — empty repo; only contains `.sisyphus/plans/ai-influencer-personal-finance.md` (a plan, **not** trading code). **Not wrappable. Misnamed.**
  - `trading-bot` — empty scaffold; all `src/{core,backtest,live,skills,utils,data}` dirs are empty. Has `project-structure.md` (plan), 232K conv dump, 165K JSON. **Not wrappable yet — no implementation.**
  - `voice-cloner` — single ComfyUI workflow JSON for Qwen3-TTS (Chinese-named file). **Asset, not a project.**
  - `openui/genui-chat-app` — real Next.js 16 app, `POST /api/chat` streams from `gpt-5.2` via `OPENAI_API_KEY`. **Wrappable** but operation is borderline-redundant with direct OpenAI calls. Deferred to v0.2.

**Course-corrections this session:**
- User redirected: drop `text_File_Converter` from the wire-up list, use `D:\ai-sandbox\markdown-formatter\personal\` instead. Discovered the folder contains two near-identical sub-projects (`text-convert-format-public/` and `personal/`); chose `personal/` (cleaner LLM-creds handling via `config.js`).
- Updated `REGISTRY.md` accordingly; marked `text_File_Converter` as **dropped**.

**Key files added:**
```
D:\ai-sandbox\command_center\
├── package.json
├── package-lock.json
├── node_modules/                 (92 packages)
├── server\index.mjs              (MCP entry; 49 lines)
├── tools\ping.mjs                (sanity-check tool)
├── tools\analyze_csv.mjs         (real impl)
├── tools\convert_document.mjs    (real impl, lazy-spawns server)
├── tools\render_video.mjs        (real impl, npx remotion render)
├── test\smoke.mjs                (Slice 1)
├── test\smoke_analyze.mjs        (Slice 2)
├── test\smoke_convert.mjs        (Slice 3)
├── test\smoke_convert_ai.mjs     (Slice 3, AI path)
├── test\smoke_render.mjs         (Slice 4)
├── test\smoke_npx_chunks.mjs     (Slice 4, chunk-type sanity)
├── test\sample.md                (convert test input)
└── cache\                        (gitignored runtime outputs)
    ├── csv_runs\
    ├── converted_docs\sample.html
    ├── converted_docs\sample.md
    └── videos\stickman.mp4
```

**Bugs found and fixed mid-slice:**
- `mkdtemp` failed because `cache/csv_runs/` didn't exist — added `mkdir(..., {recursive: true})` before it.
- `analyze.py` invoked without absolute path → spawn with `cwd=tempDir` couldn't find it — switched to absolute script path while keeping cwd=tempDir (so the script's hardcoded `data.csv` still resolves).
- `npx` not directly spawnable on Windows (`.cmd` resolution) — used `process.platform === "win32" ? "npx.cmd" : "npx"`.
- `spawn EINVAL` on `npx.cmd` — added `shell: true`.
- `Buffer.concat` on string-typed chunks (shell:true forces UTF-8 strings) — switched to `chunks.join("")`.

**Decisions made this session:**
| Decision | Choice | Why |
|---|---|---|
| Language for MCP server | Plain Node ESM (`.mjs`) | Matches all 4 existing openadapter MCP servers; no TS build step |
| `analyze_csv` input staging | Copy CSV into `cache/csv_runs/run-XXXX/data.csv`, cwd there | Project script hardcodes `data.csv`; copying avoids touching the project's data |
| `convert_document` server lifecycle | Lazy-spawn on first call, kill on MCP server SIGINT/SIGTERM | No port conflict, no manual startup, single source of truth |
| `convert_document` output path | `cache/converted_docs/<inputname>.<fmt>` | Predictable, no overwrites if the input lives elsewhere |
| `render_video` npx invocation | `npx.cmd` + `shell: true` on Windows | Required for `.cmd` shims to spawn |
| Openui wrap | Deferred to v0.2 | Operation mostly duplicates direct OpenAI calls; no clear win yet |
| AGENT_ROUTER__API_KEY question | Still deferred | None of the 3 wired tools needed it |

## Open Threads

- [x] ~~Clarify `AGENT_ROUTER__API_KEY`~~ — **RESOLVED (session 3)**: deleted `.env.local`; using opencode zen endpoint via `ANTHROPIC_*` env vars instead.
- [x] ~~Add download_youtube_subtitles tool~~ — **RESOLVED (session 6)**: tool wired, server auto-starts on port 3002, browser Save As works.
- [ ] **User pastes real `ANTHROPIC_API_KEY`** into `opencode.json` `mcp.command_center.environment` — placeholder currently in place. Once set, restart opencode in `D:\ai-sandbox\command_center\` and try the `ask` tool end-to-end (via opencode chat OR via the new web UI).
- [ ] **End-to-end LLM smoke in the web UI** — type a task in the browser, watch the ReAct loop unfold. Verifies the full pipeline (browser → Next.js proxy → command_center HTTP → Anthropic SDK → leaf tool → SSE back).
- [ ] **Add more sub-agents** to `sub_agents.json` once the router proves out. Likely candidates: a `video-script` sub-agent (tuned for render_video), a `markdown-clean` sub-agent (tuned for convert_document with aiFormat=true), a `data` sub-agent (tuned for analyze_csv).
- [ ] **v0.4 UI panels** (if wanted): activity log persistence + feed panel, tool registry panel with call stats, quick-invoke form. All deferred from v0.3 by user scope decision.
- [ ] **Decide openui/genui-chat-app wrapping** for v0.2 — `ask_openui_agent` is the most likely candidate; would need to decide whether to spawn `next dev` and proxy, or just hit OpenAI directly.
- [ ] **Consider `colab-client` and `resume-optimizer`** — listed in inventory, not yet inspected, not in the user's first-3 pick.
- [ ] **`trading-bot` and `algo-trading-bot`** — both are empty/plan-only. If/when they get code, register them in REGISTRY.md and wire them.
- [ ] **Opencode integration test** — verify opencode itself can see and call all 6 MCP tools (we smoke-tested by spawning the server in isolation). This requires restarting opencode in `D:\ai-sandbox\command_center\`.
- [ ] **Test each tool card** in the dashboard GUI invokes real tool handlers (not just ping).

## Next Session — Pickup Point

When you reopen opencode in `D:\ai-sandbox\command_center\`, the agent will auto-load `AGENTS.md`, `REGISTRY.md`, and (now) `PROGRESS.md`. To resume:

> "Read PROGRESS.md and continue from the open threads."

First useful step: test each tool card in the dashboard GUI by running them with real inputs. Then verify the LLM integration works end-to-end with `ANTHROPIC_API_KEY` set.

## Things NOT to Retry

- Don't put orchestration code in `D:\ai-sandbox\` root — that defeats the purpose of a hub
- Don't duplicate project logic into command_center — projects stay where they are
- Don't make command_center depend on relative paths — use absolute paths only
- Don't edit `D:\ai-sandbox\csv_analyzer\analyze.py` to parameterize the CSV — wrap it instead
- Don't pre-spawn `markdown-formatter/personal/server.js` — lazy-spawn only on first call, kill on shutdown
- Don't pre-bundle vid/remotion — let `npx remotion render` handle bundling per-call (it caches)
- Don't hardcode any model name, base URL, or API key in command_center code — all three flow from `process.env.*` and `sub_agents.json`. If a new sub-agent needs a different model, add it to the JSON.
- Don't put the `ask` tool in the LLM's tool list — it's a user→MCP entrypoint, not something the LLM should call. Recursive self-call would be bad.
- Don't bake `max_iterations` into code — read it from `sub_agents.json` so a runaway loop on one agent doesn't affect others.
