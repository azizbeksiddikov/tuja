// Dev helper: ask the assistant a question as the demo user and print the event stream.
//   npx tsx scripts/ask.ts "How much did I spend on food last month?"
import "./load-env";

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { runAgent } = await import("../src/lib/agent/run");
  const { DEMO_EMAIL } = await import("../src/lib/demo/seed");
  const demo = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL } });
  const q = process.argv.slice(2).join(" ") || "What is my total balance in USD?";
  for await (const ev of runAgent({ userId: demo.id, userName: demo.name, displayCurrency: "KRW", messages: [{ role: "user", content: q }], persist: false })) {
    if (ev.type === "text") process.stdout.write(ev.delta);
    else if (ev.type === "tool_result") console.log(`\n[${ev.name}] ${ev.summary}${ev.sql ? `\n  SQL: ${ev.sql}` : ""}`);
    else if (ev.type === "tool_call") console.log(`\n-> ${ev.name}(${JSON.stringify(ev.args)})`);
    else console.log("\n", JSON.stringify(ev));
  }
  await prisma.$disconnect();
}
main();
