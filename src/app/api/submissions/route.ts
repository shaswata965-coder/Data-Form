import { SCHEMA_VERSION } from "@/lib/form-schema";
import { cleanSubmission } from "@/lib/validation";
import { json, isDuplicateKeyError } from "@/lib/server/http";
import { ConfigError, submissions, type SubmissionDoc } from "@/lib/server/mongodb";

const MAX_BYTES = 32 * 1024;
const CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string" || v.length > 40) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Public endpoint used by the form (and its service worker) to upload a
 * completed form. Idempotent: the device-generated clientId is unique, so
 * retries after a dropped connection never create duplicates.
 */
export async function POST(req: Request) {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) {
    return json(415, { ok: false, message: "Expected application/json" });
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) {
    return json(413, { ok: false, message: "Submission too large" });
  }

  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > MAX_BYTES) return json(413, { ok: false, message: "Submission too large" });
    body = JSON.parse(text);
  } catch {
    return json(400, { ok: false, message: "Invalid JSON" });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json(400, { ok: false, message: "Invalid submission" });
  }

  const clientId = typeof body.clientId === "string" ? body.clientId.toLowerCase() : "";
  if (!CLIENT_ID.test(clientId)) return json(400, { ok: false, message: "Invalid submission id" });

  const result = cleanSubmission(body.answers);
  if (!result.ok) {
    const fields = Object.keys(result.errors);
    return json(422, {
      ok: false,
      message: `Some answers are missing or invalid: ${fields.join(", ")}`,
      errors: result.errors,
    });
  }

  const answers = result.answers;
  const doc: SubmissionDoc = {
    clientId,
    participantId: answers.participantId ?? "",
    consent: answers.consent === true,
    answers,
    schemaVersion: typeof body.schemaVersion === "number" ? body.schemaVersion : SCHEMA_VERSION,
    clientCreatedAt: parseDate(body.clientCreatedAt),
    startedAt: parseDate(body.startedAt),
    receivedAt: new Date(),
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300) || undefined,
  };

  try {
    const col = await submissions();
    const res = await col.updateOne({ clientId }, { $setOnInsert: doc }, { upsert: true });
    const created = res.upsertedCount === 1;
    return json(created ? 201 : 200, { ok: true, duplicate: !created });
  } catch (e) {
    if (isDuplicateKeyError(e)) return json(200, { ok: true, duplicate: true });
    if (e instanceof ConfigError) {
      console.error("[submissions]", e.message);
      return json(503, { ok: false, message: "Server is not configured yet" });
    }
    console.error("[submissions] database error", e);
    return json(503, { ok: false, message: "Database temporarily unavailable" });
  }
}
