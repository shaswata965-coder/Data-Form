"use client";

import { STEPS, isVisible, type Answers } from "@/lib/form-schema";
import { displayAnswer, questionTitle } from "@/lib/format";
import type { FieldErrors } from "@/lib/validation";
import { PencilIcon } from "../icons";
import { Bn } from "./fields";

export function Review({
  answers,
  errors,
  onEdit,
}: {
  answers: Answers;
  errors: FieldErrors;
  onEdit: (stepIndex: number) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-teal-50 p-3 text-[15px] text-teal-900">
        Check the answers below. Tap <strong>Edit</strong> to change a section.
        <Bn className="block">উত্তরগুলো যাচাই করুন। পরিবর্তন করতে Edit চাপুন।</Bn>
      </p>
      {STEPS.map((step, index) => {
        if (step.id === "review" || step.id === "consent") return null;
        const qs = step.questions.filter((q) => isVisible(q, answers));
        return (
          <section key={step.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-wide text-teal-800 uppercase">{step.part}</p>
                <h2 className="font-semibold text-slate-900">{step.title.en}</h2>
              </div>
              <button
                type="button"
                onClick={() => onEdit(index)}
                className="btn-secondary h-10 shrink-0 px-3 text-sm"
              >
                <PencilIcon className="h-4 w-4" /> Edit
              </button>
            </div>
            <dl className="divide-y divide-slate-100">
              {qs.map((q) => {
                const ans = displayAnswer(q, answers);
                const err = errors[q.id];
                return (
                  <div key={q.id} className="px-4 py-2.5">
                    <dt className="text-sm text-slate-600">{questionTitle(q)}</dt>
                    <dd className={`text-[16px] font-medium ${ans ? "text-slate-900" : "text-red-700"}`}>
                      {ans ? (
                        <>
                          {ans.en}
                          {ans.bn && <Bn className="block text-[15px] font-normal text-slate-600">{ans.bn}</Bn>}
                        </>
                      ) : (
                        err?.en ?? "Not answered"
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
