import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Sign-in/up/out run through server actions (src/app/actions/auth.ts). Over HTTP we expose only
// read-only session lookups and sign-out, so nobody can e.g. change the public demo password.
const ALLOWED = new Set(["get-session", "sign-out"]);
const handler = toNextJsHandler(auth);

function allowed(req: Request) {
  const path = new URL(req.url).pathname.replace(/^\/api\/auth\//, "");
  return ALLOWED.has(path);
}

export async function GET(req: Request) {
  return allowed(req) ? handler.GET(req) : new Response("Not found", { status: 404 });
}
export async function POST(req: Request) {
  return allowed(req) ? handler.POST(req) : new Response("Not found", { status: 404 });
}
