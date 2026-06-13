export type AskEvent =
  | { type: "start"; agent: string | null; model: string; allowedTools: string[]; maxIterations: number }
  | { type: "iteration"; iteration: number; maxIterations: number }
  | { type: "llm_text"; iteration: number; text: string }
  | { type: "tool_use"; iteration: number; id: string; name: string; input: unknown }
  | { type: "tool_result"; iteration: number; tool_use_id: string; name: string; content: string; is_error?: boolean }
  | { type: "final"; text: string; iterations: number; log: unknown[] }
  | { type: "result"; result: { content: Array<{ type: string; text: string }>; isError?: boolean } }
  | { type: "error"; stage: string; message: string; iteration?: number };

export type AskRequest = {
  agent?: string;
  task: string;
};

export type AskResponse = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};
