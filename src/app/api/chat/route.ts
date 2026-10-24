import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { isAiConfigured } from "@/lib/config";
import { runAgent } from "@/lib/agent/run";
import { checkAgentQuota } from "@/lib/agent/limits";
import { getDisplayCurrency } from "@/lib/server/prefs";
import { clientIp } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(30),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!isAiConfigured()) return Response.json({ error: "AI not configured" }, { status: 503 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user") return Response.json({ error: "Bad request" }, { status: 400 });

  const quota = await checkAgentQuota(user, await clientIp());
  if (!quota.ok) return Response.json({ error: quota.message }, { status: 429 });

  const displayCurrency = await getDisplayCurrency(user.homeCurrency);
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of runAgent({ userId: user.id, userName: user.name, displayCurrency, messages: parsed.data.messages })) {
          controller.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
        }
      } catch (e) {
        controller.enqueue(enc.encode(JSON.stringify({ type: "error", message: "Unexpected error" }) + "\n"));
        console.error("[chat]", e);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
