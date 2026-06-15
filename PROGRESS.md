# Progress Log

## Sessions

### 2026-06-12 (session 9) â€” Puter.js Phase 1 + Phase 2: chat with function calling

**What we did â€” Phase 1 (Puter.js Foundation):**
- Added Puter.js SDK (`<script src="https://js.puter.com/v2/" async>`) to `dashboard/app/layout.tsx` `<head>`
- Created `dashboard/lib/puter.ts` â€” `usePuterAuth()` hook with SSR-safe `isReady` state, `PuterUser` type, `isPuterReady()`, `ensurePuterDirs()`, global `window.puter` type declarations
- Updated `dashboard/lib/types.ts` â€” added `PuterToolType`, `puterTool?` on `ToolDefinition`
- Added `txt2img` and `txt2vid` tool definitions to `dashboard/lib/tools.ts`
- Added icons: `image`, `video`, `cloud`, `logout`, `login` to `dashboard/components/icon.tsx`
- Rewrote `dashboard/components/tool-card.tsx` â€” Puter.js tool routing, inline media display, purple badge, auto-save to cloud
- Updated `dashboard/components/top-bar.tsx` â€” Puter sign-in/out UI, username display
- Updated `dashboard/app/api/status/route.ts` â€” tool count now `+2` for Puter.js client-side tools

**What we did â€” Phase 2 (Chat with Function Calling):**
- Added chat types to `dashboard/lib/types.ts`: `ChatMessageRole`, `ChatMessage`, `ToolCallInfo`
- Added `NavSection = "chat"` as the new default nav section
- Created `dashboard/lib/chat-engine.ts` â€” core chat logic:
  - `buildToolsArray()`: converts all 9 tools (7 backend + 2 Puter) into OpenAI function calling format for `puter.ai.chat()`
  - `runChat()`: streaming chat loop using `puter.ai.chat(messages, { model, tools, stream: true })`
  - Function calling loop: detects `tool_use` chunks â†’ executes backend tools via `POST /api/tools/call` â†’ executes Puter tools (txt2img/txt2vid) via `window.puter.ai` â†’ sends `role: "tool"` results back â†’ continues until no more tool calls or max 10 iterations
  - Real-time streaming: assistant text updates in place as chunks arrive
  - Tool call status tracking: pending â†’ running â†’ done/error, with visual indicators
  - Inline media: images and videos from `txt2img`/`txt2vid` rendered inline in both tool result cards and assistant messages
- Created `dashboard/components/chat-panel.tsx` â€” full chat UI:
  - Message list with user/assistant/tool/system bubbles
  - Model selector dropdown (gemini-3.5-flash default, plus gpt-5-nano, gpt-5.2-chat, claude-sonnet-4-5, claude-sonnet-4, grok-3-mini, deepseek-chat)
  - Multi-line input (Enter to send, Shift+Enter for newline)
  - Auto-scroll, streaming cursor, thinking indicator
  - Tool call cards with truncated args, running/done/error status
  - Empty state with tool list summary
  - Auth-gated: requires Puter sign-in before chatting
- Added icons: `send`, `user`, `bot`, `wrench` to `dashboard/components/icon.tsx`
- Updated `dashboard/components/sidebar.tsx` â€” Chat is now the first nav item (replaces Tools as default)
- Updated `dashboard/app/page.tsx` â€” default nav is `chat`, chat panel renders full-height

**Bugs found and fixed:**
- SSR `ReferenceError: window is not defined` during `next build` â€” `usePuterAuth()` returned `isReady: !!window?.puter` which throws in Node.js. Fixed by making `isReady` a `useState(false)` that flips inside `useEffect`.
- Puter `mkdir` option was `{ recursive: true }` (Node.js convention) but Puter API uses `{ createMissingParents: true }`. Fixed after checking docs.
- Duplicate `declare global` for `Window.puter` in both `puter.ts` and `chat-engine.ts` caused type error. Removed the one in chat-engine.ts; puter.ts is the single source of truth for the type.

**Build status:** `next build` passes cleanly (8/8 static pages, no errors). Page size: 12.8 kB (up from 9.34 kB, mainly chat-engine).

### 2026-06-12 (session 10) â€” Model name fixes + Puter 400/403 investigation

**What we did:**
- Fixed `gemini-3.5-flash` â†’ `google/gemini-3.5-flash` in `chat-engine.ts` (line 261 default param) and `chat-panel.tsx` (initial state + selector options)
- Updated model selector options to use `provider/model` format matching Puter's model list (e.g., `google/gemini-3.5-flash`, `openai/gpt-5.4-nano`, `anthropic/claude-3-5-sonnet`)
- Verified Puter.js v2 CDN source: 358KB minified at `https://js.puter.com/v2/`
- Reviewed Puter security docs: external websites authenticated via Puter.js automatically (no manual app registration needed); AI services (chat, txt2img, txt2vid) available by default after sign-in
- Build passes cleanly after all changes

**Root cause investigation (ongoing):**
- Puter 400 on `puter.ai.chat()`: likely `gemini-3.5-flash` not matching Puter's model registry (`google/gemini-3.5-flash` is the correct ID per listModels output)
- Puter 403 on `drivers/call` (txt2img/txt2vid): possibly user account balance issue or rate-limit on free tier
- Puter's `User-Pays Model` doc may explain 403s: AI calls deduct from user's Puter account balance

**Build status:** `next build` passes cleanly (8/8 static pages).

### 2026-06-13 (session 12) â€” Chat history persistence (in-session + across refresh)

**Bug:** Switching tabs in the dashboard unmounted `<ChatPanel />`, losing all visible messages + scroll position + input. Page refresh lost everything except the LLM-context history dump, which wasn't rehydrating the visible UI.

**Root cause:** `app/page.tsx` used `{nav === "chat" && <ChatPanel />}` â€” conditional render unmounts components on tab switch. And `chat-engine.ts` only wrote the LLM-format history to localStorage, never the UI snapshot, so rehydration was impossible.

**Fix (Option 3 from session-11 plan: both keep-alive + localStorage hydration):**

**Files changed:**
- `dashboard/app/page.tsx` â€” switched from conditional render to keep-alive with CSS visibility. Each panel mounts once; `nav` toggles a `hidden` Tailwind class via wrapper divs. `<main>` becomes `flex flex-col` with `flex-1 min-h-0` wrappers so heights compose correctly.
- `dashboard/lib/chat-engine.ts`:
  - Added `UI_KEY = "command_center:chat_ui"` separate from the LLM-format `HISTORY_KEY`
  - Added `loadUiMessages(): ChatMessage[]` â€” reads UI snapshot, validates shape, strips `streaming: true`
  - Added `saveUiMessages(messages)` â€” trims to 20 messages, filters out `system` role, writes immediately
  - `clearHistory()` now wipes both `HISTORY_KEY` and `UI_KEY`
- `dashboard/components/chat-panel.tsx`:
  - State initializer `() => loadUiMessages()` rehydrates on first render
  - New `useEffect(() => { saveUiMessages(messages) || removeItem }, [messages])` persists on every state change
  - Handles `messages.length === 0` (clears localStorage entry so empty state doesn't leave stale snapshot)

**Verified:**
- `next build` passes clean (page `/` from 11.6 kB â†’ 11.8 kB, +0.2 kB)
- All 5 panels detected in SSR HTML (page size 19 KB â†’ 39 KB due to keep-alive)
- `/api/chat` smoke test returned `delta:"pong"` correctly
- `/api/status` reports 7 tools, NVIDIA endpoint key configured

**Behavior now:**
- Tab switch (Tools â†” Chat) â†’ messages scroll position, input text, model selection all preserved
- Browser refresh â†’ chat rehydrates from localStorage showing last 20 messages with tool call chips
- "Clear" button â†’ nukes both LLM and UI snapshots

### 2026-06-13 (session 13) â€” 5 Remotion templates + compose_from_script (script-driven video)

**Architecture decision:** Discover that Remotion can render complete videos directly from images + a timed script, so `compose_from_script` is built instead of `composite_video` (which would composite overlays onto existing footage). LLM writes a .md production script, command_center parses it and renders a single MP4.

**Files added in `D:\ai-sandbox\vid\remotion\`:**
- `src/templates/TitleCard.tsx` â€” Centered title + subtitle with accent underline animation. Transparent background for compositing flexibility.
- `src/templates/InfoCard.tsx` â€” Floating card with heading + bullets. Configurable position (top-right/bottom-right/top-left/bottom-left), slide-in animation.
- `src/templates/LowerThird.tsx` â€” Broadcast-style name/title/description bar. Bottom-anchored, slide-in-from-left animation.
- `src/templates/OutroBumper.tsx` â€” Centered brand card with optional tagline. Scale-in entrance, gradient frame.
- `src/templates/BulletList.tsx` â€” Numbered bulleted list with staggered fade-in for each item.
- `src/script/ScriptVideo.tsx` â€” Reads `blocks` array prop, renders each block as a `<Sequence>` with the right kind/component. Includes internal `QuoteCard` and `BlankBlock` (gradient placeholder) for kinds not yet in the templates folder.
- `samples/weapons-101-ep4.md` â€” 34-second sample production script exercising all 7 block kinds.
- `src/Root.tsx` â€” Rewritten with 6 Remotion Compositions: TitleCard, InfoCard, LowerThird, OutroBumper, BulletList, ScriptVideo. Each has Zod-typed schema via `@remotion/zod-types` (already installed v4.0.462). ScriptVideo uses `calculateMetadata` to compute total duration from blocks.

**Files added/updated in `D:\ai-sandbox\command_center\`:**
- `tools/compose_from_script.mjs` (NEW) â€” Parses .md script with regex-based scanner, handles `[HH:MM:SS â†’ HH:MM:SS] <kind>` headers and `key: value` continuation lines, calls `render_video` internally with the parsed blocks.
- `tools/render_video.mjs` â€” Updated enum: `[TitleCard, InfoCard, LowerThird, OutroBumper, BulletList, ScriptVideo]`. Added `transparent` flag â†’ VP8 codec + YUVA420P for alpha-channel WebM output. Fixed Windows shell escaping issue by writing props to a temp JSON file and passing the file path.
- `tools/ask.mjs` â€” Added `compose_from_script` to LEAF_TOOLS.
- `server/index.mjs`, `server/http.mjs` â€” Added `compose_from_script` to all tool registrations.
- `dashboard/app/api/tools/call/route.ts` â€” Added `compose_from_script` to handlerMap.
- `dashboard/lib/tools.ts` â€” Replaced render_video card with new schema (composition dropdown with 6 options + transparent toggle); added compose_from_script card.
- `dashboard/lib/chat-engine.ts` â€” Updated `render_video` spec; added `compose_from_script` spec.
- `dashboard/app/api/status/route.ts` â€” Tool count fallback 7 â†’ 8.

**Removed:**
- `D:\ai-sandbox\vid\remotion\src\StickmanFight\` (orphan demo, not imported)

**Verified end-to-end:**
- Remotion `npm run build` (remotion bundle) â€” clean, 6 compositions registered
- `npm run next build` (dashboard) â€” clean, 8/8 pages
- HTTP `/api/status` â†’ `toolCount: 8`
- `render_video` test with file-based props â†’ TitleCard rendered to 425KB MP4
- `render_video` test with `ScriptVideo` + 2 blocks â†’ 397KB MP4
- `compose_from_script` with full weapons-101-ep4.md â†’ 7 blocks parsed, 34-second video rendered to 1.6MB MP4
- Chat endpoint with `compose_from_script` in tools â†’ model correctly emits `tool_call_delta` with the script path

**Build status:** `next build` 12.3 kB (up from 11.8 kB due to extra tool wiring).

### 2026-06-13 (session 14) â€” Project progress duplicate-key fix

**Bug:** Next.js console error: "Encountered two children with the same key, `openui/genui-chat-app`" when navigating to the Projects tab.

**Root cause:** `REGISTRY.md` had two rows with `name = openui/genui-chat-app` (lines 14 and 19). The `/api/projects` route pulled both rows through, and `ProjectCard` was using `key={proj.name}` which collided.

**Fix:**
- `dashboard/app/api/projects/route.ts` â€” added dedupe pass that builds a `Map<key>` from `path::name`. When two entries collide, prefer the one with a real `toolName` ("â€”" or empty means it lost the tiebreaker). 9 unique projects returned (was 10 with the dup).
- `dashboard/components/project-progress.tsx` â€” `key={proj.name}` â†’ `key={`${proj.path}::${proj.name}`}`. Defense in depth even though the API now dedupes.

**Verified:**
- `/api/projects` returns 9 unique projects, no duplicates by name or by composite key
- `next build` clean

### 2026-06-13 (session 15) â€” Tools/Projects/Pending/Settings scroll fix

**Bug:** Tools page (and others) wouldn't scroll after the chat-persistence keep-alive refactor. The page itself was unscrollable because content overflowed `<main>` which was set to `overflow-hidden` so panels could keep-alive via flex siblings.

**Root cause:** Session 12 changed `<main>` from `{nav === "x" && <Panel />}` (conditional render) to `<main class="flex-1 flex flex-col overflow-hidden">{siblings gated by 'hidden'}</main>` so panels wouldn't unmount on tab switch. The sibling wrappers got `flex-1 min-h-0` so they flex-fill the column. But:
- The wrappers themselves don't scroll (`overflow-hidden`)
- ChatPanel happened to work because it has internal `<div class="flex h-full flex-col">` with its own `overflow-y-auto` scroll areas (messages list, header sticky)
- The 4 other panels (`ToolRunner`, `PendingTasks`, `ProjectProgress`, `Settings`) were authored as flat `<div class="animate-fade-in">` â€” they relied on `<main>` for scrolling, but `<main>` no longer scrolls after the refactor
- With only 5â€“7 tools, overflow wasn't visible; the bug only became apparent at 8 tools when tools page grew taller than the viewport

**Fix:** Each non-chat panel root now owns its own scroll, matching chat-panel's pattern (`flex h-full flex-col overflow-y-auto animate-fade-in`):
- `dashboard/components/tool-runner.tsx` â€” added `flex h-full flex-col overflow-y-auto` to root
- `dashboard/components/pending-tasks.tsx` â€” same
- `dashboard/components/project-progress.tsx` â€” same
- `dashboard/components/settings.tsx` â€” same

`app/page.tsx` keep-alive `<main class="flex-1 flex flex-col overflow-hidden">` is **unchanged** â€” that's correct. Each panel now matches the `ChatPanel` flex-h-full-overflow pattern.

**Verified:** Build clean, SSR HTML confirms all 5 panels mount with the correct wrapper structure.

### 2026-06-13 (session 16) â€” Drop legacy `_web_archived/`

Cleaned up the v0.3 Next.js Mission-Control UI that had been renamed (not deleted) in `d15bec1` (session 11â€“14 commit). 

- 16 source files staged via `git rm -r _web_archived/` â€” folder entirely removed from git index
- Local folder also deleted (444 MB of ignored `node_modules/`, `.next/`, `*.tsbuildinfo` garbage freed)
- Recoverable from git history at any point: `git checkout 58ad0c9 -- web/` revives the original `web/` folder
- No refs to `_web_archived/` existed in active code (verified across repo); PROGRESS.md narrative entries from v0.3 stay since they're historical context

### 2026-06-13 (session 17) â€” REGISTRY dedupe + PROGRESS cleanup

**A: REGISTRY.md duplicates removed.** Two rows for `openui/genui-chat-app` were merged (kept the more-detailed version: Next.js 16, `gpt-5.2`, `OPENAI_API_KEY`). `colab-client` row accidentally removed during merge was restored. Committed `148ffac`. Now 12 unique rows; `/api/projects` composite-key dedupe is no longer compensating for data-level dupes.

**G: Stale threads closed in PROGRESS.md.**
- âœ“ "User pastes real `ANTHROPIC_API_KEY`" â€” closed (session 11 superseded Anthropic with NVIDIA)
- âœ“ "End-to-end LLM smoke in the web UI" â€” closed (SSE chat confirmed working in session 11)
- âœ“ "REGISTRY.md duplicate `openui/genui-chat-app` row" â€” closed (this session, A above)
- âœŽ Refreshed remaining open threads with current tool count (8, not 6), added COLAB wrap target, refined the sub-agents and per-card smoke descriptions.
- âœŽ "Next Session â€” Pickup Point" rewritten to reflect today's actual backlog (per-card UI smoke + Remotion templates + openui/resume-optimizer wrappings).

No code-level changes this session beyond the REGISTRY.md markdown.

### 2026-06-13 (session 18) â€” Drop OpenUI stock clone

Removed `D:\ai-sandbox\openui\genui-chat-app\` â€” a stock `openui-cli` bootstrap of the [OpenUI](https://www.openui.com/) "GenUI Chat" example, never customized or run. OpenUI is a generative UI framework (LLM composes custom React UIs in a compact streaming language). After inspection:

- **Cannot improve command_center dashboard:** the dashboard is a pre-determined tabbed control panel, not a generative UI surface. OpenUI would replace our tab layout, tool picker, model selector, and the keep-alive chat we just built â€” a net loss.
- **If ever needed:** `npx @openuidev/cli@latest create <dir>` fetches the latest version in 30 seconds. The May 2026 clone is stale.

**Changes:**
- `openui/genui-chat-app/` row removed from REGISTRY.md (12 â†’ 11 rows)
- OpenUI wrapping open thread closed in PROGRESS.md
- Folder deleted (you're handling the locked files manually)

### 2026-06-13 (session 19) -- video-script skill made pipeline-agnostic

Refactored the `video-script` skill (at `~/.agents/skills/video-script/SKILL.md`) to be reusable across any video rendering pipeline, not just command_center's compose_from_script. Removed 4 command_center-specific references:

- Line 7: purpose now says 'produce a complete .md production script file for any video rendering pipeline'
- Line 364: output path is user-specified or defaults to `<topic-slug>.md` in CWD (was hardcoded to D:\ai-sandbox\command_center\cache\scripts\)
- Line 366: format described as 'standard production script format' (was 'compose_from_script format')
- Line 375: post-write prompt mentions 'Remotion, ffmpeg, or any video pipeline' (was just compose_from_script)

The block format itself (timestamps, kinds, voice annotations) was already generic -- no changes needed to the structure.

**Changes:**
- `~/.agents/skills/video-script/SKILL.md` refactored
- Brain note saved: `global/decisions/2026-06-13-video-script-pipeline-agnostic.md`
- Session log updated with session 19 entry

**Decision rationale:** user does not want the skill locked to command_center. A general-purpose video script skill is more valuable -- it produces portable scripts consumable by any rendering pipeline.

### 2026-06-13 (session 11) â€” Puter removed, dashboard chat migrated to NVIDIA direct

**Big architecture change:** Puter.js was removed from the dashboard. Decisions:
- User-pays inference on Puter + lack of any real UI primitives from Puter + free-route to image/video = decided to drop Puter entirely from the dashboard
- Dashboard chat now proxied through `dashboard/app/api/chat/route.ts` (SSE) â†’ server-side OpenAI SDK â†’ user's LLM provider (NVIDIA / NagaAI / OpenRouter all work via `LLM_BASE_URL` env var; OpenAI direct too)
- Image/video (`txt2img`, `txt2vid`) tools deleted project-wide â€” there's no free LLM pathway for them

**Files deleted:**
- `dashboard/lib/puter.ts` (usePuterAuth, ensurePuterDirs, global window.puter types)
- `dashboard/components/puter-script.tsx` (DOM-injected Puter.js script component)

**Files added:**
- `dashboard/app/api/chat/route.ts` â€” SSE proxy to user's LLM provider, accepts `{messages, tools, model}`, emits `event: meta` / `event: text` / `event: tool_call_delta` / `event: finish` / `event: done` / `event: error`
- `dashboard/.env.local` â€” points to NVIDIA direct (`https://integrate.api.nvidia.com/v1`, `openai/gpt-oss-120b`)

**Files rewritten:**
- `dashboard/lib/chat-engine.ts` â€” now consumes SSE from `/api/chat`, accumulates tool_call deltas, runs tool calls, manages history persistence (localStorage, 20-message trim). Removed Puter-specific code.
- `dashboard/components/chat-panel.tsx` â€” removed usePuterAuth + sign-in gate, simplified model selector to 4 NVIDIA models, added "Clear" button for history
- `dashboard/components/tool-card.tsx` â€” removed runPuterTool + inline media state, returns "use Chat tab instead" for `ask`
- `dashboard/components/top-bar.tsx` â€” removed Puter sign-in / sign-out / status badge / login+logout icons
- `dashboard/app/layout.tsx` â€” removed `<PuterScript />` from `<body>`
- `dashboard/app/api/status/route.ts` â€” read env vars `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` with `NVIDIA_*` + `ANTHROPIC_*` fallbacks. Note updated.
- `dashboard/lib/types.ts` â€” removed `PuterToolType`, `puterTool?` field, `mediaUrl`/`mediaType` from `ChatMessage`
- `dashboard/lib/tools.ts` â€” removed `txt2img` and `txt2vid` definitions

**Other changes:**
- `dashboard/package.json` â€” added `openai` dependency for SSE proxy

**Verified end-to-end:**
- Dashboard chat SSE: âœ… streams text + tool_call deltas
- Tool calling loop: âœ… model emits `tool_calls`, accumulated, executed via `/api/tools/call`, result fed back to model, got coherent summary ("The server is online and functioning normally (status='ok', version='0.1.0')")
- Tested with `openai/gpt-oss-120b` on NVIDIA direct â€” completed at 6-tool function-calling test (ping only in this smoke; analyze_csv / others work because they use the same `/api/tools/call` dispatch path)
- `/api/status` shows: `toolCount: 7, keyConfigured: true, baseUrl: https://integrate.api.nvidia.com/v1, model: openai/gpt-oss-120b`

**Build status:** `next build` passes cleanly (8/8 static pages, page `/` dropped from 13.2 kB â†’ 11.6 kB after Puter removal).

### 2026-06-11 (session 8) â€” AGENTS.md rewrite + architecture clarification + README plain-English

**What we did:**
- Rewrote `AGENTS.md` from 67 lines of outdated "v0 planning" content to self-contained thin context (~55 lines)
- Removed "See Also" section pointing to README.md â€” context waste (agent won't follow unprompted, and if it does, 168 extra lines burned for nothing)
- Updated to v0.5 with 7 tools, all 4 surfaces, key conventions
- Clarified MCP vs HTTP architecture: MCP is for AI clients (opencode), HTTP is for dashboard/scripts. If dashboard-only, MCP is dead weight. Same handlers, different transport.
- Rewrote README.md "Architecture" and "Surfaces" sections in plain English â€” three use cases (browser, AI client, scripts), who uses each surface, how it works
- Removed duplicate Surfaces table

### 2026-06-10 (session 7) â€” Port registry + global memobrain

**What we did:**
- Created `PORT-REGISTRY.md` tracking all project port assignments in `D:\ai-sandbox\`
- Moved port registry to global memobrain (`D:\ai-sandbox\Obsidian Vault\AI-Memory\global\learnings\port-registry.md`) â€” it's cross-project, not command_center-specific
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

### 2026-06-10 (session 6) â€” v0.5 dashboard GUI + download_youtube_subtitles

**What we did:**
- Added `download_youtube_subtitles` tool â€” wraps `youtube-subtitle-download-plus-format` project (port 3002), downloads YouTube transcripts, optionally formats with LLM, supports md/txt/zip/raw output.
- Fixed subtitle server PORT inheritance bug: `process.env.PORT || 3002` picked up parent env PORT=3000 â†’ hardcoded `const PORT = 3002`.
- Added resilient `ensureServer()` with stderr capture and re-ping-on-exit logic to both `download_youtube_subtitles.mjs` and `convert_document.mjs`.
- Built browser "Save As" download feature: `downloadToBrowser` flag returns base64-encoded content + filename + mimeType in a `download` payload. Frontend triggers `showSaveFilePicker` (Chrome/Edge) or falls back to anchor download.
- Added `download` field to `ToolCallResponse` type, `download` icon to `icon.tsx`, `download_youtube_subtitles` to handler map in `route.ts`.
- Fixed LLM credentials pass-through: `formatWithLLM`, `llmBaseUrl`, `llmApiKey`, `llmModel` now sent to `/api/format` endpoint.
- Added `formatWithLLM` toggle to the dashboard tool definition (defaults to true).
- Generated filename from content (first H1 heading â†’ sanitized slug) with fallback to videoId.
- Dashboard builds successfully (`npm run build` passes).

**Key files added/changed:**
```
D:\ai-sandbox\command_center\
â”œâ”€â”€ tools\download_youtube_subtitles.mjs     (NEW â€” downloadToBrowser, filename generation)
â”œâ”€â”€ tools\convert_document.mjs               (resilient ensureServer)
â”œâ”€â”€ dashboard\
â”‚   â”œâ”€â”€ app\api\tools\call\route.ts          (download payload pass-through)
â”‚   â”œâ”€â”€ lib\types.ts                          (+ download field)
â”‚   â”œâ”€â”€ lib\tools.ts                          (+ download_youtube_subtitles definition)
â”‚   â”œâ”€â”€ components\icon.tsx                   (+ youtube, download icons)
â”‚   â”œâ”€â”€ components\tool-card.tsx              (Save As button + blob download)
â”‚   â”œâ”€â”€ README.md                             (updated â€” youtube tool + auto-start notes)
â”‚   â””â”€â”€ package.json                          (next 15.5.19)
â”œâ”€â”€ README.md                                 (NEW â€” project-level)
â””â”€â”€ REGISTRY.md                               (updated â€” youtube-subtitle project + tool)
```

### 2026-06-07 (session 5) â€” v0.3.1 single-command dev orchestrator

**What we did:**
- Added `dev.mjs` â€” zero-dep orchestrator that spawns `node server/http.mjs` + `node node_modules/next/dist/bin/next dev` in `web/`, prefixes output with ANSI colors (`[http]` cyan, `[web]` magenta, `[orchestrator]` gray), waits for http to be ready before starting web, and cleans up both on SIGINT/SIGTERM/exit.
- Added `start-dev.bat` â€” double-click launcher (`cd /d "%~dp0" && call npm run dev`) with `pause` on error.
- Added `"dev": "node dev.mjs"` to `package.json` scripts.
- Wrote `test/smoke_dev.mjs` â€” 8 assertions verifying orchestrator boots both servers, proxy works, SSE streams, and both trees are killed on Ctrl+C.
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
| Startup ordering | http first â†’ wait ready â†’ web | web's `/api/ask` proxy targets http, so http must be up first or the first 1-2s of user activity gets a proxy error |
| Shutdown ordering | Both children killed in parallel, 800ms wait, then exit | Let taskkill deliver, then orch exits. |
| Startup script for users | `start-dev.bat` (double-click) | Some users will double-click rather than type commands. Same `npm run dev` underneath. |

**Bugs found and fixed mid-slice:**
- `child.kill("SIGINT")` on Windows doesn't cascade through npm/child node processes â†’ the test waited 30s+ and port 3010 was still held. Fixed with `taskkill /F /T /PID`.
- Initial `dev.mjs` used `npm run http` and `npm run dev` â†’ 4 processes deep. Switched to direct `node` invocations â†’ 2 processes (orch + 2 children). Test now runs in ~15s instead of timing out at 120s.
- `next start` (production) needs `next build` first â†’ `smoke_web.mjs` now runs `next build` as a precondition (one-time, ~10s).
- Powershell `> /dev/null` doesn't work (Windows shell, not bash) â†’ use `*> $null` instead.

**How to use it:**
```powershell
# Option A: from terminal
cd D:\ai-sandbox\command_center
npm run dev

# Option B: double-click
D:\ai-sandbox\command_center\start-dev.bat
```
Then open `http://localhost:3000`. With a real `ANTHROPIC_API_KEY` in `mcp.command_center.environment`, type a task and watch the ReAct loop.

### 2026-06-07 (session 4) â€” v0.3 HTTP API + mission-control web UI

**What we did:**
- Refactored `tools/ask.mjs` to emit events via `hooks.onEvent` callback. The MCP path is unchanged (no onEvent passed â†’ no-op), but the HTTP/SSE path can now stream every step of the ReAct loop in real-time.
- Installed `express` in command_center root
- Added `server/http.mjs` â€” small Express app on port 3010 (configurable via `CC_HTTP_PORT`). Endpoints:
  - `GET /` â€” server info
  - `GET /tools` â€” full tool list with schemas
  - `GET /status` â€” health (model configured, key configured, base URL, port)
  - `GET /ping` â€” health check
  - `POST /tools/call` â€” call any tool by name
  - `POST /ask` â€” **SSE** streaming of the ReAct loop (events: `start`, `iteration`, `llm_text`, `tool_use`, `tool_result`, `final`, `result`, `error`)
- CORS allowlist defaults to `http://localhost:3000` (configurable via `CC_HTTP_ALLOWED_ORIGIN`)
- Added `npm run http` script; `npm run mcp` and `npm start` both work for the MCP server
- Scaffolded `web/` â€” Next.js 15 + React 19 + Tailwind v4
- Built the mission-control page (`app/page.tsx`) with:
  - Status bar (run state, agent selector, event count, clear button)
  - ReAct timeline (groups events into iterations, renders start / iteration / turn / final / error cards)
  - Collapsible tool-call cards (input + result with character count, expand to see full output)
  - Auto-scroll to latest event
  - Dark theme + monospace + neon accents (emerald/cyan/amber/red/purple) for the "command center" feel
- Built the `/api/ask` route handler â€” thin SSE proxy to command_center HTTP. Handles 502 + clear error event when command_center is down.
- Wrote `test/smoke_http.mjs` (10/10 pass) and `test/smoke_web.mjs` (6/6 pass â€” full integration: spawn both servers, hit page, hit proxy, verify SSE event types, verify proxy-down error)
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
- Next.js build warnings: `experimental.typedRoutes` deprecated â†’ removed the block. Multi-lockfile warning from parent `command_center/package-lock.json` â†’ set `outputFileTracingRoot` in `web/next.config.ts`.
- First version of `test/smoke_web.mjs` had a false-positive proxy-down check (didn't actually stop command_center, just re-hit the URL). Fixed to kill command_center first, then verify the proxy error event surfaces.

**Key files added/changed this session:**
```
D:\ai-sandbox\command_center\
â”œâ”€â”€ package.json                            (+ express)
â”œâ”€â”€ server\http.mjs                         (NEW â€” Express app, SSE, 6 endpoints)
â”œâ”€â”€ tools\ask.mjs                           (refactored â€” emit events via onEvent)
â”œâ”€â”€ test\smoke_http.mjs                     (NEW â€” 10/10)
â”œâ”€â”€ test\smoke_web.mjs                      (NEW â€” 6/6, full integration)
â””â”€â”€ web\                                    (NEW â€” Next.js 15 mission control)
    â”œâ”€â”€ package.json
    â”œâ”€â”€ next.config.ts
    â”œâ”€â”€ tsconfig.json
    â”œâ”€â”€ postcss.config.mjs
    â”œâ”€â”€ README.md                           (NEW â€” usage + architecture)
    â”œâ”€â”€ app\
    â”‚   â”œâ”€â”€ layout.tsx
    â”‚   â”œâ”€â”€ page.tsx                        (mission control)
    â”‚   â”œâ”€â”€ globals.css                     (Tailwind v4 dark theme)
    â”‚   â””â”€â”€ api\ask\route.ts                (SSE proxy to command_center)
    â”œâ”€â”€ components\
    â”‚   â”œâ”€â”€ StatusBar.tsx
    â”‚   â”œâ”€â”€ ChatInput.tsx
    â”‚   â”œâ”€â”€ ReActTimeline.tsx
    â”‚   â””â”€â”€ EventCard.tsx
    â””â”€â”€ lib\types.ts
```

**To run the dashboard:**
```powershell
# Terminal 1
cd D:\ai-sandbox\command_center
npm run http

# Terminal 2
cd D:\ai-sandbox\command_center\web
npm run dev
# â†’ http://localhost:3000
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

### 2026-06-07 (session 3) â€” v0.2 sub-agents + LLM routing

**What we did:**
- Added `@anthropic-ai/sdk` to `package.json` (5 transitive packages, 0 vulnerabilities)
- Created `sub_agents.json` â€” registry of named sub-agents. Seeded with one: `router` (system prompt + `allowed_tools: ["*"]`)
- Wrote `tools/ask.mjs` â€” the user-facing MCP tool that:
  - Accepts `{ agent?: string, task: string }`
  - Resolves model in this order: per-agent `model` â†’ `sub_agents.json default_model` â†’ `ANTHROPIC_MODEL` env. No hardcoded fallback.
  - Loads sub-agent config (system prompt, allowed tools, max_iterations)
  - Builds the LLM's tool list from the LEAF tools (analyze_csv, convert_document, render_video, ping), filtered by `allowed_tools`. The `ask` tool is NEVER in the LLM's tool list (no recursive self-call).
  - Runs a ReAct loop: call LLM â†’ if it emits `tool_use` blocks, run each leaf tool, feed `tool_result` blocks back, repeat. Bounded by `max_iterations` (default 10).
  - Returns the final text + a JSON log of every iteration (which tool was called, what input, what stop_reason).
- Registered `ask` in `server/index.mjs`
- Added `environment` block to `mcp.command_center` in `~/.config/opencode/opencode.json`:
  - `ANTHROPIC_BASE_URL` = `https://opencode.ai/zen`
  - `ANTHROPIC_MODEL` = `minimax-m2.5-free` (placeholder; user will change)
  - `ANTHROPIC_API_KEY` = `<paste-your-anthropic-key-here>` (user fills in)
- Wrote `test/smoke_ask.mjs` â€” verifies (1) `ask` shows in `tools/list`, (2) missing key returns a clear pointer to the config block, (3) unknown agent name is reported.
- All 3 smoke checks pass. Existing `smoke.mjs` (ping) still passes â€” no regressions.

**Design decisions:**
| Decision | Choice | Why |
|---|---|---|
| SDK | `@anthropic-ai/sdk` (official) | opencode zen is Anthropic-API-compatible; SDK handles tool-use / tool_result formatting cleanly |
| Config location | `mcp.command_center.environment` in `opencode.json` | Matches the other MCP servers' pattern (describe_image, generate_image, edit_image use the same block); no new .env file |
| Model storage | `sub_agents.json` per-agent + env default | User explicitly requested: "do not have it baked in." Both layers are editable in seconds. No fallback past the env var â€” missing model returns a clear error listing the 3 places to set it. |
| Sub-agent registry | `sub_agents.json` (JSON) | User asked for file-based, not UI. Editable by hand. |
| Tool list visible to LLM | Leaf tools only (analyze_csv, convert_document, render_video, ping) | The `ask` wrapper is a userâ†’MCP entrypoint, not a tool the LLM should call. Excluding it prevents recursive self-call. |
| Validation order | task â†’ agent name â†’ model â†’ API key â†’ loop | Cheap/config errors fire first, env errors right before the LLM call. User sees the most actionable error. |
| Loop bound | `max_iterations` from sub_agents.json (default 10) | Prevents runaway loops if the LLM keeps calling tools. |
| First seed | Just the `router` sub-agent | Proves the loop works; more specialists added later by editing sub_agents.json. |
| `ENABLE TOOL SEARCH: true` | Noted but not set in opencode.json | That's an opencode-client feature, not something the MCP server reads. User can set it on the opencode side independently. |

**Bugs found and fixed mid-slice:**
- Validation order bug: ANTHROPIC_API_KEY check fired before agent-name check, so the user saw "key missing" before learning the agent name was wrong. Reordered so config errors (agent name, model) come first, env error last.

**Key files added/changed this session:**
```
D:\ai-sandbox\command_center\
â”œâ”€â”€ package.json                            (+ @anthropic-ai/sdk)
â”œâ”€â”€ package-lock.json                       (updated)
â”œâ”€â”€ sub_agents.json                         (NEW â€” sub-agent registry)
â”œâ”€â”€ tools\ask.mjs                           (NEW â€” ReAct agent loop)
â”œâ”€â”€ server\index.mjs                        (+ 2 lines: import + register)
â””â”€â”€ test\smoke_ask.mjs                      (NEW â€” 3 assertions, all pass)

C:\Users\iquah\.config\opencode\opencode.json
â””â”€â”€ mcp.command_center.environment          (NEW â€” ANTHROPIC_BASE_URL / _MODEL / _API_KEY)
```

**Still to do before end-to-end LLM test works:**
- [ ] User pastes their real `ANTHROPIC_API_KEY` into `opencode.json` â†’ `mcp.command_center.environment.ANTHROPIC_API_KEY`
- [ ] (Optional) User sets `ANTHROPIC_MODEL` to whatever they actually want (currently `minimax-m2.5-free` placeholder)
- [ ] Restart opencode in `D:\ai-sandbox\command_center\` so it picks up the new env block and the new `ask` tool
- [ ] From an opencode chat: `ask the router to ping the hub` â€” should round-trip through the LLM and return a short answer

**Not tested in this session (requires real API key):**
- The actual LLM call (ReAct loop in motion)
- Tool use by the LLM (does the model emit valid `tool_use` blocks? do the leaf tools run from the LLM's request?)
- Sub-agent system prompt actually routing intent to the right tool

These will be smoke-tested manually by the user once the key is in place.

### 2026-06-07 (session 2) â€” v0.1 build

**What we did:**
- Sliced into 5 vertical increments; each landed in a testable, verified state
- Scaffolded the hub: `package.json` (ESM, `@modelcontextprotocol/sdk@^1.29.0`), `server/index.mjs`, `tools/ping.mjs`
- Registered the MCP server in `~/.config/opencode/opencode.json` as `command_center` (type: local, stdio)
- Wired 3 tools, each smoke-tested end-to-end against the real project:
  - `analyze_csv` â€” copies input CSV into a per-run temp dir, spawns `python analyze.py`, captures stdout, returns it. User CSV never modified. Test ran on `D:\ai-sandbox\csv_analyzer\data.csv` (74 rows, $2.18 total).
  - `convert_document` â€” lazy-spawns `markdown-formatter/personal/server.js` on port 3001 (only if `/api/formats` is unreachable), POSTs multipart file to `/api/convert`, writes the binary response to `cache/converted_docs/`. Verified mdâ†’html, mdâ†’md (no AI), mdâ†’md (with AI formatter). Output dir auto-created.
  - `render_video` â€” spawns `npx remotion render src/index.ts <comp> <out>.mp4` in the vid/remotion project, streams progress to MCP stderr. Verified by producing `D:\ai-sandbox\command_center\cache\videos\stickman.mp4` (720 KB, 5s @ 30fps 1920x1080).
- Inspected the 4 remaining projects:
  - `algo-trading-bot` â€” empty repo; only contains `.sisyphus/plans/ai-influencer-personal-finance.md` (a plan, **not** trading code). **Not wrappable. Misnamed.**
  - `trading-bot` â€” empty scaffold; all `src/{core,backtest,live,skills,utils,data}` dirs are empty. Has `project-structure.md` (plan), 232K conv dump, 165K JSON. **Not wrappable yet â€” no implementation.**
  - `voice-cloner` â€” single ComfyUI workflow JSON for Qwen3-TTS (Chinese-named file). **Asset, not a project.**
  - `openui/genui-chat-app` â€” real Next.js 16 app, `POST /api/chat` streams from `gpt-5.2` via `OPENAI_API_KEY`. **Wrappable** but operation is borderline-redundant with direct OpenAI calls. Deferred to v0.2.

**Course-corrections this session:**
- User redirected: drop `text_File_Converter` from the wire-up list, use `D:\ai-sandbox\markdown-formatter\personal\` instead. Discovered the folder contains two near-identical sub-projects (`text-convert-format-public/` and `personal/`); chose `personal/` (cleaner LLM-creds handling via `config.js`).
- Updated `REGISTRY.md` accordingly; marked `text_File_Converter` as **dropped**.

**Key files added:**
```
D:\ai-sandbox\command_center\
â”œâ”€â”€ package.json
â”œâ”€â”€ package-lock.json
â”œâ”€â”€ node_modules/                 (92 packages)
â”œâ”€â”€ server\index.mjs              (MCP entry; 49 lines)
â”œâ”€â”€ tools\ping.mjs                (sanity-check tool)
â”œâ”€â”€ tools\analyze_csv.mjs         (real impl)
â”œâ”€â”€ tools\convert_document.mjs    (real impl, lazy-spawns server)
â”œâ”€â”€ tools\render_video.mjs        (real impl, npx remotion render)
â”œâ”€â”€ test\smoke.mjs                (Slice 1)
â”œâ”€â”€ test\smoke_analyze.mjs        (Slice 2)
â”œâ”€â”€ test\smoke_convert.mjs        (Slice 3)
â”œâ”€â”€ test\smoke_convert_ai.mjs     (Slice 3, AI path)
â”œâ”€â”€ test\smoke_render.mjs         (Slice 4)
â”œâ”€â”€ test\smoke_npx_chunks.mjs     (Slice 4, chunk-type sanity)
â”œâ”€â”€ test\sample.md                (convert test input)
â””â”€â”€ cache\                        (gitignored runtime outputs)
    â”œâ”€â”€ csv_runs\
    â”œâ”€â”€ converted_docs\sample.html
    â”œâ”€â”€ converted_docs\sample.md
    â””â”€â”€ videos\stickman.mp4
```

**Bugs found and fixed mid-slice:**
- `mkdtemp` failed because `cache/csv_runs/` didn't exist â€” added `mkdir(..., {recursive: true})` before it.
- `analyze.py` invoked without absolute path â†’ spawn with `cwd=tempDir` couldn't find it â€” switched to absolute script path while keeping cwd=tempDir (so the script's hardcoded `data.csv` still resolves).
- `npx` not directly spawnable on Windows (`.cmd` resolution) â€” used `process.platform === "win32" ? "npx.cmd" : "npx"`.
- `spawn EINVAL` on `npx.cmd` â€” added `shell: true`.
- `Buffer.concat` on string-typed chunks (shell:true forces UTF-8 strings) â€” switched to `chunks.join("")`.

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

- [x] ~~Clarify `AGENT_ROUTER__API_KEY`~~ â€” **RESOLVED (session 3)**: deleted `.env.local`; using opencode zen endpoint via `ANTHROPIC_*` env vars instead.
- [x] ~~Add download_youtube_subtitles tool~~ â€” **RESOLVED (session 6)**: tool wired, server auto-starts on port 3002, browser Save As works.
- [x] ~~User pastes real `ANTHROPIC_API_KEY`~~ â€” **RESOLVED (session 11)**: deprecated. Anthropic is no longer the chat provider â€” dashboard chat migrated to NVIDIA via `/api/chat` SSE proxy. `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` in `dashboard/.env.local` is the new contract; `ANTHROPIC_*` is only retained as fallback for the `/api/status` config endpoint.
- [x] ~~End-to-end LLM smoke in the web UI~~ â€” **RESOLVED (session 11)**: SSE chat round-trip working on NVIDIA `openai/gpt-oss-120b`. Tool-call smoke confirmed (LLM emits `tool_calls`, `/api/tools/call` dispatches, results stream back).
- [x] ~~REGISTRY.md duplicate `openui/genui-chat-app` row~~ â€” **RESOLVED (session 17)**: dedupe-by-path fallback no longer needed (rows merged); `colab-client` row restored which had been accidentally removed during the merge. Commit `148ffac`.
- [x] ~~Add more sub-agents~~ — **SUPERSEDED (session 18)**: user prefers skills-and-folders approach over sub-agents. `video-script` skill built (see `~/.agents/skills/video-script/SKILL.md`). `markdown-clean` and `data` skills deferred to future sessions.
- [ ] **v0.4 UI panels** (if wanted): activity log persistence + feed panel, tool registry panel with call stats, quick-invoke form. All deferred from v0.3 by user scope decision.
- [x] ~~Decide openui/genui-chat-app wrapping~~ â€” **RESOLVED (session 18)**: stock May clone, never run, never customized. Generative UI framework by Thesys Inc. â€” not suitable for command_center's tabbed control-panel dashboard. Re-clone via `npx @openuidev/cli@latest create` if ever needed. Row dropped from REGISTRY; folder deleted from disk.
- [ ] **Wrap `resume-optimizer`** â€” REGISTRY says `optimize_resume` (planned). Resume-optimizer is a full Next.js app; wrapping it means spawning `npm run dev` + a tool that posts resumes + reads optimized output.
- [ ] **`trading-bot` and `algo-trading-bot`** â€” both are empty/plan-only. If/when they get code, register them in REGISTRY.md and wire them.
- [ ] **Opencode integration test** â€” verify opencode itself can see and call all 8 MCP tools (`ping`, `analyze_csv`, `convert_document`, `format_document`, `render_video`, `compose_from_script`, `download_youtube_subtitles`, `ask`). Requires restarting opencode in `D:\ai-sandbox\command_center\`.
- [ ] **Per-card dashboard GUI smoke** for all 8 tools â€” exercised ad hoc (ping, render_video), but each card's full `/api/tools/call` dispatch path through the UI not yet verified. compose_from_script demoed end-to-end last session.

## Deferred: Set up spare laptop as home server (Tailscale)

The user has a spare laptop and wants to host command_center on it 24/7, accessed from their main laptop over the internet. Plan and steps captured in the brain note: `global/learnings/2026-06-13-home-server-tailscale-plan.md` (Tailscale VPN, no port forwarding, free for personal use). User explicitly deferred this to "later." When ready: install Tailscale on both laptops, clone repo on spare, `npm run dev`, access dashboard at `http://100.x.x.x:3000`.

## Deferred: Voiceover support for compose_from_script

Add TTS integration to render audio tracks from `voice:` annotations in script blocks. The `video-script` skill already outputs `voice:` metadata (pace, energy, emphasis, pauses) in each block. Currently ignored by Remotion. When ready:

- Choose TTS engine (ElevenLabs, OpenAI TTS, or local model)
- Add `voice:` key parsing to `compose_from_script.mjs`
- Generate audio per block using vocal annotations
- Mix audio track with rendered video via ffmpeg
- Output MP4 with audio

Blocked on: TTS API access (cost consideration), engine choice, audio mixing complexity.

## Next Session â€” Pickup Point

When you reopen opencode in `D:\ai-sandbox\command_center\`, the agent will auto-load `AGENTS.md`, `REGISTRY.md`, and `PROGRESS.md`. To resume:

> "Read PROGRESS.md and continue from the open threads."

First useful step: try the new `video-script` skill (generate a test video with `compose_from_script`), then add more Remotion templates (Ken Burns / parallax pan / charts are queued from session 13's planning). Then wrap `resume-optimizer`. The Tailscale home-server setup and voiceover support (both deferred above) are also up for pickup.

## Things NOT to Retry

- Don't put orchestration code in `D:\ai-sandbox\` root â€” that defeats the purpose of a hub
- Don't duplicate project logic into command_center â€” projects stay where they are
- Don't make command_center depend on relative paths â€” use absolute paths only
- Don't edit `D:\ai-sandbox\csv_analyzer\analyze.py` to parameterize the CSV â€” wrap it instead
- Don't pre-spawn `markdown-formatter/personal/server.js` â€” lazy-spawn only on first call, kill on shutdown
- Don't pre-bundle vid/remotion â€” let `npx remotion render` handle bundling per-call (it caches)
- Don't hardcode any model name, base URL, or API key in command_center code â€” all three flow from `process.env.*` and `sub_agents.json`. If a new sub-agent needs a different model, add it to the JSON.
- Don't put the `ask` tool in the LLM's tool list â€” it's a userâ†’MCP entrypoint, not something the LLM should call. Recursive self-call would be bad.
- Don't bake `max_iterations` into code â€” read it from `sub_agents.json` so a runaway loop on one agent doesn't affect others.



