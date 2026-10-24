import { getSessionUser, type SessionUser } from "@/lib/auth";
import { isPlaidConfigured } from "@/lib/config";

/** For mutating endpoints: signed in, not the shared read-only demo, Plaid configured. */
export async function requirePlaidUser(): Promise<{ user: SessionUser } | { error: Response }> {
  const user = await getSessionUser();
  if (!user) return { error: Response.json({ error: "Not signed in" }, { status: 401 }) };
  if (user.isDemo) return { error: Response.json({ error: "The demo account is read-only" }, { status: 403 }) };
  if (!isPlaidConfigured()) return { error: Response.json({ error: "Plaid is not configured" }, { status: 503 }) };
  return { user };
}
