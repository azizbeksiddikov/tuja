"use client";

import { useEffect, useRef, useState } from "react";

type Step = { id: string; name: string; args: Record<string, unknown>; done?: boolean; ok?: boolean; blocked?: boolean; summary?: string; sql?: string; data?: unknown };
type Msg = { role: "user" | "assistant"; content: string; steps?: Step[]; meta?: string; error?: string };

const SUGGESTIONS = [
  "How much did I spend on food last month, in USD?",
  "What are my subscriptions and what do they cost per month?",
  "How much has Mom sent me since May, in won?",
  "Compare my spending in September vs August by category",
  "Show the memo on my Gift Shop Myeongdong purchase",
];

/** Minimal formatter: **bold** → coral highlight, keeps line breaks. No HTML from the model is rendered. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="whitespace-pre-wrap leading-relaxed">
      {parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i} className="text-accent">{p.slice(2, -2)}</b> : <span key={i}>{p.replace(/^\s*[*-] /gm, "• ").replace(/^> ?/gm, "│ ").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")}</span>))}
    </p>
  );
}

function Trace({ steps }: { steps: Step[] }) {
  return (
    <div className="mt-3 space-y-1.5">
      {steps.map((s) => (
        <details key={s.id} className="group rounded-tile bg-card/10 text-xs">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2">
            <span aria-hidden>{!s.done ? "⏳" : s.blocked ? "🛡️" : s.ok ? "🔧" : "⚠️"}</span>
            <span className="font-mono font-bold">{s.name}</span>
            <span className="truncate text-card/60">{s.done ? s.summary : "running…"}</span>
            {s.blocked && <span className="ml-auto rounded-full bg-accent px-2 py-0.5 font-bold text-accent-ink">blocked</span>}
            <span className="ml-auto text-card/40 group-open:rotate-90">›</span>
          </summary>
          <div className="space-y-2 px-3 pb-3">
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-black/30 p-2 font-mono text-[11px] text-card/80">{JSON.stringify(s.args, null, 1)}</pre>
            {s.sql && (
              <>
                <p className="text-card/50">SQL (validated by pg-guard, run as read-only role with RLS):</p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2 font-mono text-[11px] text-accent">{s.sql}</pre>
              </>
            )}
            {s.done && (
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/30 p-2 font-mono text-[11px] text-card/70">
                {JSON.stringify(s.data, null, 1)?.slice(0, 3000)}
              </pre>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

export default function Chat({ configured }: { configured: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (msgs.length) end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  const update = (fn: (m: Msg) => Msg) => setMsgs((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    const history = [...msgs.filter((m) => !m.error && m.content), { role: "user" as const, content: q }].map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "", steps: [] }]);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history }) });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        update((m) => ({ ...m, error: err.error || "Request failed" }));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "text") update((m) => ({ ...m, content: m.content + ev.delta }));
          else if (ev.type === "tool_call") update((m) => ({ ...m, steps: [...(m.steps ?? []), { id: ev.id, name: ev.name, args: ev.args }] }));
          else if (ev.type === "tool_result")
            update((m) => ({ ...m, steps: (m.steps ?? []).map((s) => (s.id === ev.id ? { ...s, done: true, ok: ev.ok, blocked: ev.blocked, summary: ev.summary, sql: ev.sql, data: ev.data } : s)) }));
          else if (ev.type === "error") update((m) => ({ ...m, error: ev.message }));
          else if (ev.type === "done") update((m) => ({ ...m, meta: `${ev.model} · ${(ev.latencyMs / 1000).toFixed(1)} s · ${ev.inputTokens ?? "?"} in / ${ev.outputTokens ?? "?"} out tokens` }));
        }
      }
    } catch {
      update((m) => ({ ...m, error: "Connection lost. Try again." }));
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <div className="card text-center">
        <p className="text-3xl">✨</p>
        <h1 className="mt-2 text-lg font-extrabold">AI not configured</h1>
        <p className="mt-1 text-sm text-muted">This server has no GEMINI_API_KEY. Everything else in the app works without it.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!msgs.length && (
        <div className="card">
          <h1 className="text-xl font-extrabold">Ask about your money</h1>
          <p className="mt-1 text-sm text-muted">Gemini answers using tools and read-only SQL over your own data. Open any step to see exactly what ran.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} className="min-h-10 rounded-full bg-soft px-3.5 py-2 text-left text-xs font-bold hover:brightness-95">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {msgs.map((m, i) =>
        m.role === "user" ? (
          <div key={i} className="ml-auto max-w-[85%] rounded-card rounded-br-md bg-card px-4 py-3 text-sm font-medium shadow-card">{m.content}</div>
        ) : (
          <div key={i} className="max-w-full rounded-card rounded-bl-md bg-dark px-4 py-3.5 text-sm text-card md:max-w-[90%]">
            {m.steps && m.steps.length > 0 && <Trace steps={m.steps} />}
            {m.content ? <div className={m.steps?.length ? "mt-3" : ""}><Rich text={m.content} /></div> : !m.error && <p className="mt-2 animate-pulse text-card/60">Thinking…</p>}
            {m.error && <p className="mt-2 text-accent">{m.error}</p>}
            {m.meta && <p className="mt-2 font-mono text-[10px] text-card/40">{m.meta}</p>}
          </div>
        ),
      )}
      <div ref={end} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-20 flex gap-2 rounded-card bg-card p-2 shadow-card md:bottom-4"
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} placeholder="e.g. How much did I spend at GS25 in October?" className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" aria-label="Your question" />
        <button className="btn-primary" disabled={busy || !input.trim()}>{busy ? "…" : "Ask"}</button>
      </form>
      <p className="text-center text-[11px] text-muted">The assistant is read-only and can make mistakes. Check the tool trace for the exact numbers.</p>
    </div>
  );
}
