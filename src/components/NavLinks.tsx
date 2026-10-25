"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/dashboard", label: "Home", icon: "🏠" },
  { href: "/transactions", label: "Spend", icon: "🧾" },
  { href: "/assistant", label: "Ask AI", icon: "✨" },
  { href: "/more", label: "More", icon: "☰" },
];

export function TopNav() {
  const path = usePathname();
  return (
    <nav className="hidden items-center gap-1 md:flex">
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={cn("rounded-full px-4 py-2.5 text-sm font-bold transition", path.startsWith(n.href) ? "bg-card text-ink shadow-card" : "text-muted hover:text-ink")}
        >
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

export function TabBar() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {NAV.map((n) => {
          const on = path.startsWith(n.href);
          return (
            <li key={n.href}>
              <Link href={n.href} className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 px-2 pb-2 pt-2 text-[11px]", on ? "font-bold text-ink" : "text-muted")}>
                <span className={cn("text-lg leading-none", !on && "opacity-60 grayscale")} aria-hidden>
                  {n.icon}
                </span>
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
