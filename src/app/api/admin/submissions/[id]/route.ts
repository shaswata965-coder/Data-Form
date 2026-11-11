import { getAdmin, isSameOrigin } from "@/lib/server/auth";
import { deleteSubmission } from "@/lib/server/admin-data";
import { json } from "@/lib/server/http";

export async function DELETE(req: Request, ctx: RouteContext<"/api/admin/submissions/[id]">) {
  if (!isSameOrigin(req)) return json(403, { ok: false, message: "Forbidden" });
  if (!(await getAdmin())) return json(401, { ok: false, message: "Not signed in" });
  const { id } = await ctx.params;
  try {
    const deleted = await deleteSubmission(id);
    return deleted ? json(200, { ok: true }) : json(404, { ok: false, message: "Not found" });
  } catch (e) {
    console.error("[delete]", e);
    return json(503, { ok: false, message: "Database unavailable" });
  }
}
