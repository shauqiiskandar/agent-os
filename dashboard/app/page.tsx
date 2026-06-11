"use client";

import { useState, useEffect, useCallback } from "react";
import type { NavSection, ServerStatus } from "@/lib/types";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { ToolRunner } from "@/components/tool-runner";
import { PendingTasks } from "@/components/pending-tasks";
import { ProjectProgress } from "@/components/project-progress";
import { Settings } from "@/components/settings";

export default function HomePage() {
  const [nav, setNav] = useState<NavSection>("tools");
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
        <main className="flex-1 overflow-y-auto p-6">
          {nav === "tools" && <ToolRunner />}
          {nav === "pending" && <PendingTasks />}
          {nav === "projects" && <ProjectProgress />}
          {nav === "settings" && <Settings serverStatus={serverStatus} />}
        </main>
      </div>
    </div>
  );
}
