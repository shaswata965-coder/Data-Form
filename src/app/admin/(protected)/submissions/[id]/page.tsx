import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { SECTIONS, isVisible } from "@/lib/form-schema";
import { displayAnswer, questionTitle } from "@/lib/format";
import { getAdmin } from "@/lib/server/auth";
import { duplicateIds, formatDateTime, getSubmission } from "@/lib/server/admin-data";
import { ConsentBadge } from "@/components/admin/ConsentBadge";
import { DeleteButton } from "@/components/admin/DeleteButton";

export default function SubmissionPage({ params }: PageProps<"/admin/submissions/[id]">) {
  return (
    <>
      <Link href="/admin" className="text-sm font-semibold text-teal-800 underline">
        ← All submissions
      </Link>
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-2xl bg-white" aria-busy="true" />}>
        <Detail params={params} />
      </Suspense>
    </>
  );
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdmin())) redirect("/admin/login");
  const { id } = await params;
  const doc = await getSubmission(id);
  if (!doc) notFound();
  const duplicate = (await duplicateIds([doc.participantId])).has(doc.participantId);
  const a = doc.answers ?? {};
  const minutes =
    doc.startedAt && doc.clientCreatedAt
      ? Math.max(0, Math.round((doc.clientCreatedAt.getTime() - doc.startedAt.getTime()) / 60000))
      : null;

  return (
    <div className="mt-3 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold break-all text-slate-900">{doc.participantId}</h1>
        <ConsentBadge consent={doc.consent} />
        {duplicate && (
          <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-semibold text-amber-900">
            Duplicate ID – another record uses this Participant ID
          </span>
        )}
      </div>

      <dl className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-[15px] sm:grid-cols-2">
        <Meta label="Received by server" value={formatDateTime(doc.receivedAt)} />
        <Meta label="Completed on device" value={formatDateTime(doc.clientCreatedAt)} />
        <Meta label="Started on device" value={formatDateTime(doc.startedAt)} />
        <Meta label="Time to fill" value={minutes === null ? "—" : `${minutes} min`} />
        <Meta label="Device" value={doc.userAgent ?? "—"} wide />
        <Meta label="Record id" value={`${doc._id} · ${doc.clientId}`} wide />
      </dl>

      {!doc.consent ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-4 text-[15px] text-slate-700">
          Consent was not given. Only the Participant ID was recorded.
        </p>
      ) : (
        SECTIONS.map((step) => (
          <section key={step.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <p className="text-xs font-semibold tracking-wide text-teal-800 uppercase">{step.part}</p>
              <h2 className="font-semibold text-slate-900">{step.title.en}</h2>
            </div>
            <dl className="divide-y divide-slate-100">
              {step.questions.map((q) => {
                const visible = isVisible(q, a);
                const ans = visible ? displayAnswer(q, a) : null;
                return (
                  <div key={q.id} className="grid gap-1 px-4 py-2.5 sm:grid-cols-2 sm:gap-4">
                    <dt className="text-sm text-slate-600">
                      {questionTitle(q)}
                      {q.bn && (
                        <span lang="bn" className="block">
                          {q.bn}
                        </span>
                      )}
                    </dt>
                    <dd className="text-[15px] font-medium text-slate-900">
                      {!visible ? (
                        <span className="font-normal text-slate-500">Not applicable</span>
                      ) : ans ? (
                        <>
                          {ans.en}
                          {ans.bn && (
                            <span lang="bn" className="block font-normal text-slate-600">
                              {ans.bn}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="font-normal text-slate-500">—</span>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))
      )}

      <DeleteButton id={String(doc._id)} participantId={doc.participantId} />
    </div>
  );
}

function Meta({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="font-medium break-words text-slate-900">{value}</dd>
    </div>
  );
}
