"use client";

import { useId, type ReactNode } from "react";
import {
  DMFT_ROWS,
  MAX_TEETH,
  OTHER_TEXT_MAX,
  type Answers,
  type Bilingual,
  type ChoiceOption,
  type MultiQuestion,
  type NumberQuestion,
  type Question,
  type SingleQuestion,
  type TextQuestion,
} from "@/lib/form-schema";
import { formatNumber } from "@/lib/format";
import { normalizeDigits } from "@/lib/validation";
import { AlertIcon, CheckIcon, MinusIcon, PlusIcon } from "../icons";

export type Patch = (p: Partial<Answers>, opts?: { answeredId?: string }) => void;

export function Bn({ children, className = "" }: { children?: ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <span lang="bn" className={`font-bn ${className}`}>
      {children}
    </span>
  );
}

export function ErrorText({ id, error }: { id: string; error?: Bilingual | null }) {
  if (!error) return null;
  return (
    <p id={id} role="alert" className="mt-3 flex items-start gap-2 text-[15px] font-medium text-red-700">
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        {error.en}
        {error.bn && (
          <>
            {" · "}
            <Bn>{error.bn}</Bn>
          </>
        )}
      </span>
    </p>
  );
}

export function QuestionCard({
  q,
  error,
  children,
  titleId,
  extra,
}: {
  q: Question;
  error?: Bilingual | null;
  children: ReactNode;
  titleId: string;
  extra?: ReactNode;
}) {
  return (
    <section
      id={`q-${q.id}`}
      data-question={q.id}
      className={`scroll-mt-32 rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${
        error ? "border-red-300 ring-2 ring-red-100" : "border-slate-200"
      }`}
    >
      <h2 id={titleId} className="text-[17px] leading-snug font-semibold text-slate-900">
        {q.num && (
          <span className="mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-teal-700 px-1.5 align-[1px] text-[13px] font-bold text-white">
            {q.num}
          </span>
        )}
        {q.en}
        {q.bn && <Bn className="mt-0.5 block text-base font-medium text-slate-700">{q.bn}</Bn>}
      </h2>
      {q.note && (
        <p className="mt-1 text-sm text-teal-800">
          ({q.note.en}
          {q.note.bn && (
            <>
              {" · "}
              <Bn>{q.note.bn}</Bn>
            </>
          )}
          )
        </p>
      )}
      {q.prompt && <p className="mt-1 text-[15px] text-slate-600 italic">{q.prompt}</p>}
      {extra}
      <div className="mt-3">{children}</div>
      <ErrorText id={`${titleId}-err`} error={error} />
    </section>
  );
}

function Indicator({ type, checked }: { type: "radio" | "checkbox"; checked: boolean }) {
  if (type === "radio") {
    return (
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
          checked ? "border-teal-700" : "border-slate-400"
        }`}
      >
        {checked && <span className="h-3 w-3 rounded-full bg-teal-700" />}
      </span>
    );
  }
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
        checked ? "border-teal-700 bg-teal-700 text-white" : "border-slate-400"
      }`}
    >
      {checked && <CheckIcon className="h-4 w-4" strokeWidth={3} />}
    </span>
  );
}

function OptionCard({
  type,
  name,
  option,
  checked,
  scored,
  compact,
  onSelect,
  describedBy,
}: {
  type: "radio" | "checkbox";
  name: string;
  option: ChoiceOption;
  checked: boolean;
  scored?: boolean;
  compact?: boolean;
  onSelect: () => void;
  describedBy?: string;
}) {
  return (
    <label
      className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-3.5 py-2.5 transition-colors select-none has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-teal-200 ${
        checked
          ? "border-teal-700 bg-teal-50"
          : "border-slate-200 bg-white hover:border-slate-300 active:bg-slate-50"
      } ${compact ? "justify-center" : ""}`}
    >
      <input
        type={type}
        name={name}
        className="sr-only"
        checked={checked}
        onChange={onSelect}
        aria-describedby={describedBy}
      />
      <Indicator type={type} checked={checked} />
      <span className={`min-w-0 ${compact ? "" : "flex-1"}`}>
        <span className="block text-[16px] leading-snug font-medium text-slate-900">
          {option.letter && <span className="mr-1 text-slate-500">{option.letter}.</span>}
          {option.en}
        </span>
        {option.bn && <Bn className="block text-[15px] leading-snug text-slate-600">{option.bn}</Bn>}
      </span>
      {scored ? (
        <span
          className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold whitespace-nowrap ${
            checked ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700"
          }`}
        >
          Score {option.value}
        </span>
      ) : (
        !compact && <span className="shrink-0 text-xs font-semibold text-slate-400">{option.value}</span>
      )}
    </label>
  );
}

export function SingleChoice({
  q,
  answers,
  error,
  patch,
}: {
  q: SingleQuestion;
  answers: Answers;
  error?: Bilingual | null;
  patch: Patch;
}) {
  const titleId = useId();
  const name = useId();
  const value = answers[q.field];
  const otherField = q.other?.field;
  const otherValue = otherField ? answers[otherField] : undefined;
  const showOther = q.other && value === q.other.value;

  return (
    <QuestionCard q={q} error={error} titleId={titleId}>
      <div
        role="radiogroup"
        aria-labelledby={titleId}
        aria-invalid={Boolean(error)}
        className={q.inline ? "grid grid-cols-2 gap-2.5" : "grid gap-2.5"}
      >
        {q.options.map((o) => (
          <OptionCard
            key={o.value}
            type="radio"
            name={name}
            option={o}
            checked={value === o.value}
            scored={q.scored}
            compact={q.inline}
            describedBy={error ? `${titleId}-err` : undefined}
            onSelect={() =>
              patch(
                { [q.field]: o.value } as Partial<Answers>,
                { answeredId: q.other && o.value === q.other.value ? undefined : q.id },
              )
            }
          />
        ))}
      </div>
      {showOther && otherField && (
        <label className="mt-3 block">
          <span className="text-sm font-medium text-slate-700">
            Please specify (optional) · <Bn>উল্লেখ করুন (ঐচ্ছিক)</Bn>
          </span>
          <input
            type="text"
            className="input mt-1"
            maxLength={OTHER_TEXT_MAX}
            value={typeof otherValue === "string" ? otherValue : ""}
            onChange={(e) => patch({ [otherField]: e.target.value } as Partial<Answers>)}
            enterKeyHint="done"
          />
        </label>
      )}
    </QuestionCard>
  );
}

export function MultiChoice({
  q,
  answers,
  error,
  patch,
}: {
  q: MultiQuestion;
  answers: Answers;
  error?: Bilingual | null;
  patch: Patch;
}) {
  const titleId = useId();
  const name = useId();
  const raw = answers[q.field];
  const selected = Array.isArray(raw) ? (raw as number[]) : [];

  const toggle = (o: ChoiceOption) => {
    let next: number[];
    if (selected.includes(o.value)) {
      next = selected.filter((v) => v !== o.value);
    } else if (o.exclusive) {
      next = [o.value];
    } else {
      const exclusive = q.options.filter((x) => x.exclusive).map((x) => x.value);
      next = [...selected.filter((v) => !exclusive.includes(v)), o.value];
    }
    patch({ [q.field]: next } as Partial<Answers>);
  };

  return (
    <QuestionCard q={q} error={error} titleId={titleId}>
      <div role="group" aria-labelledby={titleId} className="grid gap-2.5">
        {q.options.map((o) => (
          <OptionCard
            key={o.value}
            type="checkbox"
            name={name}
            option={o}
            checked={selected.includes(o.value)}
            describedBy={error ? `${titleId}-err` : undefined}
            onSelect={() => toggle(o)}
          />
        ))}
      </div>
    </QuestionCard>
  );
}

function parseDigits(raw: string, maxLen: number): number | undefined {
  const digits = normalizeDigits(raw).replace(/\D/g, "").slice(0, maxLen);
  return digits === "" ? undefined : Number(digits);
}

export function NumberField({
  q,
  answers,
  error,
  patch,
  onEnter,
}: {
  q: NumberQuestion;
  answers: Answers;
  error?: Bilingual | null;
  patch: Patch;
  onEnter?: () => void;
}) {
  const titleId = useId();
  const value = answers[q.field];
  const num = typeof value === "number" ? value : undefined;
  return (
    <QuestionCard q={q} error={error} titleId={titleId}>
      <div className="flex items-stretch">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          enterKeyHint="next"
          aria-labelledby={titleId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${titleId}-err` : undefined}
          placeholder={q.placeholder ?? "0"}
          className={`input ${q.unit ? "rounded-r-none border-r-0" : ""} ${q.money ? "" : "max-w-40"}`}
          value={num ?? ""}
          onChange={(e) =>
            patch({ [q.field]: parseDigits(e.target.value, String(q.max).length) } as Partial<Answers>)
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
              onEnter?.();
            }
          }}
        />
        {q.unit && (
          <span className="flex items-center rounded-r-xl border-2 border-l-0 border-slate-200 bg-slate-50 px-3.5 text-[15px] font-medium whitespace-nowrap text-slate-600">
            {q.unit.en}
            {q.unit.bn && (
              <>
                &nbsp;·&nbsp;<Bn>{q.unit.bn}</Bn>
              </>
            )}
          </span>
        )}
      </div>
      {q.money && num !== undefined && num >= 1000 && (
        <p className="mt-2 text-[15px] font-medium text-slate-600">৳ {formatNumber(num)}</p>
      )}
    </QuestionCard>
  );
}

export function TextField({
  q,
  answers,
  error,
  patch,
  warning,
  onEnter,
}: {
  q: TextQuestion;
  answers: Answers;
  error?: Bilingual | null;
  patch: Patch;
  warning?: ReactNode;
  onEnter?: () => void;
}) {
  const titleId = useId();
  const value = answers[q.field];
  return (
    <QuestionCard q={q} error={error} titleId={titleId}>
      <input
        type="text"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="next"
        aria-labelledby={titleId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${titleId}-err` : undefined}
        maxLength={q.maxLength}
        placeholder={q.placeholder}
        className="input"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => patch({ [q.field]: e.target.value } as Partial<Answers>)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
            onEnter?.();
          }
        }}
      />
      {warning}
    </QuestionCard>
  );
}

function Stepper({
  label,
  letter,
  value,
  onChange,
}: {
  label: string;
  letter: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  const id = useId();
  const dec = () => onChange(Math.max(0, (value ?? 1) - 1));
  const inc = () => onChange(Math.min(MAX_TEETH, (value ?? 0) + 1));
  return (
    <div className="flex items-center gap-3 py-2.5">
      <label htmlFor={id} className="min-w-0 flex-1 text-[16px] leading-snug font-medium text-slate-900">
        <span className="mr-1 text-slate-500">{letter}.</span>
        {label}
      </label>
      <div className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={dec}
          aria-label={`Decrease ${label}`}
          className="flex h-12 w-12 items-center justify-center rounded-l-xl border-2 border-slate-200 bg-slate-50 text-slate-700 active:bg-slate-200"
        >
          <MinusIcon className="h-5 w-5" />
        </button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          placeholder="–"
          className="h-12 w-14 border-y-2 border-slate-200 text-center text-lg font-semibold text-slate-900 focus:border-teal-600 focus:outline-none"
          value={value ?? ""}
          onChange={(e) => onChange(parseDigits(e.target.value, 2))}
        />
        <button
          type="button"
          onClick={inc}
          aria-label={`Increase ${label}`}
          className="flex h-12 w-12 items-center justify-center rounded-r-xl border-2 border-slate-200 bg-slate-50 text-slate-700 active:bg-slate-200"
        >
          <PlusIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export function DmftField({
  q,
  answers,
  error,
  patch,
}: {
  q: Question;
  answers: Answers;
  error?: Bilingual | null;
  patch: Patch;
}) {
  const titleId = useId();
  const none = answers.dmftNone === true;
  return (
    <QuestionCard q={q} error={error} titleId={titleId}>
      <div role="group" aria-labelledby={titleId}>
        <div className="divide-y divide-slate-100">
          {DMFT_ROWS.map((r) => (
            <Stepper
              key={r.field}
              letter={r.letter}
              label={r.en}
              value={answers[r.field] as number | undefined}
              onChange={(v) => patch({ [r.field]: v, dmftNone: false } as Partial<Answers>)}
            />
          ))}
        </div>
        <div className="my-2 flex items-center gap-3 text-xs font-semibold tracking-wide text-slate-400 uppercase">
          <span className="h-px flex-1 bg-slate-200" />
          or
          <span className="h-px flex-1 bg-slate-200" />
        </div>
        <OptionCard
          type="checkbox"
          name={`${titleId}-none`}
          option={{ value: 0, letter: "d", en: "No" }}
          checked={none}
          scored
          onSelect={() =>
            patch(
              none
                ? { dmftNone: false }
                : { dmftNone: true, dmftDecayed: 0, dmftMissing: 0, dmftFilled: 0 },
              { answeredId: none ? undefined : q.id },
            )
          }
        />
      </div>
    </QuestionCard>
  );
}
