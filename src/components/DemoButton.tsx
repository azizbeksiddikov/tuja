"use client";

import { useFormStatus } from "react-dom";
import { demoSignInAction } from "@/app/actions/auth";

function Inner({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full py-3.5 text-base" disabled={pending}>
      {pending ? "Opening demo…" : label}
    </button>
  );
}

export default function DemoButton({ label = "Try the demo (no sign-up)" }: { label?: string }) {
  return (
    <form action={demoSignInAction}>
      <Inner label={label} />
    </form>
  );
}
