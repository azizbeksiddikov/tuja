import { z } from "zod";
import { requirePlaidUser } from "@/lib/server/guards";
import { exchangeAndStore } from "@/lib/server/plaid-items";
import { rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const g = await requirePlaidUser();
  if ("error" in g) return g.error;
  if (!rateLimit(`plaid-exchange:${g.user.id}`, 5, 60 * 60_000).ok) return Response.json({ error: "Too many bank links, try later" }, { status: 429 });
  const parsed = z.object({ publicToken: z.string().min(10).max(200) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  try {
    return Response.json(await exchangeAndStore(g.user.id, parsed.data.publicToken));
  } catch (e) {
    console.error("[plaid] exchange", (e as { response?: { data?: unknown } }).response?.data ?? (e as Error).message);
    return Response.json({ error: "Could not link this bank" }, { status: 502 });
  }
}
