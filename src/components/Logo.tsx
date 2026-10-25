import Link from "next/link";
import { APP_NAME } from "@/lib/config";

export default function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex min-h-10 items-center self-start text-xl font-extrabold tracking-tight">
      {APP_NAME.toLowerCase()}
      <span className="text-accent">.</span>
    </Link>
  );
}
