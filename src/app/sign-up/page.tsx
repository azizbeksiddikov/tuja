import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import AuthShell from "@/components/AuthShell";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Create account" };

export default async function SignUp() {
  if (await getSessionUser()) redirect("/dashboard");
  return (
    <AuthShell title="Create account">
      <AuthForm mode="sign-up" />
    </AuthShell>
  );
}
