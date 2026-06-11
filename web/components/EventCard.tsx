"use client";

import { useState } from "react";
import type { AskEvent } from "@/lib/types";

type Group =
  | { kind: "start"; data: Extract<AskEvent, { type: "start" }> }
  | { kind: "iteration"; data: Extract<AskEvent, { type: "iteration" }> }
  | { kind: "turn"; iteration: number; text?: Extract<AskEvent, { type: "llm_text" }>; calls: Array<Extract<AskEvent, { type: "tool_use" }>>; results: Array<AskEvent & { type: "tool_result" }> }
  | { kind: "final"; data: Extract<AskEvent, { type: "final" }> }
  | { kind: "error"; data: Extract<AskEvent, { type: "error" }> };

export default function EventCard({ group }: { group: Group }) {
  if (group.kind === "start") return <StartCard data={group.data} />;
  if (group.kind === "iteration") return <IterationBadge data={group.data} />;
  if (group.kind === "turn") return <TurnCard group={group} />;
  if (group.kind === "final") return <FinalCard data={group.data} />;
  if (group.kind === "error") return <ErrorCard data={group.data} />;
  return null;
}

function StartCard({ data }: { data: Extract<AskEvent, { type: "start" }> }) {
  return (
    <div className="rounded border border-accent/30 bg-accent/5 px-4 py-3">
      <div className="mb-1 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-accent">
        <span className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot" />
        started
      </div>
      <div className="font-mono text-xs text-text-dim">
        <span className="text-text-faint">agent=</span>
        <span className="text-cyan">{data.agent ?? "(none)"}</span>
        <span className="text-text-faint"> model=</span>
        <span className="text-amber">{data.model}</span>
        <span className="text-text-faint"> tools=</span>
        <span className="text-purple">{JSON.stringify(data.allowedTools)}</span>
        <span className="text-text-faint"> max_iters=</span>
        <span className="text-text">{data.maxIterations}</span>
      </div>
    </div>
  );
}

function IterationBadge({ data }: { data: Extract<AskEvent, { type: "iteration" }> }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="font-mono text-xs uppercase tracking-widest text-text-faint">
        ── iteration {data.iteration} of {data.maxIterations} ──
      </div>
    </div>
  );
}

function TurnCard({ group }: { group: Extract<Group, { kind: "turn" }> }) {
  return (
    <div className="rounded border border-border bg-bg-elev p-3">
      <div className="mb-2 font-mono text-xs uppercase tracking-widest text-text-faint">
        turn {group.iteration}
      </div>

      {group.text && (
        <div className="mb-3 rounded border-l-2 border-amber/50 bg-amber/5 px-3 py-2 font-mono text-xs text-amber-100">
          <div className="mb-1 text-amber-300">LLM thought</div>
          <div className="whitespace-pre-wrap text-text">{group.text.text}</div>
        </div>
      )}

      {group.calls.map((call) => {
        const result = group.results.find((r) => r.tool_use_id === call.id);
        return <ToolCallRow key={call.id} call={call} result={result} />;
      })}
    </div>
  );
}

function ToolCallRow({
  call,
  result,
}: {
  call: Extract<AskEvent, { type: "tool_use" }>;
  result?: Extract<AskEvent, { type: "tool_result" }>;
}) {
  const [open, setOpen] = useState(false);
  const isError = result?.is_error === true;
  const content = result?.content || "(awaiting result...)";

  return (
    <div className={`mb-2 rounded border ${isError ? "border-red/50 bg-red/5" : "border-accent/30 bg-accent/5"}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-left transition hover:bg-accent/10"
      >
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className={isError ? "text-red" : "text-accent"}>{isError ? "✗" : "→"}</span>
          <span className="font-bold text-text">{call.name}</span>
          <span className="text-text-faint">(</span>
          <span className="truncate text-text-dim">{JSON.stringify(call.input)}</span>
          <span className="text-text-faint">)</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-text-faint">
          {result && (
            <span className={isError ? "text-red" : "text-cyan"}>
              {content.length} chars
            </span>
          )}
          <span>{open ? "▾" : "▸"}</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-border/50 px-3 py-2">
          <div className="mb-1 font-mono text-xs text-text-faint">input</div>
          <pre className="mb-3 max-h-40 overflow-auto rounded bg-bg p-2 font-mono text-xs text-cyan">
            {JSON.stringify(call.input, null, 2)}
          </pre>
          {result && (
            <>
              <div className={`mb-1 font-mono text-xs ${isError ? "text-red" : "text-text-faint"}`}>
                result {isError && "(error)"}
              </div>
              <pre
                className={`max-h-80 overflow-auto rounded bg-bg p-2 font-mono text-xs whitespace-pre-wrap ${
                  isError ? "text-red" : "text-text"
                }`}
              >
                {content}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FinalCard({ data }: { data: Extract<AskEvent, { type: "final" }> }) {
  return (
    <div className="rounded border border-cyan/40 bg-cyan/5 p-4">
      <div className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cyan">
        <span>■</span>
        <span>final answer</span>
        <span className="text-text-faint">· {data.iterations} iteration{data.iterations === 1 ? "" : "s"}</span>
      </div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-text">
        {data.text}
      </div>
    </div>
  );
}

function ErrorCard({ data }: { data: Extract<AskEvent, { type: "error" }> }) {
  return (
    <div className="rounded border border-red/50 bg-red/10 p-3">
      <div className="mb-1 font-mono text-xs uppercase tracking-widest text-red">
        ✗ error · stage: {data.stage}
        {data.iteration !== undefined && ` · iteration ${data.iteration}`}
      </div>
      <div className="whitespace-pre-wrap font-mono text-xs text-red-100">
        {data.message}
      </div>
    </div>
  );
}
