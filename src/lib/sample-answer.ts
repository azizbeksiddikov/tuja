// A real answer recorded from the assistant on the demo data (shown on the landing page and when the
// live model is unavailable, so visitors still see what the assistant does).
export const SAMPLE_ANSWER = {
  question: "How much did I spend on food and drink in September, in USD? And what is my biggest category?",
  parts: [
    "In September 2026, you spent ",
    { b: "$208.26" },
    " (₩275,800 across 24 transactions) on Food & Drink. Your biggest category was ",
    { b: "Housing" },
    " at $339.81 (₩450,000).",
  ] as (string | { b: string })[],
  trace: "gemini-3.6-flash · tool: spending_summary(2026-09-01 → 2026-09-30, group_by=category, USD) · 4.2 s",
};
