import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import AuthShell from "@/components/AuthShell";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function SignIn() {
  if (await getSessionUser()) redirect("/dashboard");
  return (
    <AuthShell title="Sign in">
      <AuthForm mode="sign-in" />
    </AuthShell>
  );
}
