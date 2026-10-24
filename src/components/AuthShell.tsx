import Footer from "./Footer";
import Logo from "./Logo";
import DemoButton from "./DemoButton";

export default function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-6">
      <Logo />
      <div className="card mt-8">
        <h1 className="mb-4 text-2xl font-extrabold">{title}</h1>
        {children}
      </div>
      <div className="card mt-3">
        <p className="mb-3 text-sm text-muted">Just looking? Open a seeded account in one click.</p>
        <DemoButton />
      </div>
      <Footer className="mt-auto" />
    </main>
  );
}
