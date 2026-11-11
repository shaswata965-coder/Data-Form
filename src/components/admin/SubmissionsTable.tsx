"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { CloseIcon, PrinterIcon, TrashIcon } from "../icons";
import { ConsentBadge } from "./ConsentBadge";
import { useSelection } from "./selection-store";

export interface TableRow {
  id: string;
  participantId: string;
  consent: boolean;
  age?: number;
  gender?: number;
  received: string;
  duplicate: boolean;
}

interface Props {
  rows: TableRow[];
  /** Records matching the current filter (all pages). */
  total: number;
  q: string;
  consent: string;
  maxBulk: number;
  /** Pagination, rendered below the list. */
  children?: ReactNode;
}

const QUICK = [10, 20, 30];

function genderLabel(g: number | undefined) {
  return g === 1 ? "Male" : g === 2 ? "Female" : undefined;
}

export function SubmissionsTable({ rows, total, q, consent, maxBulk, children }: Props) {
  const sel = useSelection(`${q}\u0000${consent}`);
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const printRef = useRef<HTMLDialogElement>(null);

  const count = sel.ids.length;
  const pageIds = rows.map((r) => r.id);
  const onPage = pageIds.filter((id) => sel.selected.has(id)).length;
  const allOnPage = rows.length > 0 && onPage === rows.length;
  const someOnPage = onPage > 0 && !allOnPage;
  const offPage = count - onPage;
  const allLimit = Math.min(total, maxBulk);

  async function selectFirst(key: string, limit: number) {
    setError(null);
    setNotice(null);
    setLoading(key);
    try {
      const sp = new URLSearchParams({ limit: String(limit) });
      if (q) sp.set("q", q);
      if (consent) sp.set("consent", consent);
      const res = await fetch(`/api/admin/submissions/ids?${sp}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(body?.ids)) throw new Error(body?.message ?? `Error ${res.status}`);
      sel.replace(body.ids);
    } catch (e) {
      setError(`Could not select records: ${e instanceof Error ? e.message : "network error"}`);
    } finally {
      setLoading(null);
    }
  }

  function togglePage() {
    setNotice(null);
    if (allOnPage) sel.remove(pageIds);
    else sel.add(pageIds);
  }

  async function deleteSelected() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/submissions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids: sel.ids }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? `Error ${res.status}`);
      sel.clear();
      deleteRef.current?.close();
      setNotice(`${body.deleted} record${body.deleted === 1 ? "" : "s"} deleted.`);
      router.refresh();
    } catch (e) {
      setError(`Delete failed: ${e instanceof Error ? e.message : "network error"}`);
      deleteRef.current?.close();
    } finally {
      setDeleting(false);
    }
  }

  const chip =
    "inline-flex h-10 items-center rounded-full border-2 border-slate-200 bg-white px-3.5 text-[15px] font-semibold text-slate-800 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 focus-visible:ring-4 focus-visible:ring-teal-200 focus-visible:outline-none";

  return (
    <>
      {total > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Select records">
          <span className="mr-1 text-sm font-semibold text-slate-700">Select:</span>
          {QUICK.map((n) => (
            <button
              key={n}
              type="button"
              className={chip}
              disabled={loading !== null}
              onClick={() => selectFirst(`first-${n}`, n)}
            >
              {loading === `first-${n}` ? "…" : `First ${n}`}
            </button>
          ))}
          <button
            type="button"
            className={chip}
            disabled={loading !== null || rows.length === 0}
            onClick={() => {
              setNotice(null);
              sel.replace(pageIds);
            }}
          >
            This page ({rows.length})
          </button>
          <button type="button" className={chip} disabled={loading !== null} onClick={() => selectFirst("all", allLimit)}>
            {loading === "all" ? "…" : total > maxBulk ? `All (first ${maxBulk.toLocaleString("en-IN")})` : `All (${total})`}
          </button>
          {count > 0 && (
            <button type="button" className={chip} onClick={sel.clear}>
              None
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-[15px] font-medium text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 text-[15px] font-medium text-emerald-900">
          {notice}
        </p>
      )}

      {rows.length > 0 && (
        <>
          {/* Phones: cards with a large checkbox area */}
          <ul className="space-y-2 md:hidden">
            {rows.map((r) => {
              const checked = sel.selected.has(r.id);
              return (
                <li
                  key={r.id}
                  className={`flex overflow-hidden rounded-xl border-2 bg-white ${
                    checked ? "border-teal-600 bg-teal-50/40" : "border-slate-200"
                  }`}
                >
                  <label className="flex w-14 shrink-0 cursor-pointer items-center justify-center border-r border-slate-100">
                    <input
                      type="checkbox"
                      className="h-6 w-6 accent-teal-700"
                      checked={checked}
                      onChange={() => sel.toggle(r.id)}
                      aria-label={`Select ${r.participantId}`}
                    />
                  </label>
                  <Link href={`/admin/submissions/${r.id}`} className="block min-w-0 flex-1 p-3 active:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-slate-900">{r.participantId}</span>
                      <ConsentBadge consent={r.consent} />
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {[
                        typeof r.age === "number" ? `${r.age} y` : null,
                        genderLabel(r.gender),
                        r.received,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {r.duplicate && <DuplicateBadge />}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Larger screens: table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
            <table className="w-full text-left text-[15px]">
              <thead className="border-b border-slate-200 bg-slate-50 text-sm text-slate-600">
                <tr>
                  <th className="w-12 py-3 pr-1 pl-4">
                    <input
                      type="checkbox"
                      className="h-5 w-5 cursor-pointer accent-teal-700"
                      checked={allOnPage}
                      ref={(el) => {
                        if (el) el.indeterminate = someOnPage;
                      }}
                      onChange={togglePage}
                      aria-label={allOnPage ? "Unselect all on this page" : "Select all on this page"}
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">Received</th>
                  <th className="px-4 py-3 font-semibold">Participant ID</th>
                  <th className="px-4 py-3 font-semibold">Age</th>
                  <th className="px-4 py-3 font-semibold">Gender</th>
                  <th className="px-4 py-3 font-semibold">Consent</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const checked = sel.selected.has(r.id);
                  return (
                    <tr key={r.id} className={checked ? "bg-teal-50/60" : "hover:bg-slate-50"}>
                      <td className="py-3 pr-1 pl-4">
                        <input
                          type="checkbox"
                          className="h-5 w-5 cursor-pointer accent-teal-700"
                          checked={checked}
                          onChange={() => sel.toggle(r.id)}
                          aria-label={`Select ${r.participantId}`}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{r.received}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {r.participantId}
                        {r.duplicate && <DuplicateBadge />}
                      </td>
                      <td className="px-4 py-3">{r.age ?? "—"}</td>
                      <td className="px-4 py-3">{genderLabel(r.gender) ?? "—"}</td>
                      <td className="px-4 py-3">
                        <ConsentBadge consent={r.consent} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/submissions/${r.id}`} className="font-semibold text-teal-800 underline">
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {children}

      {count > 0 && (
        <>
          {/* keeps the last rows and pagination clear of the action bar */}
          <div className="h-20" aria-hidden />
          <div
            role="region"
            aria-label="Bulk actions"
            className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_rgba(15,23,42,0.08)] backdrop-blur"
          >
            <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
              <p className="mr-auto min-w-0 text-[15px] leading-tight text-slate-900">
                <strong className="block sm:inline">{count.toLocaleString("en-IN")} selected</strong>
                {offPage > 0 && (
                  <span className="text-slate-500">
                    <span className="hidden sm:inline"> · </span>
                    {offPage} on other pages
                  </span>
                )}
              </p>
              <button type="button" className="btn-secondary h-11 px-3" onClick={sel.clear} aria-label="Clear selection">
                <CloseIcon className="h-5 w-5" />
                <span className="hidden sm:inline">Clear</span>
              </button>
              <button type="button" className="btn-secondary h-11 px-3" onClick={() => printRef.current?.showModal()}>
                <PrinterIcon className="h-5 w-5" />
                Print
              </button>
              <button type="button" className="btn-danger h-11 px-3" onClick={() => deleteRef.current?.showModal()}>
                <TrashIcon className="h-5 w-5" />
                Delete
              </button>
            </div>
          </div>
        </>
      )}

      <dialog ref={deleteRef} className="sheet" aria-labelledby="bulk-delete-title">
        <div className="p-5">
          <h2 id="bulk-delete-title" className="text-xl font-bold text-slate-900">
            Delete {count.toLocaleString("en-IN")} record{count === 1 ? "" : "s"}?
          </h2>
          <p className="mt-2 text-[15px] text-slate-700">
            The selected records are permanently removed from the database. This cannot be undone.
            {offPage > 0 && ` ${offPage} of them are on other pages.`}
          </p>
          <p className="mt-2 text-[15px] text-slate-700">Tip: use Export CSV first if you may need this data later.</p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary" onClick={() => deleteRef.current?.close()} disabled={deleting}>
              Cancel
            </button>
            <button type="button" className="btn-danger h-12" onClick={deleteSelected} disabled={deleting}>
              <TrashIcon className="h-5 w-5" />
              {deleting ? "Deleting…" : `Delete ${count.toLocaleString("en-IN")} record${count === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </dialog>

      <dialog ref={printRef} className="sheet" aria-labelledby="bulk-print-title">
        <div className="p-5">
          <h2 id="bulk-print-title" className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <PrinterIcon className="h-6 w-6" /> Print {count.toLocaleString("en-IN")} record{count === 1 ? "" : "s"}
          </h2>
          <p className="mt-2 text-[15px] text-slate-700">
            Printing is not available yet. This button is a placeholder – a print layout for the selected records will
            be added here.
          </p>
          <div className="mt-5 flex justify-end">
            <button type="button" className="btn-primary h-12" onClick={() => printRef.current?.close()}>
              OK
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function DuplicateBadge() {
  return (
    <span className="mt-1 ml-0 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 md:ml-2">
      Duplicate ID
    </span>
  );
}
