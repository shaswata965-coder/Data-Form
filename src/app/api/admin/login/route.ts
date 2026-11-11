import {
  authConfigured,
  checkCredentials,
  clientKey,
  createSessionToken,
  isSameOrigin,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/server/session";
import { json } from "@/lib/server/http";
import { clearFailures, isLockedOut, recordFailure } from "@/lib/server/rate-limit";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json(403, { ok: false, message: "Forbidden" });
  if (!authConfigured()) {
    return json(503, {
      ok: false,
      message:
        "Admin login is not configured. Set ADMIN_USERNAME, ADMIN_PASSWORD and AUTH_SECRET (32+ characters) in the server environment.",
    });
  }

  let username = "";
  let password = "";
  try {
    const body = await req.json();
    username = typeof body?.username === "string" ? body.username.slice(0, 200) : "";
    password = typeof body?.password === "string" ? body.password.slice(0, 500) : "";
  } catch {
    return json(400, { ok: false, message: "Invalid request" });
  }

  const key = clientKey(req);
  if (await isLockedOut(key)) {
    return json(429, { ok: false, message: "Too many failed attempts. Try again in 15 minutes." });
  }

  if (!checkCredentials(username, password)) {
    await recordFailure(key);
    await new Promise((r) => setTimeout(r, 400));
    return json(401, { ok: false, message: "Incorrect username or password" });
  }

  await clearFailures(key);
  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions);
  return json(200, { ok: true });
}
