"use client";

import { useState } from "react";

export default function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (task: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");

  const submit = () => {
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue("");
  };

  return (
    <div className="border-t border-border bg-bg-elev px-4 py-3 sm:px-8">
      <div className="flex items-end gap-2 rounded border border-border bg-bg transition focus-within:border-accent">
        <span className="pl-3 font-mono text-sm text-accent">{disabled ? "•" : "›"}</span>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={disabled ? "running..." : "ask the sub-agent anything (Enter to send, Shift+Enter for newline)"}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent px-2 py-2 font-mono text-sm text-text placeholder-text-faint outline-none disabled:opacity-50"
          style={{ minHeight: "2.25rem", maxHeight: "8rem" }}
        />
        <button
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="m-1.5 rounded border border-accent/30 bg-accent/10 px-3 py-1 font-mono text-xs uppercase tracking-wider text-accent transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {disabled ? "running" : "send"}
        </button>
      </div>
    </div>
  );
}
