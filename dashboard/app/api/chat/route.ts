import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveLlmConfig() {
  const apiKey =
    process.env.LLM_API_KEY ||
    process.env.NVIDIA_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_AUTH_TOKEN ||
    "";
  const baseURL =
    process.env.LLM_BASE_URL ||
    process.env.NVIDIA_BASE_URL ||
    process.env.ANTHROPIC_BASE_URL ||
    "https://integrate.api.nvidia.com/v1";
  const model =
    process.env.LLM_MODEL ||
    process.env.NVIDIA_MODEL ||
    process.env.ANTHROPIC_MODEL ||
    "openai/gpt-oss-120b";
  return { apiKey, baseURL, model };
}

function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  let body: {
    messages?: Array<{
      role: string;
      content?: string | null;
      tool_calls?: unknown[];
      tool_call_id?: string;
    }>;
    tools?: Array<Record<string, unknown>>;
    model?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const envConfig = resolveLlmConfig();
  const model = body.model || envConfig.model;
  const apiKey = envConfig.apiKey;
  const baseURL = envConfig.baseURL;

  if (!apiKey) {
    const msg =
      "No LLM API key configured. Set one of LLM_API_KEY, NVIDIA_API_KEY, ANTHROPIC_API_KEY, or ANTHROPIC_AUTH_TOKEN in command_center's environment before starting the dashboard.";
    return new Response(msg, { status: 503 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const tools = Array.isArray(body.tools) ? body.tools : undefined;

  if (messages.length === 0) {
    return new Response("No messages provided", { status: 400 });
  }

  const client = new OpenAI({ apiKey, baseURL });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseEncode(event, data)));
        } catch {
          closed = true;
        }
      };

      try {
        send("meta", { model, baseURL });

        const completion = await client.chat.completions.create({
          model,
          messages: messages as any,
          tools: tools as any,
          stream: true,
          temperature: 0.7,
          max_tokens: 4096,
        });

        for await (const chunk of completion) {
          const choice = chunk.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta;

          if (delta?.content) {
            send("text", { delta: delta.content });
          }

          if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              send("tool_call_delta", {
                index: tc.index,
                id: tc.id,
                name: tc.function?.name,
                arguments: tc.function?.arguments,
              });
            }
          }

          if (choice.finish_reason) {
            send("finish", { reason: choice.finish_reason });
          }
        }

        send("done", {});
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send("error", { message });
      } finally {
        try {
          controller.close();
        } catch {}
        closed = true;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
