import Link from "next/link";
import { APP_NAME } from "@/lib/config";

export default function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="text-xl font-extrabold tracking-tight">
      {APP_NAME.toLowerCase()}
      <span className="text-accent">.</span>
    </Link>
  );
}
