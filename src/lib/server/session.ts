import { createHash, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

/**
 * Single admin account configured with environment variables:
 *   ADMIN_USERNAME, ADMIN_PASSWORD, AUTH_SECRET (32+ random characters)
 *
 * The session is a signed JWT in an httpOnly cookie. The signing key is
 * derived from all three values, so changing the password (or the secret)
 * immediately logs out every existing session.
 */

export const SESSION_COOKIE = "ohsi_admin";
export const SESSION_HOURS = 12;

interface AuthConfig {
  username: string;
  password: string;
  secret: string;
}

function config(): AuthConfig | null {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (!username || !password || !secret || secret.length < 32) return null;
  return { username, password, secret };
}

export function authConfigured(): boolean {
  return config() !== null;
}

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest();

function signingKey(c: AuthConfig): Uint8Array {
  return new Uint8Array(sha256(`${c.secret}\u0000${c.username}\u0000${c.password}`));
}

/** Constant-time comparison of both fields. */
export function checkCredentials(username: string, password: string): boolean {
  const c = config();
  if (!c) return false;
  const userOk = timingSafeEqual(sha256(username), sha256(c.username));
  const passOk = timingSafeEqual(sha256(password), sha256(c.password));
  return userOk && passOk;
}

export async function createSessionToken(): Promise<string> {
  const c = config();
  if (!c) throw new Error("Admin login is not configured");
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(c.username)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(signingKey(c));
}

export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  const c = config();
  if (!c || !token) return null;
  try {
    const { payload } = await jwtVerify(token, signingKey(c), { algorithms: ["HS256"] });
    return payload.role === "admin" && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_HOURS * 60 * 60,
};

/** Blocks cross-site requests to state-changing admin endpoints. */
export function isSameOrigin(req: Request): boolean {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function clientKey(req: Request): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return sha256(`login:${ip}`).toString("hex").slice(0, 32);
}
