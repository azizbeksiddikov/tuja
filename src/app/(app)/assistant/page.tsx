import Chat from "@/components/Chat";
import { isAiConfigured } from "@/lib/config";

export const metadata = { title: "Ask AI" };

const monthName = (offset: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
};

export default async function Assistant({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  // Relative to today, because the demo data always ends today.
  const suggestions = [
    "Where did most of my money go this month?",
    `Compare my spending in ${monthName(-1)} vs ${monthName(-2)} by category`,
    "How much has Mom sent me in the last 3 months, in won?",
    "What are my subscriptions and what do they cost per month?",
    "Show the memo on my Gift Shop Myeongdong purchase",
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <Chat configured={isAiConfigured()} suggestions={suggestions} initialQuestion={typeof q === "string" ? q : ""} />
    </div>
  );
}
