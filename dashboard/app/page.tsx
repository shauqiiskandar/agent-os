"use client";

import { useState, useEffect, useCallback } from "react";
import type { NavSection, ServerStatus } from "@/lib/types";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { ToolRunner } from "@/components/tool-runner";
import { ChatPanel } from "@/components/chat-panel";
import { PendingTasks } from "@/components/pending-tasks";
import { ProjectProgress } from "@/components/project-progress";
import { Settings } from "@/components/settings";

export default function HomePage() {
  const [nav, setNav] = useState<NavSection>("chat");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      setServerStatus(data);
    } catch {
      setServerStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const id = setInterval(checkStatus, 15000);
    return () => clearInterval(id);
  }, [checkStatus]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar serverStatus={serverStatus} statusLoading={statusLoading} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          active={nav}
          onNavigate={setNav}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className={nav === "chat" ? "flex-1 min-h-0" : "hidden"}><ChatPanel /></div>
          <div className={nav === "tools" ? "flex-1 min-h-0" : "hidden"}><ToolRunner /></div>
          <div className={nav === "pending" ? "flex-1 min-h-0" : "hidden"}><PendingTasks /></div>
          <div className={nav === "projects" ? "flex-1 min-h-0" : "hidden"}><ProjectProgress /></div>
          <div className={nav === "settings" ? "flex-1 min-h-0" : "hidden"}><Settings serverStatus={serverStatus} /></div>
        </main>
      </div>
    </div>
  );
}
