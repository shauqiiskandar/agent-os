"use client";

import { TOOLS } from "@/lib/tools";
import { ToolCard } from "./tool-card";

export function ToolRunner() {
  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h2 className="font-sans text-lg font-semibold text-text">Tool Runner</h2>
        <p className="mt-1 text-sm text-text-dim">
          Select a tool, fill in the inputs, and run it against the Command Center HTTP server.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {TOOLS.map((tool) => (
          <ToolCard key={tool.name} tool={tool} />
        ))}
      </div>
    </div>
  );
}
