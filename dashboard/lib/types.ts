export type ToolStatus = "idle" | "running" | "success" | "error";

export interface ToolDefinition {
  name: string;
  description: string;
  icon: string;
  inputSchema?: Record<string, ToolInputField>;
}

export interface ToolInputField {
  type: "text" | "select" | "textarea" | "toggle";
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  defaultValue?: string | boolean;
}

export interface ToolCallRequest {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
  download?: {
    filename: string;
    data: string; // base64 encoded content
    mimeType: string;
  };
}

export interface ServerStatus {
  ok: boolean;
  mode: string;
  port: number;
  host: string;
  toolCount: number;
  modelConfigured: boolean;
  keyConfigured: boolean;
  baseUrl: string;
  projectRoot: string;
}

export interface PendingTask {
  id: string;
  text: string;
  done: boolean;
}

export interface ProjectInfo {
  name: string;
  path: string;
  type: string;
  status: string;
  toolName: string;
  notes: string;
}

export type NavSection = "tools" | "pending" | "projects" | "settings";
