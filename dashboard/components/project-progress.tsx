"use client";

import { useState, useEffect, useCallback } from "react";
import type { ProjectInfo } from "@/lib/types";
import { Icon } from "./icon";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  "Runnable as-is": "text-accent",
  "Runnable": "text-accent",
  "Planned": "text-amber",
  "Not wrappable": "text-red",
  "Not wrappable yet": "text-amber",
  "Asset, not a project": "text-text-faint",
  "dropped": "text-red",
};

export function ProjectProgress() {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data.projects ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h2 className="font-sans text-lg font-semibold text-text">Project Progress</h2>
        <p className="mt-1 text-sm text-text-dim">
          Overview of all registered projects from REGISTRY.md and PROGRESS.md.
        </p>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 animate-shimmer rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red/30 bg-red/10 p-4 text-center">
          <p className="font-mono text-xs text-red">{error}</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-lg border border-border bg-bg-elev p-8 text-center">
          <Icon name="projects" className="mx-auto h-8 w-8 text-text-faint" />
          <p className="mt-2 text-sm text-text-dim">No projects found</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((proj) => (
            <ProjectCard key={`${proj.path}::${proj.name}`} project={proj} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectInfo }) {
  const statusColor = STATUS_COLORS[project.status] ?? "text-text-dim";

  return (
    <div className="group rounded-lg border border-border bg-bg-elev p-4 transition-all hover:border-border-bright">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bg-elev-2 border border-border">
          <Icon name="folder" className="h-4 w-4 text-cyan" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-mono text-sm font-medium text-text truncate">{project.name}</h3>
          <p className="mt-0.5 font-mono text-[10px] text-text-faint truncate">{project.path}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-bg-elev-2 px-2 py-0.5 font-mono text-[10px] text-text-dim">
          {project.type}
        </span>
        <span className={cn("inline-flex items-center rounded-full bg-bg-elev-2 px-2 py-0.5 font-mono text-[10px]", statusColor)}>
          {project.status}
        </span>
        {project.toolName && project.toolName !== "—" && (
          <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[10px] text-accent">
            {project.toolName}
          </span>
        )}
      </div>

      {project.notes && (
        <p className="mt-3 text-xs text-text-dim leading-relaxed line-clamp-2">{project.notes}</p>
      )}
    </div>
  );
}
