import { requirePlaidUser } from "@/lib/server/guards";
import { createLinkToken } from "@/lib/server/plaid-items";

export const runtime = "nodejs";

export async function POST() {
  const g = await requirePlaidUser();
  if ("error" in g) return g.error;
  try {
    return Response.json({ linkToken: await createLinkToken(g.user.id) });
  } catch (e) {
    console.error("[plaid] link token", (e as { response?: { data?: unknown } }).response?.data ?? (e as Error).message);
    return Response.json({ error: "Could not start Plaid Link" }, { status: 502 });
  }
}
