"use client";

import type { NavSection } from "@/lib/types";
import { Icon, type IconName } from "./icon";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { id: NavSection; label: string; icon: string }[] = [
  { id: "chat", label: "Chat", icon: "bot" },
  { id: "tools", label: "Tools", icon: "tools" },
  { id: "pending", label: "Pending Tasks", icon: "pending" },
  { id: "projects", label: "Project Progress", icon: "projects" },
  { id: "settings", label: "Settings", icon: "settings" },
];

interface SidebarProps {
  active: NavSection;
  onNavigate: (section: NavSection) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ active, onNavigate, collapsed, onToggleCollapse }: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border bg-bg-elev transition-all duration-200",
        collapsed ? "w-16" : "w-56"
      )}
    >
      <div className="flex h-14 items-center border-b border-border px-4">
        {!collapsed && (
          <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">
            Command Center
          </span>
        )}
        <button
          onClick={onToggleCollapse}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md text-text-dim hover:bg-bg-elev-2 hover:text-text transition-colors",
            collapsed ? "mx-auto" : "ml-auto"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Icon name={collapsed ? "chevron-right" : "menu"} className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 py-2" role="navigation" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors",
              active === item.id
                ? "border-r-2 border-accent bg-accent/10 text-accent"
                : "text-text-dim hover:bg-bg-elev-2 hover:text-text",
              collapsed && "justify-center px-0"
            )}
            aria-current={active === item.id ? "page" : undefined}
          >
            <Icon name={item.icon as IconName} className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        {!collapsed && (
          <p className="font-mono text-[10px] text-text-faint leading-relaxed">
            D:\ai-sandbox\command_center
          </p>
        )}
      </div>
    </aside>
  );
}
