"use client";

import { useId, type ReactNode, type Ref } from "react";
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

export type Patch = (p: Partial<Answers>) => void;

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
    <p
      id={id}
      role="alert"
      className="mt-4 flex items-start gap-2.5 rounded-2xl bg-red-50 p-4 text-[18px] leading-snug font-semibold text-red-800"
    >
      <AlertIcon className="mt-0.5 h-6 w-6 shrink-0" />
      <span>
        {error.en}
        {error.bn && <Bn className="block font-medium">{error.bn}</Bn>}
      </span>
    </p>
  );
}

/** The big title of the one question shown on screen. */
export function QuestionHeading({
  q,
  id,
  headingRef,
}: {
  q: Question;
  id: string;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <div>
      <h1
        id={id}
        ref={headingRef}
        tabIndex={-1}
        className="text-[26px] leading-[1.25] font-bold text-slate-900 outline-none sm:text-[30px]"
      >
        {q.num && (
          <span className="mr-2.5 inline-flex h-9 min-w-9 items-center justify-center rounded-xl bg-teal-700 px-2 align-[3px] text-[20px] font-bold text-white">
            {q.num}
          </span>
        )}
        {q.en}
        {q.bn && <Bn className="mt-1.5 block text-[23px] leading-snug font-semibold text-slate-700">{q.bn}</Bn>}
      </h1>
      {q.note && (
        <p className="mt-2 text-[18px] font-medium text-teal-800">
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
      {q.prompt && <p className="mt-2 text-[19px] text-slate-700 italic">“{q.prompt}”</p>}
    </div>
  );
}

function Indicator({ type, checked }: { type: "radio" | "checkbox"; checked: boolean }) {
  if (type === "radio") {
    return (
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[3px] ${
          checked ? "border-teal-700" : "border-slate-400"
        }`}
      >
        {checked && <span className="h-4 w-4 rounded-full bg-teal-700" />}
      </span>
    );
  }
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-[3px] ${
        checked ? "border-teal-700 bg-teal-700 text-white" : "border-slate-400"
      }`}
    >
      {checked && <CheckIcon className="h-5 w-5" strokeWidth={3.5} />}
    </span>
  );
}

const cardBase =
  "flex cursor-pointer rounded-2xl border-[3px] transition-colors select-none has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-teal-300";
const cardOn = "border-teal-700 bg-teal-50 shadow-sm";
const cardOff = "border-slate-200 bg-white hover:border-slate-300 active:bg-slate-100";

function OptionCard({
  type,
  name,
  option,
  checked,
  scored,
  onChange,
  onClick,
}: {
  type: "radio" | "checkbox";
  name: string;
  option: ChoiceOption;
  checked: boolean;
  scored?: boolean;
  onChange: () => void;
  onClick?: () => void;
}) {
  return (
    <label className={`${cardBase} min-h-[76px] items-center gap-4 px-4 py-3.5 ${checked ? cardOn : cardOff}`}>
      <input type={type} name={name} className="sr-only" checked={checked} onChange={onChange} onClick={onClick} />
      <Indicator type={type} checked={checked} />
      <span className="min-w-0 flex-1">
        <span className="block text-[20px] leading-snug font-semibold text-slate-900">
          {option.letter && <span className="mr-1.5 text-slate-500">{option.letter}.</span>}
          {option.en}
        </span>
        {option.bn && <Bn className="mt-0.5 block text-[19px] leading-snug text-slate-700">{option.bn}</Bn>}
      </span>
      {scored ? (
        <span
          className={`shrink-0 rounded-xl px-3 py-1.5 text-[16px] font-bold whitespace-nowrap ${
            checked ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700"
          }`}
        >
          Score {option.value}
        </span>
      ) : (
        <span className="shrink-0 text-[17px] font-bold text-slate-400">{option.value}</span>
      )}
    </label>
  );
}

/** Large tile used for short two-option questions (Yes / No, Male / Female). */
function OptionTile({
  name,
  option,
  checked,
  onChange,
  onClick,
}: {
  name: string;
  option: { en: string; bn?: string };
  checked: boolean;
  onChange: () => void;
  onClick?: () => void;
}) {
  return (
    <label
      className={`${cardBase} relative min-h-36 flex-col items-center justify-center gap-1 p-4 text-center ${
        checked ? cardOn : cardOff
      }`}
    >
      <input type="radio" name={name} className="sr-only" checked={checked} onChange={onChange} onClick={onClick} />
      {checked && (
        <span className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-white">
          <CheckIcon className="h-5 w-5" strokeWidth={3.5} />
        </span>
      )}
      <span className="text-[30px] leading-tight font-bold text-slate-900">{option.en}</span>
      {option.bn && <Bn className="text-[26px] leading-tight font-semibold text-slate-700">{option.bn}</Bn>}
    </label>
  );
}

export function ConsentChoice({
  value,
  labelledBy,
  onChange,
  onPicked,
}: {
  value: boolean | undefined;
  labelledBy: string;
  onChange: (v: boolean) => void;
  onPicked: () => void;
}) {
  const name = useId();
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-2 gap-3">
      {[
        { v: true, en: "Yes", bn: "হ্যাঁ" },
        { v: false, en: "No", bn: "না" },
      ].map((o) => (
        <OptionTile
          key={o.en}
          name={name}
          option={o}
          checked={value === o.v}
          onChange={() => onChange(o.v)}
          onClick={onPicked}
        />
      ))}
    </div>
  );
}

export function ChoiceList({
  q,
  answers,
  patch,
  labelledBy,
  onPicked,
}: {
  q: SingleQuestion;
  answers: Answers;
  patch: Patch;
  labelledBy: string;
  /** Called when an option is tapped (used to move on automatically). */
  onPicked: (value: number) => void;
}) {
  const name = useId();
  const value = answers[q.field];
  const otherField = q.other?.field;
  const otherValue = otherField ? answers[otherField] : undefined;
  const showOther = q.other && value === q.other.value;

  return (
    <>
      <div
        role="radiogroup"
        aria-labelledby={labelledBy}
        className={q.inline ? "grid grid-cols-2 gap-3" : "grid gap-3"}
      >
        {q.options.map((o) =>
          q.inline ? (
            <OptionTile
              key={o.value}
              name={name}
              option={o}
              checked={value === o.value}
              onChange={() => patch({ [q.field]: o.value } as Partial<Answers>)}
              onClick={() => onPicked(o.value)}
            />
          ) : (
            <OptionCard
              key={o.value}
              type="radio"
              name={name}
              option={o}
              checked={value === o.value}
              scored={q.scored}
              onChange={() => patch({ [q.field]: o.value } as Partial<Answers>)}
              onClick={() => onPicked(o.value)}
            />
          ),
        )}
      </div>
      {showOther && otherField && (
        <label className="mt-5 block">
          <span className="text-[18px] font-semibold text-slate-800">
            Please specify (optional) · <Bn>উল্লেখ করুন (ঐচ্ছিক)</Bn>
          </span>
          <input
            type="text"
            className="input-lg mt-2"
            maxLength={OTHER_TEXT_MAX}
            value={typeof otherValue === "string" ? otherValue : ""}
            onChange={(e) => patch({ [otherField]: e.target.value } as Partial<Answers>)}
            enterKeyHint="next"
          />
        </label>
      )}
    </>
  );
}

export function MultiList({
  q,
  answers,
  patch,
  labelledBy,
}: {
  q: MultiQuestion;
  answers: Answers;
  patch: Patch;
  labelledBy: string;
}) {
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
    <div role="group" aria-labelledby={labelledBy} className="grid gap-3">
      {q.options.map((o) => (
        <OptionCard
          key={o.value}
          type="checkbox"
          name={name}
          option={o}
          checked={selected.includes(o.value)}
          onChange={() => toggle(o)}
        />
      ))}
    </div>
  );
}

function parseDigits(raw: string, maxLen: number): number | undefined {
  const digits = normalizeDigits(raw).replace(/\D/g, "").slice(0, maxLen);
  return digits === "" ? undefined : Number(digits);
}

export function NumberInput({
  q,
  answers,
  patch,
  labelledBy,
  invalid,
  onEnter,
}: {
  q: NumberQuestion;
  answers: Answers;
  patch: Patch;
  labelledBy: string;
  invalid: boolean;
  onEnter: () => void;
}) {
  const value = answers[q.field];
  const num = typeof value === "number" ? value : undefined;
  return (
    <div>
      <div className="flex items-stretch">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          enterKeyHint="next"
          autoFocus
          aria-labelledby={labelledBy}
          aria-invalid={invalid}
          placeholder={q.placeholder ?? "0"}
          className={`input-lg min-w-0 flex-1 text-[34px] font-bold tabular-nums ${q.unit ? "rounded-r-none border-r-0" : ""}`}
          value={num ?? ""}
          onChange={(e) =>
            patch({ [q.field]: parseDigits(e.target.value, String(q.max).length) } as Partial<Answers>)
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter();
            }
          }}
        />
        {q.unit && (
          <span className="flex shrink-0 flex-col items-center justify-center rounded-r-2xl border-[3px] border-l-0 border-slate-200 bg-slate-100 px-4 text-center text-[19px] leading-tight font-semibold text-slate-700">
            {q.unit.en}
            {q.unit.bn && <Bn>{q.unit.bn}</Bn>}
          </span>
        )}
      </div>
      {q.money && num !== undefined && num >= 1000 && (
        <p className="mt-3 text-[22px] font-semibold text-slate-700">৳ {formatNumber(num)}</p>
      )}
    </div>
  );
}

export function TextInput({
  q,
  answers,
  patch,
  labelledBy,
  invalid,
  onEnter,
}: {
  q: TextQuestion;
  answers: Answers;
  patch: Patch;
  labelledBy: string;
  invalid: boolean;
  onEnter: () => void;
}) {
  const value = answers[q.field];
  return (
    <input
      type="text"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="characters"
      spellCheck={false}
      enterKeyHint="next"
      autoFocus
      aria-labelledby={labelledBy}
      aria-invalid={invalid}
      maxLength={q.maxLength}
      placeholder={q.placeholder}
      className="input-lg text-[28px] font-bold"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => patch({ [q.field]: e.target.value } as Partial<Answers>)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEnter();
        }
      }}
    />
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
  const btn =
    "flex h-16 w-20 shrink-0 items-center justify-center rounded-2xl border-[3px] border-slate-200 bg-slate-100 text-slate-800 active:bg-slate-300 focus-visible:ring-4 focus-visible:ring-teal-300 focus-visible:outline-none";
  return (
    <div className="rounded-2xl border-[3px] border-slate-200 bg-white p-4">
      <label htmlFor={id} className="block text-[20px] leading-snug font-semibold text-slate-900">
        <span className="mr-1.5 text-slate-500">{letter}.</span>
        {label}
      </label>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={dec} aria-label={`Decrease ${label}`} className={btn}>
          <MinusIcon className="h-8 w-8" strokeWidth={3} />
        </button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          placeholder="–"
          className="h-16 min-w-0 flex-1 rounded-2xl border-[3px] border-slate-200 text-center text-[34px] font-bold text-slate-900 tabular-nums focus:border-teal-600 focus:ring-4 focus:ring-teal-100 focus:outline-none"
          value={value ?? ""}
          onChange={(e) => onChange(parseDigits(e.target.value, 2))}
        />
        <button type="button" onClick={inc} aria-label={`Increase ${label}`} className={btn}>
          <PlusIcon className="h-8 w-8" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}

export function DmftInput({
  answers,
  patch,
  labelledBy,
}: {
  answers: Answers;
  patch: Patch;
  labelledBy: string;
}) {
  const name = useId();
  const none = answers.dmftNone === true;
  return (
    <div role="group" aria-labelledby={labelledBy} className="space-y-3">
      {DMFT_ROWS.map((r) => (
        <Stepper
          key={r.field}
          letter={r.letter}
          label={r.en}
          value={answers[r.field] as number | undefined}
          onChange={(v) => patch({ [r.field]: v, dmftNone: false } as Partial<Answers>)}
        />
      ))}
      <div className="flex items-center gap-3 py-1 text-[16px] font-bold tracking-wide text-slate-500 uppercase">
        <span className="h-0.5 flex-1 bg-slate-200" />
        or
        <span className="h-0.5 flex-1 bg-slate-200" />
      </div>
      <OptionCard
        type="checkbox"
        name={name}
        option={{ value: 0, letter: "d", en: "No" }}
        checked={none}
        scored
        onChange={() =>
          patch(none ? { dmftNone: false } : { dmftNone: true, dmftDecayed: 0, dmftMissing: 0, dmftFilled: 0 })
        }
      />
    </div>
  );
}
