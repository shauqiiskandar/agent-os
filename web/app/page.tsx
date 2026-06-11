"use client";

import { useState, useRef, useEffect } from "react";
import type { AskEvent, AskRequest } from "@/lib/types";
import StatusBar from "@/components/StatusBar";
import ReActTimeline from "@/components/ReActTimeline";
import ChatInput from "@/components/ChatInput";

type RunState = "idle" | "running" | "done" | "error";

export default function HomePage() {
  const [events, setEvents] = useState<AskEvent[]>([]);
  const [runState, setRunState] = useState<RunState>("idle");
  const [agent, setAgent] = useState<string>("router");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [events]);

  const send = async (task: string) => {
    if (!task.trim() || runState === "running") return;
    setEvents([]);
    setErrorMsg(null);
    setRunState("running");

    const body: AskRequest = { task };
    if (agent !== "(none)") body.agent = agent;

    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!r.ok || !r.body) {
        setErrorMsg(`Request failed: ${r.status} ${r.statusText}`);
        setRunState("error");
        return;
      }

      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let sawFinal = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const blocks = buf.split("\n\n");
        buf = blocks.pop() || "";
        for (const block of blocks) {
          const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          let evt: AskEvent;
          try {
            evt = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }
          if (evt.type === "result") continue;
          if (evt.type === "error") {
            setErrorMsg(evt.message);
            setRunState("error");
          }
          if (evt.type === "final") sawFinal = true;
          setEvents((prev) => [...prev, evt]);
        }
      }

      if (!sawFinal && runState !== "error") {
        setRunState("done");
      } else if (runState !== "error") {
        setRunState("done");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setRunState("error");
    }
  };

  const clear = () => {
    setEvents([]);
    setErrorMsg(null);
    setRunState("idle");
  };

  return (
    <div className="flex h-screen flex-col">
      <StatusBar
        runState={runState}
        agent={agent}
        eventCount={events.length}
        onAgentChange={setAgent}
        onClear={clear}
      />

      <div
        ref={timelineRef}
        className="flex-1 overflow-y-auto px-4 py-6 sm:px-8"
      >
        {events.length === 0 && runState === "idle" && (
          <EmptyState />
        )}
        <ReActTimeline events={events} />
      </div>

      {errorMsg && (
        <div className="border-t border-red-500/30 bg-red-500/10 px-4 py-2 font-mono text-xs text-red-300 sm:px-8">
          <span className="font-bold">ERROR:</span> {errorMsg}
        </div>
      )}

      <ChatInput onSend={send} disabled={runState === "running"} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto mt-20 max-w-2xl text-center">
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-bg-elev px-3 py-1 font-mono text-xs uppercase tracking-widest text-text-dim">
        <span className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot" />
        mission control
      </div>
      <h1 className="mb-3 font-sans text-3xl font-light tracking-tight text-text sm:text-4xl">
        command_center
      </h1>
      <p className="mb-8 text-sm text-text-dim">
        Watch a sub-agent reason, call tools, and answer — turn by turn.
      </p>
      <div className="grid gap-2 text-left font-mono text-xs text-text-dim sm:grid-cols-2">
        <ExampleCard cmd="ask the router to ping the hub" />
        <ExampleCard cmd="analyze the CSV at D:\ai-sandbox\csv_analyzer\data.csv" />
        <ExampleCard cmd="what is the current time" />
        <ExampleCard cmd="render the stickman fight video" />
      </div>
    </div>
  );
}

function ExampleCard({ cmd }: { cmd: string }) {
  return (
    <div className="rounded border border-border bg-bg-elev px-3 py-2 text-text-faint">
      &gt; {cmd}
    </div>
  );
}
