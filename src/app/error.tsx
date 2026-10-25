"use client";

import Link from "next/link";
import { useEffect } from "react";

// Friendly page for unexpected server/render errors. No stack traces are shown to visitors.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <div className="card text-center">
        <p className="text-4xl" aria-hidden>🌧️</p>
        <h1 className="mt-3 text-xl font-extrabold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">This page couldn&apos;t load. It&apos;s usually temporary, so please try again.</p>
        {error.digest && <p className="mt-2 font-mono text-[11px] text-muted">Reference: {error.digest}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={reset} className="btn-primary flex-1">Try again</button>
          <Link href="/" className="btn-soft flex-1">Home</Link>
        </div>
      </div>
    </main>
  );
}
