import CurrencySwitcher from "@/components/CurrencySwitcher";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";
import { TabBar, TopNav } from "@/components/NavLinks";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureDemoFresh } from "@/lib/demo/refresh";
import { getDisplayCurrency } from "@/lib/server/prefs";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.isDemo) await ensureDemoFresh(prisma);
  const ccy = await getDisplayCurrency(user.homeCurrency);
  return (
    <div className="mx-auto min-h-dvh max-w-5xl px-4 pb-24 pt-4 md:pb-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <Logo href="/dashboard" />
        <TopNav />
        <CurrencySwitcher value={ccy} />
      </header>
      {user.isDemo && (
        <p className="mb-4 rounded-card bg-dark px-4 py-2.5 text-xs text-card">
          <b className="text-accent">Demo mode.</b> Read-only, seeded data for “Dilnoza”, an Uzbek student in Seoul.
        </p>
      )}
      {children}
      <Footer />
      <TabBar />
    </div>
  );
}
