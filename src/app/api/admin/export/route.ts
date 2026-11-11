import { getAdmin } from "@/lib/server/auth";
import { appTimeZone, buildFilter, normalizeParams } from "@/lib/server/admin-data";
import { buildColumns, csvHeader, csvRow } from "@/lib/server/csv";
import { json } from "@/lib/server/http";
import { submissions } from "@/lib/server/mongodb";

/** CSV download of all (or filtered) submissions. Opens in Excel / SPSS / R. */
export async function GET(req: Request) {
  if (!(await getAdmin())) return json(401, { ok: false, message: "Not signed in" });

  const url = new URL(req.url);
  const params = normalizeParams(Object.fromEntries(url.searchParams));
  const tz = appTimeZone();
  const dateFmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const cols = buildColumns((d) => (d ? dateFmt.format(d) : ""));

  let cursor;
  try {
    cursor = (await submissions()).find(buildFilter(params)).sort({ receivedAt: 1, _id: 1 });
  } catch (e) {
    console.error("[export]", e);
    return json(503, { ok: false, message: "Database unavailable" });
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // BOM so Excel opens the UTF-8 file correctly
      controller.enqueue(enc.encode("﻿" + csvHeader(cols)));
    },
    async pull(controller) {
      try {
        let chunk = "";
        for (let i = 0; i < 200; i++) {
          const doc = await cursor.next();
          if (!doc) {
            if (chunk) controller.enqueue(enc.encode(chunk));
            await cursor.close();
            controller.close();
            return;
          }
          chunk += csvRow(cols, doc);
        }
        controller.enqueue(enc.encode(chunk));
      } catch (e) {
        console.error("[export]", e);
        controller.error(e);
        await cursor.close().catch(() => {});
      }
    },
    async cancel() {
      await cursor.close();
    },
  });

  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: tz }).format(new Date());
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="oral-health-data-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
