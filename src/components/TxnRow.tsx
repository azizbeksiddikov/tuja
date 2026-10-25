import { categoryEmoji } from "@/lib/categories";
import type { TxnView } from "@/lib/server/finance";
import Money from "./Money";

export function fmtDay(isoDay: string) {
  const d = new Date(`${isoDay}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function TxnRow({ t, showAccount }: { t: TxnView; showAccount?: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="icon-tile" aria-hidden>
        {categoryEmoji(t.category)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{t.merchant}</p>
        <p className="truncate text-xs text-muted">
          {fmtDay(t.bookedAt)} · {t.category}
          {showAccount ? ` · ${t.accountName}` : ""}
          {t.pending ? " · pending" : ""}
        </p>
        {t.memo ? <p className="truncate text-xs text-muted/80" title={t.memo}>“{t.memo}”</p> : null}
      </div>
      <Money minor={t.amountMinor} ccy={t.currency} signed colored className="shrink-0 text-sm font-bold" />
    </li>
  );
}
