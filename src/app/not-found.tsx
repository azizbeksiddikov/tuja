import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <div className="card text-center">
        <p className="text-4xl" aria-hidden>🧭</p>
        <h1 className="mt-3 text-xl font-extrabold">Page not found</h1>
        <p className="mt-2 text-sm text-muted">This page doesn&apos;t exist. Head back home to continue.</p>
        <Link href="/" className="btn-primary mt-4 w-full">Home</Link>
      </div>
    </main>
  );
}
