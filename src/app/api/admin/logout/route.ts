import { cookies } from "next/headers";
import { isSameOrigin, SESSION_COOKIE } from "@/lib/server/session";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response("Forbidden", { status: 403 });
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return new Response(null, { status: 303, headers: { Location: "/admin/login" } });
}
