"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SampleAnswer from "./SampleAnswer";

type Step = { id: string; name: string; args: Record<string, unknown>; done?: boolean; ok?: boolean; blocked?: boolean; summary?: string; sql?: string; data?: unknown };
type Msg = { role: "user" | "assistant"; content: string; steps?: Step[]; meta?: string; error?: string; errorCode?: string; question?: string };

const STATUS_MESSAGES: Record<number, string> = {
  401: "Your session has ended. Please sign in again.",
  429: "Too many questions right now. Please wait a minute and try again.",
  502: "The server is busy or restarting. Please try again in a moment.",
  503: "The server is busy or restarting. Please try again in a moment.",
  504: "The server took too long to answer. Please try again.",
};
const NO_RETRY = new Set(["not_configured", "misconfigured", "unauthorized", "quota"]);
const SHOW_SAMPLE = new Set(["rate_limit", "quota", "not_configured", "misconfigured"]);

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

export default function Chat({ configured, suggestions, initialQuestion = "" }: { configured: boolean; suggestions: string[]; initialQuestion?: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState(initialQuestion.slice(0, 1000));
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (msgs.length) end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  const update = (fn: (m: Msg) => Msg) => setMsgs((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);
  const fail = (error: string, errorCode?: string) => update((m) => ({ ...m, error, errorCode }));

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    const history = [...msgs.filter((m) => !m.error && m.content), { role: "user" as const, content: q }].map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "", steps: [], question: q }]);
    let finished = false;
    let gotText = false;
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history }) });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null);
        fail(err?.error || STATUS_MESSAGES[res.status] || `Something went wrong (HTTP ${res.status}). Please try again.`, err?.code ?? (res.status === 401 ? "unauthorized" : undefined));
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
          let ev;
          try {
            ev = JSON.parse(line);
          } catch {
            continue; // skip a malformed line instead of dropping the whole answer
          }
          if (ev.type === "text") {
            gotText = true;
            update((m) => ({ ...m, content: m.content + ev.delta }));
          } else if (ev.type === "tool_call") update((m) => ({ ...m, steps: [...(m.steps ?? []), { id: ev.id, name: ev.name, args: ev.args }] }));
          else if (ev.type === "tool_result")
            update((m) => ({ ...m, steps: (m.steps ?? []).map((s) => (s.id === ev.id ? { ...s, done: true, ok: ev.ok, blocked: ev.blocked, summary: ev.summary, sql: ev.sql, data: ev.data } : s)) }));
          else if (ev.type === "error") fail(ev.message, ev.code);
          else if (ev.type === "done") {
            finished = true;
            update((m) => (m.error && !m.content ? m : { ...m, meta: [ev.model, `${(ev.latencyMs / 1000).toFixed(1)} s`, ev.inputTokens ? `${ev.inputTokens} in / ${ev.outputTokens ?? 0} out tokens` : ""].filter(Boolean).join(" · ") }));
          }
        }
      }
      if (!finished) update((m) => (m.error ? m : { ...m, error: gotText ? "The answer was cut off. Please try again." : "The connection closed before an answer arrived. Please try again." }));
    } catch {
      fail(navigator.onLine === false ? "You appear to be offline. Check your connection and try again." : "Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <div className="flex flex-col gap-3">
        <div className="card">
          <p className="text-3xl" aria-hidden>✨</p>
          <h1 className="mt-2 text-lg font-extrabold">The AI assistant is off on this server</h1>
          <p className="mt-1 text-sm text-muted">No Gemini API key is set here. The dashboard, transactions and currency switcher all work without it.</p>
          <div className="mt-4 flex gap-2">
            <Link href="/dashboard" className="btn-primary flex-1">Dashboard</Link>
            <Link href="/transactions" className="btn-soft flex-1">Transactions</Link>
          </div>
        </div>
        <SampleAnswer label="What it looks like when it's on · a real recorded answer" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!msgs.length && (
        <div className="card">
          <h1 className="text-xl font-extrabold">Ask about your money</h1>
          <p className="mt-1 text-sm text-muted">Gemini answers using tools and read-only SQL over your own data. Open any step to see exactly what ran.</p>
          <p className="mt-4 text-xs font-bold text-muted">Try one:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} disabled={busy} className="min-h-10 rounded-full bg-soft px-3.5 py-2 text-left text-xs font-bold hover:brightness-95 disabled:opacity-50">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {msgs.map((m, i) =>
        m.role === "user" ? (
          <div key={i} className="ml-auto max-w-[85%] break-words rounded-card rounded-br-md bg-card px-4 py-3 text-sm font-medium shadow-card">{m.content}</div>
        ) : (
          <div key={i} className="flex flex-col gap-3">
            <div className="max-w-full break-words rounded-card rounded-bl-md bg-dark px-4 py-3.5 text-sm text-card md:max-w-[90%]">
              {m.steps && m.steps.length > 0 && <Trace steps={m.steps} />}
              {m.content ? <div className={m.steps?.length ? "mt-3" : ""}><Rich text={m.content} /></div> : !m.error && <p className="mt-2 animate-pulse text-card/60">Thinking…</p>}
              {m.error && (
                <div role="alert" className={m.content || m.steps?.length ? "mt-3" : ""}>
                  <p className="text-accent">{m.error}</p>
                  {m.errorCode === "unauthorized" ? (
                    <Link href="/sign-in" className="btn-soft mt-3">Sign in</Link>
                  ) : (
                    !NO_RETRY.has(m.errorCode ?? "") && m.question && i === msgs.length - 1 && (
                      <button type="button" onClick={() => send(m.question!)} disabled={busy} className="btn-soft mt-3 min-h-10">Try again</button>
                    )
                  )}
                </div>
              )}
              {m.meta && <p className="mt-2 break-words font-mono text-[10px] text-card/40">{m.meta}</p>}
            </div>
            {m.error && SHOW_SAMPLE.has(m.errorCode ?? "") && i === msgs.length - 1 && <SampleAnswer label="While you wait · a real answer recorded earlier" className="md:max-w-[90%]" />}
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
        <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} placeholder="e.g. How much did I spend at GS25 this month?" className="min-h-10 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" aria-label="Your question" />
        <button className="btn-primary min-w-16" disabled={busy || !input.trim()}>{busy ? "…" : "Ask"}</button>
      </form>
      <p className="text-center text-[11px] text-muted">The assistant is read-only and can make mistakes. Check the tool trace for the exact numbers.</p>
    </div>
  );
}
