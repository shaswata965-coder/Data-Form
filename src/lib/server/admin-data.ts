import "server-only";
import { ObjectId, type Filter, type WithId } from "mongodb";
import { submissions, type SubmissionDoc } from "./mongodb";

export const PAGE_SIZE = 25;

export interface ListParams {
  q?: string;
  consent?: string;
  page?: number;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeParams(sp: Record<string, string | string[] | undefined>): Required<ListParams> {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const page = Number.parseInt(one(sp.page), 10);
  const consent = one(sp.consent);
  return {
    q: one(sp.q).trim().slice(0, 60),
    consent: consent === "yes" || consent === "no" ? consent : "",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function buildFilter(p: ListParams): Filter<SubmissionDoc> {
  const f: Filter<SubmissionDoc> = {};
  if (p.q) f.participantId = { $regex: escapeRegex(p.q), $options: "i" };
  if (p.consent === "yes") f.consent = true;
  if (p.consent === "no") f.consent = false;
  return f;
}

export async function getStats() {
  const col = await submissions();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [total, consented, refused, last24h] = await Promise.all([
    col.countDocuments({}),
    col.countDocuments({ consent: true }),
    col.countDocuments({ consent: false }),
    col.countDocuments({ receivedAt: { $gte: since } }),
  ]);
  return { total, consented, refused, last24h };
}

export async function listSubmissions(p: Required<ListParams>) {
  const col = await submissions();
  const filter = buildFilter(p);
  const total = await col.countDocuments(filter);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(p.page, pages);
  const rows = await col
    .find(filter, {
      projection: {
        clientId: 1,
        participantId: 1,
        consent: 1,
        receivedAt: 1,
        "answers.age": 1,
        "answers.gender": 1,
      },
    })
    .sort({ receivedAt: -1, _id: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .toArray();
  const duplicates = await duplicateIds(rows.map((r) => r.participantId));
  return { rows, total, page, pages, duplicates };
}

/** Participant IDs (from the given list) that appear in more than one record. */
export async function duplicateIds(ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Set();
  const col = await submissions();
  const dup = await col
    .aggregate<{ _id: string }>([
      { $match: { participantId: { $in: unique } } },
      { $group: { _id: "$participantId", n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ])
    .toArray();
  return new Set(dup.map((d) => d._id));
}

export async function getSubmission(id: string): Promise<WithId<SubmissionDoc> | null> {
  if (!ObjectId.isValid(id) || String(new ObjectId(id)) !== id) return null;
  return (await submissions()).findOne({ _id: new ObjectId(id) });
}

export function isRecordId(id: unknown): id is string {
  return typeof id === "string" && ObjectId.isValid(id) && String(new ObjectId(id)) === id;
}

export async function deleteSubmission(id: string): Promise<boolean> {
  if (!isRecordId(id)) return false;
  const res = await (await submissions()).deleteOne({ _id: new ObjectId(id) });
  return res.deletedCount === 1;
}

/** Upper limit for one bulk selection or bulk action. */
export const MAX_BULK = 10_000;

/** Record ids matching the filter, in the same order as the admin table (newest first). */
export async function listIds(p: ListParams, limit: number): Promise<string[]> {
  const docs = await (await submissions())
    .find(buildFilter(p), { projection: { _id: 1 } })
    .sort({ receivedAt: -1, _id: -1 })
    .limit(Math.min(Math.max(1, limit), MAX_BULK))
    .toArray();
  return docs.map((d) => String(d._id));
}

export async function deleteSubmissions(ids: string[]): Promise<number> {
  const valid = [...new Set(ids.filter(isRecordId))].map((id) => new ObjectId(id));
  if (!valid.length) return 0;
  const res = await (await submissions()).deleteMany({ _id: { $in: valid } });
  return res.deletedCount;
}

export function appTimeZone(): string {
  const tz = process.env.APP_TIMEZONE || "Asia/Dhaka";
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

export function formatDateTime(d: Date | null | undefined, tz = appTimeZone()): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(d);
}
