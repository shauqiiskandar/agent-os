"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ChatMessage } from "@/lib/types";
import {
  runChat,
  loadHistory,
  saveHistory,
  loadUiMessages,
  saveUiMessages,
  clearHistory,
} from "@/lib/chat-engine";
import { Icon, type IconName } from "./icon";
import { cn } from "@/lib/utils";

interface ModelChoice {
  id: string;
  label: string;
  badge?: string;
}

const MODELS: ModelChoice[] = [
  { id: "openai/gpt-oss-120b", label: "openai/gpt-oss-120b", badge: "default" },
  { id: "nvidia/nemotron-3-super-120b-a12b", label: "nvidia/nemotron-3-super-120b-a12b", badge: "NVIDIA" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b", label: "nvidia/nemotron-3-ultra", badge: "NVIDIA" },
  { id: "qwen/qwen3-coder-480b-a35b", label: "qwen/qwen3-coder", badge: "NVIDIA" },
];

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadUiMessages());
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [model, setModel] = useState(MODELS[0].id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (messages.length === 0) {
      window.localStorage.removeItem("command_center:chat_ui");
    } else {
      saveUiMessages(messages);
    }
  }, [messages]);

  const onMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const onReplace = useCallback((id: string, msg: ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? msg : m)));
  }, []);

  const handleReset = useCallback(() => {
    if (running) return;
    if (!window.confirm("Clear chat history for this session?")) return;
    setMessages([]);
    clearHistory();
  }, [running]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || running) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setRunning(true);

    try {
      const result = await runChat(text, onMessage, onReplace, {
        history: loadHistory(),
        model,
      });
      saveHistory(result.updatedHistory);
    } catch (err) {
      onMessage({
        id: `err-${Date.now()}`,
        role: "system",
        content: `Fatal error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      });
    } finally {
      setRunning(false);
    }
  }, [input, running, onMessage, onReplace, model]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Icon name="bot" className="h-5 w-5 text-accent" />
        <h2 className="font-mono text-sm font-semibold text-text">Chat</h2>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="ml-auto rounded-md border border-border bg-bg-elev-2 px-2 py-1 font-mono text-[10px] text-text-dim focus:border-accent focus:outline-none"
          disabled={running}
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}{m.badge ? ` (${m.badge})` : ""}
            </option>
          ))}
        </select>
        <div className="h-4 w-px bg-border" />
        <button
          onClick={handleReset}
          disabled={running}
          className="rounded-md px-2 py-1 font-mono text-[10px] text-text-faint hover:text-red hover:bg-red/10 transition-colors disabled:opacity-40"
          title="Clear chat history"
        >
          Clear
        </button>
        {running && (
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-accent">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
            Thinking...
          </span>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-text-faint">
            <Icon name="bot" className="h-12 w-12 opacity-20" />
            <p className="font-mono text-xs">Ask Command Center anything.</p>
            <p className="font-mono text-[10px] max-w-md text-center leading-relaxed">
              Uses your LLM_API_KEY via the OpenAI SDK. 6 function-calling tools wired:
              ping, analyze_csv, convert_document, format_document,
              render_video, download_youtube_subtitles. Try "analyze the CSV at
              D:\ai-sandbox\csv_analyzer\data.csv".
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
      </div>

      <div className="border-t border-border px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              running ? "Thinking..." : "Type a message... (Enter to send, Shift+Enter for newline)"
            }
            disabled={running}
            rows={2}
            className="flex-1 resize-none rounded-md border border-border bg-bg-elev-2 px-3 py-2 font-mono text-xs text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:opacity-40"
          />
          <button
            onClick={handleSend}
            disabled={running || !input.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-bg hover:bg-accent-dim transition-colors disabled:opacity-30"
          >
            <Icon name="send" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  const isSystem = msg.role === "system";
  const isTool = msg.role === "tool";

  if (isTool) {
    return (
      <div className="animate-fade-in ml-8 rounded-md border border-border bg-bg-elev py-2 px-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Icon name="wrench" className="h-3 w-3 text-amber" />
          <span className="font-mono text-[10px] text-amber">Tool Result</span>
        </div>
        <pre className="whitespace-pre-wrap font-mono text-[11px] text-text-dim leading-relaxed max-h-48 overflow-y-auto">
          {msg.content}
        </pre>
      </div>
    );
  }

  if (isSystem) {
    return (
      <div className="animate-fade-in flex justify-center">
        <span className="rounded-full bg-red/10 px-3 py-1 font-mono text-[10px] text-red">
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "animate-fade-in flex gap-2.5",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-bg-elev-2">
          <Icon name="bot" className="h-4 w-4 text-accent" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[75%] rounded-lg px-3 py-2",
          isUser
            ? "bg-accent/15 border border-accent/20"
            : "bg-bg-elev border border-border"
        )}
      >
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="mb-2 space-y-1.5">
            {msg.toolCalls.map((tc) => (
              <div
                key={tc.id}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2 py-1 font-mono text-[10px]",
                  tc.status === "done"
                    ? "bg-accent/10 text-accent"
                    : tc.status === "error"
                    ? "bg-red/10 text-red"
                    : "bg-amber/10 text-amber"
                )}
              >
                <Icon name="wrench" className="h-3 w-3" />
                <span>{tc.name}</span>
                <span className="text-text-faint">({truncateArgs(tc.arguments)})</span>
                {tc.status === "running" && (
                  <span className="pulse-dot ml-1 h-1.5 w-1.5 rounded-full bg-amber" />
                )}
                {tc.status === "done" && <Icon name="check" className="ml-1 h-3 w-3" />}
                {tc.status === "error" && <Icon name="x" className="ml-1 h-3 w-3" />}
              </div>
            ))}
          </div>
        )}
        <div className="whitespace-pre-wrap font-mono text-xs text-text leading-relaxed">
          {msg.content || (msg.streaming ? "" : "\u200b")}
          {msg.streaming && (
            <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-accent ml-0.5 align-middle" />
          )}
        </div>
      </div>
      {isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-bg-elev-2">
          <Icon name="user" className="h-4 w-4 text-cyan" />
        </div>
      )}
    </div>
  );
}

function truncateArgs(args: string): string {
  try {
    const parsed = JSON.parse(args);
    const keys = Object.keys(parsed);
    return keys.map((k) => `${k}=${String(parsed[k]).slice(0, 30)}`).join(", ");
  } catch {
    return args.slice(0, 50);
  }
}
