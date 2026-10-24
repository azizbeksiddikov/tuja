import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "./db";
import { config } from "./config";

// `next build` imports this module without runtime secrets; give it a throwaway value only then.
const isBuild = process.env.NEXT_PHASE === "phase-production-build";

export const auth = betterAuth({
  appName: config.appName,
  baseURL: config.baseUrl,
  secret: process.env.BETTER_AUTH_SECRET || (isBuild ? "build-time-placeholder-not-used-at-runtime-000" : undefined),
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
  user: {
    additionalFields: {
      isDemo: { type: "boolean", defaultValue: false, input: false },
      homeCurrency: { type: "string", defaultValue: "UZS", input: false },
    },
  },
  plugins: [nextCookies()],
});

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  isDemo: boolean;
  homeCurrency: string;
};

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = session.user as typeof session.user & { isDemo?: boolean; homeCurrency?: string };
  return { id: u.id, name: u.name, email: u.email, isDemo: Boolean(u.isDemo), homeCurrency: u.homeCurrency || "UZS" };
});

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/sign-in");
  return u;
}
