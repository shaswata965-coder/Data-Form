import { getAdmin } from "@/lib/server/auth";
import { listIds, MAX_BULK, normalizeParams } from "@/lib/server/admin-data";
import { json } from "@/lib/server/http";

/**
 * Ids of the first `limit` records matching the current filter, newest first
 * (the admin table order). Used by "Select first 10 / 20 / 30" and "Select all".
 */
export async function GET(req: Request) {
  if (!(await getAdmin())) return json(401, { ok: false, message: "Not signed in" });
  const url = new URL(req.url);
  const params = normalizeParams(Object.fromEntries(url.searchParams));
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  try {
    const ids = await listIds(params, Number.isFinite(limit) ? limit : MAX_BULK);
    return json(200, { ok: true, ids, capped: ids.length >= MAX_BULK });
  } catch (e) {
    console.error("[ids]", e);
    return json(503, { ok: false, message: "Database unavailable" });
  }
}
