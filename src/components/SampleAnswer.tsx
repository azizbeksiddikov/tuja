import { SAMPLE_ANSWER } from "@/lib/sample-answer";

/** A recorded real answer, rendered in the dark "assistant" style. */
export default function SampleAnswer({ label = "Ask AI · real answer from a test run", className = "" }: { label?: string; className?: string }) {
  return (
    <div className={`rounded-[32px] bg-dark p-6 text-card shadow-card ${className}`}>
      <p className="text-xs text-card/60">{label}</p>
      <p className="mt-1 font-bold">“{SAMPLE_ANSWER.question}”</p>
      <div className="mt-4 rounded-card bg-card/10 p-4 text-sm leading-relaxed">
        {SAMPLE_ANSWER.parts.map((p, i) => (typeof p === "string" ? <span key={i}>{p}</span> : <b key={i} className="text-accent">{p.b}</b>))}
      </div>
      <p className="mt-3 break-words font-mono text-[11px] text-card/50">{SAMPLE_ANSWER.trace}</p>
    </div>
  );
}
