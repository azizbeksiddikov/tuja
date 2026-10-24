"use client";

import { useTransition } from "react";
import { setCurrencyAction } from "@/app/actions/auth";

const OPTIONS = [
  { code: "KRW", label: "₩ KRW" },
  { code: "UZS", label: "so'm UZS" },
  { code: "USD", label: "$ USD" },
];

export default function CurrencySwitcher({ value }: { value: string }) {
  const [pending, start] = useTransition();
  return (
    <form className="pill gap-1 p-1" aria-label="Display currency">
      {OPTIONS.map((o) => (
        <button
          key={o.code}
          type="button"
          disabled={pending}
          aria-pressed={value === o.code}
          onClick={() => {
            const f = new FormData();
            f.set("currency", o.code);
            start(() => setCurrencyAction(f));
          }}
          className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${value === o.code ? "bg-dark text-card" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </form>
  );
}
