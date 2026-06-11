import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CC_HTTP = process.env.CC_HTTP_BASE_URL || "http://127.0.0.1:3010";

export async function POST(req: NextRequest) {
  const body = await req.text();

  let upstream: Response;
  try {
    upstream = await fetch(`${CC_HTTP}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      `data: ${JSON.stringify({
        type: "error",
        stage: "proxy",
        message: `Cannot reach command_center HTTP at ${CC_HTTP}. Start it with: npm run http. (${msg})`,
      })}\n\n`,
      {
        status: 502,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      }
    );
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(
      `data: ${JSON.stringify({
        type: "error",
        stage: "proxy",
        message: `command_center /ask returned ${upstream.status}: ${text}`,
      })}\n\n`,
      {
        status: 502,
        headers: { "Content-Type": "text/event-stream" },
      }
    );
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
