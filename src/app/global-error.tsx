"use client";

// Last-resort error page (the root layout itself failed). Plain markup, no stack traces.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F6F8F6", color: "#26282B", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0, padding: 16 }}>
        <div style={{ background: "#fff", borderRadius: 24, padding: 24, maxWidth: 360, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>Something went wrong</h1>
          <p style={{ color: "#808887", fontSize: 14 }}>Please try again in a moment.</p>
          <button onClick={reset} style={{ background: "#FF6B5B", color: "#fff", border: 0, borderRadius: 14, padding: "12px 20px", fontWeight: 700, minHeight: 44 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
