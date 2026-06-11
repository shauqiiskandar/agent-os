"use client";

import { useState, useCallback } from "react";
import type { ToolDefinition, ToolStatus } from "@/lib/types";
import { Icon, type IconName } from "./icon";
import { cn } from "@/lib/utils";

interface ToolCardProps {
  tool: ToolDefinition;
}

const STATUS_CONFIG: Record<ToolStatus, { label: string; color: string; bg: string }> = {
  idle: { label: "Ready", color: "text-text-faint", bg: "bg-border" },
  running: { label: "Running", color: "text-amber", bg: "bg-amber" },
  success: { label: "Success", color: "text-accent", bg: "bg-accent" },
  error: { label: "Error", color: "text-red", bg: "bg-red" },
};

interface DownloadPayload {
  filename: string;
  data: string;
  mimeType: string;
}

export function ToolCard({ tool }: ToolCardProps) {
  const [inputs, setInputs] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (tool.inputSchema) {
      for (const [key, field] of Object.entries(tool.inputSchema)) {
        initial[key] = String(field.defaultValue ?? "");
      }
    }
    return initial;
  });
  const [status, setStatus] = useState<ToolStatus>("idle");
  const [result, setResult] = useState<string | null>(null);
  const [download, setDownload] = useState<DownloadPayload | null>(null);
  const [expanded, setExpanded] = useState(false);

  const run = useCallback(async () => {
    setStatus("running");
    setResult(null);
    setDownload(null);

    const args: Record<string, unknown> = {};
    if (tool.inputSchema) {
      for (const [key, field] of Object.entries(tool.inputSchema)) {
        const val = inputs[key];
        if (field.type === "toggle") {
          args[key] = val === "true" || val === "";
        } else if (val !== "") {
          args[key] = val;
        }
      }
    }

    // Auto-enable browser download mode for tools that support it
    if (tool.name === "download_youtube_subtitles") {
      args.downloadToBrowser = true;
    }

    try {
      const res = await fetch("/api/tools/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tool.name, arguments: args }),
      });

      const data = await res.json();

      if (data.isError) {
        setStatus("error");
        setResult(data.content?.[0]?.text ?? "Unknown error");
      } else {
        setStatus("success");
        setResult(data.content?.[0]?.text ?? "Done");
        // Capture download payload for browser-triggered file saves
        if (data.download) {
          setDownload(data.download);
        }
      }
    } catch (err) {
      setStatus("error");
      setResult(err instanceof Error ? err.message : String(err));
    }
  }, [tool, inputs]);

  const handleDownload = useCallback(async () => {
    if (!download) return;

    const { filename, data, mimeType } = download;

    // Decode base64 to binary
    const byteCharacters = atob(data);
    const byteArrays: number[] = [];
    for (let i = 0; i < byteCharacters.length; i++) {
      byteArrays.push(byteCharacters.charCodeAt(i));
    }
    const blob = new Blob([new Uint8Array(byteArrays)], { type: mimeType });

    // Try to use the File System Access API for a real Save As dialog
    // (Chrome/Edge only, but best UX)
    if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
      try {
        const picker = (window as any).showSaveFilePicker as any;
        const handle = await picker({
          suggestedName: filename,
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err: any) {
        // User cancelled the dialog, or the API isn't really available
        if (err.name !== "AbortError") {
          console.error("showSaveFilePicker failed:", err);
        }
        // Fall through to anchor download
      }
    }

    // Fallback: trigger a browser download via anchor tag
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [download]);

  const reset = () => {
    setStatus("idle");
    setResult(null);
    setDownload(null);
  };

  const cfg = STATUS_CONFIG[status];
  const isRunning = status === "running";
  const hasInputs = tool.inputSchema && Object.keys(tool.inputSchema).length > 0;

  return (
    <div className="group relative flex flex-col rounded-lg border border-border bg-bg-elev transition-all hover:border-border-bright">
      {/* Header */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bg-elev-2 border border-border">
          <Icon name={tool.icon as IconName} className="h-4 w-4 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-sm font-medium text-text">{tool.name}</h3>
            <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium", cfg.color, "bg-bg-elev-2")}>
              <span className={cn("h-1 w-1 rounded-full", cfg.bg, status === "running" && "animate-pulse")} />
              {cfg.label}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-text-dim leading-relaxed">{tool.description}</p>
        </div>
      </div>

      {/* Inputs */}
      {hasInputs && (
        <div className="px-4 pb-3 space-y-2.5">
          {Object.entries(tool.inputSchema!).map(([key, field]) => (
            <div key={key}>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-faint">
                {field.label}
              </label>
              {field.type === "text" && (
                <input
                  type="text"
                  value={inputs[key] ?? ""}
                  onChange={(e) => setInputs((p) => ({ ...p, [key]: e.target.value }))}
                  placeholder={field.placeholder}
                  disabled={isRunning}
                  className="w-full rounded-md border border-border bg-bg px-3 py-1.5 font-mono text-xs text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:opacity-50"
                />
              )}
              {field.type === "select" && (
                <select
                  value={inputs[key] ?? field.defaultValue ?? ""}
                  onChange={(e) => setInputs((p) => ({ ...p, [key]: e.target.value }))}
                  disabled={isRunning}
                  className="w-full rounded-md border border-border bg-bg px-3 py-1.5 font-mono text-xs text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:opacity-50"
                >
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              )}
              {field.type === "textarea" && (
                <textarea
                  value={inputs[key] ?? ""}
                  onChange={(e) => setInputs((p) => ({ ...p, [key]: e.target.value }))}
                  placeholder={field.placeholder}
                  disabled={isRunning}
                  rows={3}
                  className="w-full rounded-md border border-border bg-bg px-3 py-1.5 font-mono text-xs text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:opacity-50 resize-none"
                />
              )}
              {field.type === "toggle" && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={inputs[key] !== "false"}
                  onClick={() => setInputs((p) => ({ ...p, [key]: p[key] === "false" ? "true" : "false" }))}
                  disabled={isRunning}
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50",
                    inputs[key] !== "false" ? "bg-accent" : "bg-border"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                      inputs[key] !== "false" ? "translate-x-4" : "translate-x-0.5"
                    )}
                  />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mx-4 mb-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 font-mono text-[10px] text-text-dim hover:text-text transition-colors"
          >
            <Icon name="chevron-right" className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} />
            {status === "success" ? "Output" : "Error"} ({result.length} chars)
          </button>
          {expanded && (
            <pre className="mt-1.5 max-h-40 overflow-auto rounded-md border border-border bg-bg p-3 font-mono text-[11px] text-text-dim whitespace-pre-wrap break-all">
              {result}
            </pre>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto flex items-center gap-2 border-t border-border p-3">
        {isRunning ? (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 rounded-md border border-red/30 bg-red/10 px-3 py-1.5 font-mono text-xs text-red hover:bg-red/20 transition-colors"
          >
            <Icon name="stop" className="h-3 w-3" />
            Cancel
          </button>
        ) : (
          <button
            onClick={run}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs font-medium transition-colors",
              status === "success"
                ? "border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20"
                : status === "error"
                ? "border border-red/30 bg-red/10 text-red hover:bg-red/20"
                : "bg-accent text-bg hover:bg-accent/90"
            )}
          >
            <Icon name="run" className="h-3 w-3" />
            {status === "success" ? "Run Again" : status === "error" ? "Retry" : "Run"}
          </button>
        )}
        {download && (
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-md border border-cyan/30 bg-cyan/10 px-3 py-1.5 font-mono text-xs text-cyan hover:bg-cyan/20 transition-colors"
          >
            <Icon name="download" className="h-3 w-3" />
            Save As
          </button>
        )}
        {(status === "success" || status === "error") && (
          <button
            onClick={reset}
            className="rounded-md px-2 py-1.5 font-mono text22 text-xs text-text-faint hover:text-text hover:bg-bg-elev-2 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
