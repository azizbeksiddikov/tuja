"use server";

import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureDemoFresh } from "@/lib/demo/refresh";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo/seed";
import { isSupportedCurrency } from "@/lib/money";
import { CCY_COOKIE } from "@/lib/server/prefs";
import { rateLimit, clientIp } from "@/lib/server/rate-limit";

export type FormState = { error?: string } | undefined;

const signInSchema = z.object({ email: z.email(), password: z.string().min(1).max(200) });
const signUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

function message(e: unknown) {
  const m = (e as { body?: { message?: string }; message?: string })?.body?.message ?? (e as Error)?.message;
  return m || "Something went wrong";
}

async function limited(kind: string) {
  const ip = await clientIp();
  return !rateLimit(`${kind}:${ip}`, 10, 10 * 60_000).ok;
}

export async function signInAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter your email and password" };
  if (await limited("signin")) return { error: "Too many attempts. Try again in a few minutes." };
  if (parsed.data.email.toLowerCase() === DEMO_EMAIL) return { error: "Use the “Try the demo” button for the demo account" };
  try {
    await auth.api.signInEmail({ body: parsed.data, headers: await headers() });
  } catch (e) {
    return { error: message(e) };
  }
  redirect("/dashboard");
}

export async function signUpAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (await limited("signup")) return { error: "Too many attempts. Try again in a few minutes." };
  try {
    await auth.api.signUpEmail({ body: parsed.data, headers: await headers() });
  } catch (e) {
    return { error: message(e) };
  }
  redirect("/dashboard");
}

/** One click into the shared, read-only demo persona. */
export async function demoSignInAction(): Promise<void> {
  if (await limited("demo")) redirect("/?error=rate");
  await ensureDemoFresh(prisma); // dates always end today, even if the server has run for weeks
  try {
    await auth.api.signInEmail({ body: { email: DEMO_EMAIL, password: DEMO_PASSWORD }, headers: await headers() });
  } catch (e) {
    console.error("[demo] sign-in failed:", message(e));
    redirect("/?error=demo");
  }
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    /* already signed out */
  }
  redirect("/");
}

export async function setCurrencyAction(form: FormData): Promise<void> {
  const ccy = String(form.get("currency") ?? "").toUpperCase();
  if (isSupportedCurrency(ccy)) {
    (await cookies()).set(CCY_COOKIE, ccy, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  }
}
