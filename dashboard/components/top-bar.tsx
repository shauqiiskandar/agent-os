"use client";

import { useEffect, useState } from "react";
import type { ServerStatus } from "@/lib/types";

interface TopBarProps {
  serverStatus: ServerStatus | null;
  statusLoading: boolean;
}

export function TopBar({ serverStatus, statusLoading }: TopBarProps) {
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => {
      setTime(
        new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const isAlive = serverStatus?.ok === true;

  return (
    <header className="flex h-12 items-center border-b border-border bg-bg-elev px-4 gap-4">
      <div className="flex items-center gap-2.5">
        <div className="relative flex h-2 w-2 items-center justify-center">
          {isAlive ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
          ) : null}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              statusLoading
                ? "bg-amber"
                : isAlive
                ? "bg-accent"
                : "bg-red"
            }`}
          />
        </div>
        <span className="font-mono text-xs text-text-dim">
          {statusLoading ? "Connecting..." : isAlive ? "Server Online" : "Server Offline"}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-4">
        {serverStatus && (
          <span className="font-mono text-[10px] text-text-faint">
            v{serverStatus.mode === "http" ? "0.3.0" : "0.1.0"} &middot;{" "}
            {serverStatus.toolCount} tools
          </span>
        )}
        <span className="font-mono text-[10px] text-text-faint tabular-nums">{time}</span>
      </div>
    </header>
  );
}
