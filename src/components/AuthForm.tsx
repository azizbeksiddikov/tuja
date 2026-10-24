"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction, signUpAction, type FormState } from "@/app/actions/auth";

export default function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const [state, action, pending] = useActionState<FormState, FormData>(mode === "sign-in" ? signInAction : signUpAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      {mode === "sign-up" && (
        <label className="flex flex-col gap-1 text-sm font-bold">
          Name
          <input name="name" className="field font-normal" autoComplete="name" required maxLength={80} />
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm font-bold">
        Email
        <input name="email" type="email" className="field font-normal" autoComplete="email" required />
      </label>
      <label className="flex flex-col gap-1 text-sm font-bold">
        Password
        <input name="password" type="password" className="field font-normal" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required minLength={mode === "sign-up" ? 8 : 1} />
      </label>
      {state?.error && <p role="alert" className="rounded-tile bg-accent/10 px-3 py-2 text-sm text-accent">{state.error}</p>}
      <button className="btn-primary mt-1 py-3" disabled={pending}>
        {pending ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
      </button>
      <p className="text-center text-sm text-muted">
        {mode === "sign-in" ? (
          <>No account? <Link className="font-bold text-ink underline" href="/sign-up">Sign up</Link></>
        ) : (
          <>Have an account? <Link className="font-bold text-ink underline" href="/sign-in">Sign in</Link></>
        )}
      </p>
    </form>
  );
}
