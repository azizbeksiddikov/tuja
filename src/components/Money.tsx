import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export default function Money({ minor, ccy, signed, colored, className }: { minor: number; ccy: string; signed?: boolean; colored?: boolean; className?: string }) {
  return (
    <span className={cn("num", colored && minor > 0 && "text-pos", className)}>
      {formatMoney(Math.round(minor), ccy, { signed }).replace("-", "−")}
    </span>
  );
}
