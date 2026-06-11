"use client";

type RunState = "idle" | "running" | "done" | "error";

const STATE_COLORS: Record<RunState, { dot: string; text: string; label: string }> = {
  idle: { dot: "bg-text-faint", text: "text-text-dim", label: "idle" },
  running: { dot: "bg-accent pulse-dot", text: "text-accent", label: "live" },
  done: { dot: "bg-cyan", text: "text-cyan", label: "done" },
  error: { dot: "bg-red", text: "text-red", label: "error" },
};

export default function StatusBar({
  runState,
  agent,
  eventCount,
  onAgentChange,
  onClear,
}: {
  runState: RunState;
  agent: string;
  eventCount: number;
  onAgentChange: (a: string) => void;
  onClear: () => void;
}) {
  const state = STATE_COLORS[runState];
  return (
    <header className="flex items-center justify-between border-b border-border bg-bg-elev px-4 py-3 sm:px-8">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 font-mono text-sm">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <span className="font-bold tracking-tight text-text">command_center</span>
          <span className="text-text-faint">/</span>
          <span className="text-text-dim">mission control</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className={`h-1.5 w-1.5 rounded-full ${state.dot}`} />
          <span className={state.text}>{state.label}</span>
          {eventCount > 0 && (
            <span className="text-text-faint">· {eventCount} event{eventCount === 1 ? "" : "s"}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 font-mono text-xs">
        <label className="text-text-faint">agent</label>
        <select
          value={agent}
          onChange={(e) => onAgentChange(e.target.value)}
          disabled={runState === "running"}
          className="rounded border border-border bg-bg px-2 py-1 text-text outline-none transition focus:border-accent disabled:opacity-50"
        >
          <option value="router">router</option>
          <option value="(none)">(none — plain LLM)</option>
        </select>
        <button
          onClick={onClear}
          disabled={runState === "running" || eventCount === 0}
          className="rounded border border-border bg-bg px-2 py-1 text-text-dim transition hover:border-red hover:text-red disabled:cursor-not-allowed disabled:opacity-30"
        >
          clear
        </button>
      </div>
    </header>
  );
}
