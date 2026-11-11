import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getAdmin } from "@/lib/server/auth";
import {
  formatDateTime,
  getStats,
  listSubmissions,
  normalizeParams,
  PAGE_SIZE,
} from "@/lib/server/admin-data";
import { ConfigError } from "@/lib/server/mongodb";
import { AlertIcon } from "@/components/icons";
import { ConsentBadge } from "@/components/admin/ConsentBadge";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function AdminHome({ searchParams }: PageProps<"/admin">) {
  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">Submissions</h1>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function qs(params: Record<string, string | number>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== "" && v !== 1 && v !== undefined) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  if (!(await getAdmin())) redirect("/admin/login");
  const params = normalizeParams(await searchParams);

  let stats: Awaited<ReturnType<typeof getStats>>;
  let list: Awaited<ReturnType<typeof listSubmissions>>;
  try {
    [stats, list] = await Promise.all([getStats(), listSubmissions(params)]);
  } catch (e) {
    console.error("[admin]", e);
    return <DbError configMissing={e instanceof ConfigError} />;
  }

  const { rows, total, page, pages, duplicates } = list;
  const filterQs = { q: params.q, consent: params.consent };
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="mt-4 space-y-5">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total records" value={stats.total} />
        <Stat label="Consent: Yes" value={stats.consented} />
        <Stat label="Consent: No (refused)" value={stats.refused} />
        <Stat label="Received in last 24 h" value={stats.last24h} />
      </dl>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-end">
        <form action="/admin" method="get" className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1">
            <span className="text-sm font-semibold text-slate-700">Participant ID</span>
            <input name="q" defaultValue={params.q} placeholder="Search…" className="input mt-1 h-12 text-base" />
          </label>
          <label className="block sm:w-44">
            <span className="text-sm font-semibold text-slate-700">Consent</span>
            <select name="consent" defaultValue={params.consent} className="input mt-1 h-12 text-base">
              <option value="">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <button type="submit" className="btn-primary h-12">
            Filter
          </button>
        </form>
        <a href={`/api/admin/export${qs(filterQs)}`} className="btn-secondary h-12" download>
          Export CSV
        </a>
      </div>

      <p className="text-sm text-slate-600">
        {total === 0 ? "No records" : `Showing ${from}–${to} of ${total}`}
        {(params.q || params.consent) && (
          <>
            {" · "}
            <Link href="/admin" className="font-medium text-teal-800 underline">
              Clear filter
            </Link>
          </>
        )}
      </p>

      {rows.length > 0 && (
        <>
          {/* Phones: cards */}
          <ul className="space-y-2 md:hidden">
            {rows.map((r) => (
              <li key={String(r._id)}>
                <Link
                  href={`/admin/submissions/${r._id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-3 active:bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-slate-900">{r.participantId}</span>
                    <ConsentBadge consent={r.consent} />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {[ageGender(r.answers?.age, r.answers?.gender), formatDateTime(r.receivedAt)].filter(Boolean).join(" · ")}
                  </p>
                  {duplicates.has(r.participantId) && <DuplicateBadge />}
                </Link>
              </li>
            ))}
          </ul>

          {/* Larger screens: table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
            <table className="w-full text-left text-[15px]">
              <thead className="border-b border-slate-200 bg-slate-50 text-sm text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Received</th>
                  <th className="px-4 py-3 font-semibold">Participant ID</th>
                  <th className="px-4 py-3 font-semibold">Age</th>
                  <th className="px-4 py-3 font-semibold">Gender</th>
                  <th className="px-4 py-3 font-semibold">Consent</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={String(r._id)} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDateTime(r.receivedAt)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {r.participantId}
                      {duplicates.has(r.participantId) && <DuplicateBadge />}
                    </td>
                    <td className="px-4 py-3">{r.answers?.age ?? "—"}</td>
                    <td className="px-4 py-3">{genderLabel(r.answers?.gender) ?? "—"}</td>
                    <td className="px-4 py-3">
                      <ConsentBadge consent={r.consent} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/submissions/${r._id}`} className="font-semibold text-teal-800 underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
          {page > 1 ? (
            <Link className="btn-secondary" href={`/admin${qs({ ...filterQs, page: page - 1 })}`}>
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-slate-600">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link className="btn-secondary" href={`/admin${qs({ ...filterQs, page: page + 1 })}`}>
              Older →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

function genderLabel(g: number | undefined) {
  return g === 1 ? "Male" : g === 2 ? "Female" : undefined;
}

function ageGender(age?: number, gender?: number) {
  return [typeof age === "number" ? `${age} y` : null, genderLabel(gender)].filter(Boolean).join(", ");
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="mt-1 text-3xl font-bold text-slate-900 tabular-nums">{value.toLocaleString("en-IN")}</dd>
    </div>
  );
}

function DuplicateBadge() {
  return (
    <span className="mt-1 ml-0 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 md:ml-2">
      Duplicate ID
    </span>
  );
}

function DbError({ configMissing }: { configMissing: boolean }) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
      <AlertIcon className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-semibold">Cannot reach the database</p>
        <p className="mt-1 text-[15px]">
          {configMissing
            ? "MONGODB_URI is not set in the server environment."
            : "Check the MONGODB_URI setting and that the database allows connections from this server, then reload."}
        </p>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mt-4 space-y-5" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-white" />
        ))}
      </div>
      <div className="h-20 animate-pulse rounded-2xl bg-white" />
      <div className="h-64 animate-pulse rounded-2xl bg-white" />
    </div>
  );
}
