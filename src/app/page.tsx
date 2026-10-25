import Link from "next/link";
import { redirect } from "next/navigation";
import DemoButton from "@/components/DemoButton";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";
import { getSessionUser } from "@/lib/auth";

const FEATURES = [
  { icon: "💱", title: "UZS · KRW · USD", text: "Every balance and chart in the currency you pick, using Central Bank of Uzbekistan rates." },
  { icon: "✨", title: "Ask in plain words", text: "A Gemini agent with tools and read-only SQL. Every tool call and query is shown to you." },
  { icon: "🛡️", title: "Can't leak by design", text: "AI-written SQL is parsed by the real Postgres parser, runs as a read-only role, and row-level security limits it to your rows." },
  { icon: "🏦", title: "Plaid sandbox", text: "Link a US test bank, import every account with categories. Access tokens are encrypted with AES-256-GCM." },
];

export default async function Landing({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSessionUser()) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pt-6">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/sign-in" className="pill shadow-card">Sign in</Link>
      </header>

      <section className="grid items-center gap-6 py-10 md:grid-cols-2 md:py-16">
        <div>
          <p className="pill mb-4 shadow-card">For Uzbeks living in Korea 🇺🇿 → 🇰🇷</p>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">
            Your so&apos;m, won and dollars<span className="text-accent">.</span> One place.
          </h1>
          <p className="mt-4 max-w-md text-muted">
            See every account in one currency, find where the money went, and ask an AI assistant that can only ever see your own data.
          </p>
          <div className="mt-6 max-w-sm space-y-3">
            <DemoButton />
            {error && (
              <p role="alert" className="text-sm text-accent">
                {error === "rate" ? "Too many demo logins from your network. Try again in a few minutes." : "The demo is resetting. Try again in a minute."}
              </p>
            )}
            <p className="text-center text-sm text-muted">
              or <Link href="/sign-up" className="font-bold text-ink underline">create your own account</Link>
            </p>
          </div>
        </div>

        <div className="rounded-[32px] bg-dark p-6 text-card shadow-card">
          <p className="text-xs text-card/60">Ask AI · real answer from a test run</p>
          <p className="mt-1 font-bold">“How much did I spend on food and drink in September, in USD? And what is my biggest category?”</p>
          <div className="mt-4 rounded-card bg-card/10 p-4 text-sm leading-relaxed">
            In September 2026, you spent <b className="text-accent">$208.26</b> (₩275,800 across 24 transactions) on Food &amp; Drink. Your biggest category was <b className="text-accent">Housing</b> at $339.81 (₩450,000).
          </div>
          <p className="mt-3 font-mono text-[11px] text-card/50">gemini-3.6-flash · tool: spending_summary(2026-09-01 → 2026-09-30, group_by=category, USD) · 4.2 s</p>
        </div>
      </section>

      <section className="grid gap-3 pb-6 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="card flex gap-4">
            <div className="icon-tile">{f.icon}</div>
            <div>
              <h2 className="font-bold">{f.title}</h2>
              <p className="mt-1 text-sm text-muted">{f.text}</p>
            </div>
          </div>
        ))}
      </section>
      <Footer className="mt-auto" />
    </main>
  );
}
