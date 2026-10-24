import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/server/rate-limit";

/**
 * Assistant quotas:
 *  - burst: 6 messages/minute per user+IP (in memory)
 *  - demo: 20 messages/hour per IP, plus a shared daily cap for the whole demo account (DB)
 *  - real users: daily cap per user (DB, survives restarts)
 */
export async function checkAgentQuota(user: { id: string; isDemo: boolean }, ip: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!rateLimit(`agent-burst:${user.id}:${ip}`, 6, 60_000).ok) return { ok: false, message: "Slow down a little: max 6 questions per minute." };
  if (user.isDemo && !rateLimit(`agent-demo-ip:${ip}`, 20, 3_600_000).ok) return { ok: false, message: "Demo limit reached for your network (20 questions/hour). Create a free account to keep going." };
  const since = new Date(Date.now() - 86_400_000);
  const used = await prisma.agentRun.count({ where: { userId: user.id, createdAt: { gte: since } } });
  const cap = user.isDemo ? config.demo.dailyMessageCap : config.userDailyMessageCap;
  if (used >= cap) return { ok: false, message: user.isDemo ? "The shared demo has used today's AI budget. Please come back tomorrow." : `Daily limit reached (${cap} questions).` };
  return { ok: true };
}
