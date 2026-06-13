"use client";

import type { ServerStatus } from "@/lib/types";

interface SettingsProps {
  serverStatus: ServerStatus | null;
}

export function Settings({ serverStatus }: SettingsProps) {
  return (
    <div className="flex h-full flex-col overflow-y-auto animate-fade-in">
      <div className="mb-6">
        <h2 className="font-sans text-lg font-semibold text-text">Settings</h2>
        <p className="mt-1 text-sm text-text-dim">
          Current configuration and server status.
        </p>
      </div>

      <div className="space-y-4 max-w-2xl">
        <Section title="HTTP Server">
          <Row label="Status" value={serverStatus?.ok ? "Online" : "Offline"} />
          <Row label="Host" value={serverStatus?.host ?? "—"} />
          <Row label="Port" value={String(serverStatus?.port ?? "—")} />
          <Row label="Mode" value={serverStatus?.mode ?? "—"} />
        </Section>

        <Section title="LLM Configuration">
          <Row label="Model Configured" value={serverStatus?.modelConfigured ? "Yes" : "No"} />
          <Row label="API Key Configured" value={serverStatus?.keyConfigured ? "Yes" : "No"} />
          <Row label="Base URL" value={serverStatus?.baseUrl ?? "—"} />
        </Section>

        <Section title="Project">
          <Row label="Project Root" value={serverStatus?.projectRoot ?? "—"} mono />
          <Row label="Tools Registered" value={String(serverStatus?.toolCount ?? "—")} />
        </Section>

        <Section title="Dashboard">
          <Row label="Version" value="1.0.0" />
          <Row label="Stack" value="Next.js 15 + React 19 + Tailwind v4" />
          <Row label="Dashboard Port" value="3000" />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elev overflow-hidden">
      <div className="border-b border-border bg-bg-elev-2 px-4 py-2">
        <h3 className="font-mono text-xs font-medium text-text-dim uppercase tracking-wider">{title}</h3>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs text-text-dim">{label}</span>
      <span className={`text-xs text-text ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
