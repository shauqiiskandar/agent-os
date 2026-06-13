"use client";

import { useMemo } from "react";
import type { AskEvent } from "@/lib/types";
import EventCard from "./EventCard";

type Group =
  | { kind: "start"; data: Extract<AskEvent, { type: "start" }> }
  | { kind: "iteration"; data: Extract<AskEvent, { type: "iteration" }> }
  | { kind: "turn"; iteration: number; text?: Extract<AskEvent, { type: "llm_text" }>; calls: Array<Extract<AskEvent, { type: "tool_use" }>>; results: Array<Extract<AskEvent, { type: "tool_result" }>> }
  | { kind: "final"; data: Extract<AskEvent, { type: "final" }> }
  | { kind: "error"; data: Extract<AskEvent, { type: "error" }> };

function groupEvents(events: AskEvent[]): Group[] {
  const out: Group[] = [];
  const byIter: Map<number, Extract<Group, { kind: "turn" }>> = new Map();

  for (const e of events) {
    if (e.type === "start") {
      out.push({ kind: "start", data: e });
    } else if (e.type === "iteration") {
      out.push({ kind: "iteration", data: e });
    } else if (e.type === "llm_text") {
      const t = byIter.get(e.iteration) || { kind: "turn", iteration: e.iteration, calls: [], results: [] };
      t.text = e;
      byIter.set(e.iteration, t);
    } else if (e.type === "tool_use") {
      const t = byIter.get(e.iteration) || { kind: "turn", iteration: e.iteration, calls: [], results: [] };
      t.calls.push(e);
      byIter.set(e.iteration, t);
    } else if (e.type === "tool_result") {
      const t = byIter.get(e.iteration) || { kind: "turn", iteration: e.iteration, calls: [], results: [] };
      t.results.push(e);
      byIter.set(e.iteration, t);
    } else if (e.type === "final") {
      out.push({ kind: "final", data: e });
    } else if (e.type === "error") {
      out.push({ kind: "error", data: e });
    }
  }

  for (const [iter, turn] of byIter.entries()) {
    out.push(turn);
  }

  return out.sort((a, b) => {
    const ai = a.kind === "iteration" || a.kind === "turn" ? (a as any).data?.iteration ?? (a as any).iteration : -1;
    const bi = b.kind === "iteration" || b.kind === "turn" ? (b as any).data?.iteration ?? (b as any).iteration : -1;
    return ai - bi;
  });
}

export default function ReActTimeline({ events }: { events: AskEvent[] }) {
  const groups = useMemo(() => groupEvents(events), [events]);

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      {groups.map((g, idx) => (
        <EventCard key={idx} group={g} />
      ))}
    </div>
  );
}
