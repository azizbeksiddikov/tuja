import "server-only";
import { headers } from "next/headers";

// Small in-memory fixed-window limiter (single app container). Persistent daily caps for the
// assistant are enforced from the agent_runs table in src/lib/agent/limits.ts.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  b.count++;
  return { ok: b.count <= limit, remaining: Math.max(0, limit - b.count), resetAt: b.resetAt };
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  // nginx sets X-Real-IP; fall back to the first X-Forwarded-For hop.
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
