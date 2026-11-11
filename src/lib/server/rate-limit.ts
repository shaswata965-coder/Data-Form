import "server-only";
import { loginAttempts } from "./mongodb";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

/**
 * Failed-login counter stored in MongoDB (works across serverless instances).
 * Fails open if the database is unreachable so the admin is never locked out
 * by an outage – the password check itself still applies.
 */
export async function isLockedOut(key: string): Promise<boolean> {
  try {
    const doc = await (await loginAttempts()).findOne({ _id: key });
    return Boolean(doc && doc.count >= MAX_FAILURES && doc.expiresAt > new Date());
  } catch {
    return false;
  }
}

export async function recordFailure(key: string): Promise<void> {
  try {
    await (await loginAttempts()).updateOne(
      { _id: key },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + WINDOW_MS) } },
      { upsert: true },
    );
  } catch {
    /* ignore */
  }
}

export async function clearFailures(key: string): Promise<void> {
  try {
    await (await loginAttempts()).deleteOne({ _id: key });
  } catch {
    /* ignore */
  }
}
