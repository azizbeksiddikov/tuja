export default function Footer({ className = "" }: { className?: string }) {
  return (
    <footer className={`px-4 py-6 text-center text-xs leading-relaxed text-muted ${className}`}>
      <p className="font-bold">Demo app. Not a bank. Sandbox data only.</p>
      <p>
        Started from{" "}
        <a className="underline" href="https://github.com/adrianhajdin/banking" target="_blank" rel="noreferrer">
          adrianhajdin/banking
        </a>{" "}
        (MIT, JS Mastery). Rebuilt on Postgres with a guarded AI assistant.
      </p>
    </footer>
  );
}
