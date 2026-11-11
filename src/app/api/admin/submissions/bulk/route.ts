import { getAdmin, isSameOrigin } from "@/lib/server/auth";
import { deleteSubmissions, isRecordId, MAX_BULK } from "@/lib/server/admin-data";
import { json } from "@/lib/server/http";

/** Bulk actions on selected records. Body: { action: "delete", ids: string[] } */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json(403, { ok: false, message: "Forbidden" });
  if (!(await getAdmin())) return json(401, { ok: false, message: "Not signed in" });

  let body: { action?: unknown; ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, message: "Invalid request" });
  }
  const ids = Array.isArray(body?.ids) ? body.ids : null;
  if (!ids || ids.length === 0) return json(400, { ok: false, message: "No records selected" });
  if (ids.length > MAX_BULK) return json(400, { ok: false, message: `Select at most ${MAX_BULK} records` });
  if (!ids.every(isRecordId)) return json(400, { ok: false, message: "Invalid record id" });

  if (body.action !== "delete") return json(400, { ok: false, message: "Unknown action" });

  try {
    const deleted = await deleteSubmissions(ids);
    return json(200, { ok: true, deleted });
  } catch (e) {
    console.error("[bulk]", e);
    return json(503, { ok: false, message: "Database unavailable" });
  }
}
