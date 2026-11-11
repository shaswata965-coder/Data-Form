"use client";

import { SECTIONS, isVisible, type Answers } from "@/lib/form-schema";
import { displayAnswer, questionTitle } from "@/lib/format";
import { PencilIcon } from "../icons";
import { Bn } from "./fields";

/** Every answer on one screen; tapping a row jumps to that question. */
export function Review({ answers, onEdit }: { answers: Answers; onEdit: (screenId: string) => void }) {
  return (
    <div className="space-y-5">
      <p className="rounded-2xl bg-teal-50 p-4 text-[18px] text-teal-950">
        Check the answers. Tap any answer to change it.
        <Bn className="block">উত্তরগুলো যাচাই করুন। পরিবর্তন করতে উত্তরের উপর চাপুন।</Bn>
      </p>

      <section className="overflow-hidden rounded-2xl border-2 border-slate-200 bg-white">
        <Row
          title="Consent Taken"
          answer={{ en: answers.consent ? "Yes" : "No", bn: answers.consent ? "হ্যাঁ" : "না" }}
          onEdit={() => onEdit("consent")}
        />
      </section>

      {SECTIONS.map((section) => (
        <section key={section.id} className="overflow-hidden rounded-2xl border-2 border-slate-200 bg-white">
          <div className="border-b-2 border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-[14px] font-bold tracking-wide text-teal-800 uppercase">{section.part}</p>
            <h2 className="text-[20px] font-bold text-slate-900">{section.title.en}</h2>
          </div>
          <div className="divide-y-2 divide-slate-100">
            {section.questions
              .filter((q) => isVisible(q, answers))
              .map((q) => (
                <Row key={q.id} title={questionTitle(q)} answer={displayAnswer(q, answers)} onEdit={() => onEdit(q.id)} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Row({
  title,
  answer,
  onEdit,
}: {
  title: string;
  answer: { en: string; bn?: string } | null;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 focus-visible:bg-teal-50 focus-visible:outline-none active:bg-slate-100"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] leading-snug text-slate-600">{title}</span>
        {answer ? (
          <span className="mt-0.5 block text-[19px] leading-snug font-semibold text-slate-900">
            {answer.en}
            {answer.bn && <Bn className="block text-[18px] font-normal text-slate-700">{answer.bn}</Bn>}
          </span>
        ) : (
          <span className="mt-0.5 block text-[19px] font-semibold text-red-700">Not answered</span>
        )}
      </span>
      <PencilIcon className="h-6 w-6 shrink-0 text-teal-700" aria-hidden />
      <span className="sr-only">Edit</span>
    </button>
  );
}
