import {
  ALL_QUESTIONS,
  DMFT_ROWS,
  MAX_TEETH,
  OTHER_TEXT_MAX,
  isVisible,
  type Answers,
  type Bilingual,
  type Question,
  type Step,
} from "./form-schema";

/** Errors keyed by question id. */
export type FieldErrors = Record<string, Bilingual>;

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

export function toBengaliDigits(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/** Converts Bengali digits (০-৯) to ASCII digits so either keyboard works. */
export function normalizeDigits(s: string): string {
  return s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}

export const MSG = {
  choose: { en: "Please select an answer", bn: "একটি উত্তর নির্বাচন করুন" },
  chooseMany: { en: "Select at least one answer", bn: "অন্তত একটি উত্তর নির্বাচন করুন" },
  number: { en: "Please enter a number", bn: "একটি সংখ্যা লিখুন" },
  required: { en: "This field is required", bn: "এই তথ্যটি আবশ্যক" },
  yearsAge: { en: "Cannot be more than the age", bn: "বয়সের চেয়ে বেশি হতে পারে না" },
  dmftMissing: { en: 'Enter the number of teeth for a, b and c, or choose "d. No"' },
  dmftTotal: { en: `Decayed + Missing + Filled cannot be more than ${MAX_TEETH} teeth` },
  exclusive: {
    en: '"No" cannot be combined with other answers',
    bn: '"না" অন্য উত্তরের সাথে একসাথে দেওয়া যাবে না',
  },
  invalid: { en: "Invalid answer", bn: "উত্তরটি সঠিক নয়" },
  range: (min: number, max: number): Bilingual => ({
    en: `Enter a number from ${min.toLocaleString("en-US")} to ${max.toLocaleString("en-US")}`,
    bn: `${toBengaliDigits(min)} থেকে ${toBengaliDigits(max)} এর মধ্যে লিখুন`,
  }),
  tooLong: (n: number): Bilingual => ({
    en: `Maximum ${n} characters`,
    bn: `সর্বোচ্চ ${toBengaliDigits(n)} অক্ষর`,
  }),
};

export function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** Validates one question against the current answers. Returns null when valid. */
export function checkQuestion(q: Question, a: Answers): Bilingual | null {
  switch (q.kind) {
    case "text": {
      const v = cleanText(a[q.field]);
      if (!v) return MSG.required;
      if (v.length > q.maxLength) return MSG.tooLong(q.maxLength);
      return null;
    }
    case "number": {
      const v = a[q.field];
      if (v === undefined || v === null) return MSG.number;
      if (!isInt(v) || v < q.min || v > q.max) return MSG.range(q.min, q.max);
      if (q.field === "yearsInArea" && isInt(a.age) && v > a.age) return MSG.yearsAge;
      return null;
    }
    case "single": {
      const v = q.field === "consent" ? toConsentValue(a.consent) : a[q.field];
      if (v === undefined || v === null) return MSG.choose;
      if (!q.options.some((o) => o.value === v)) return MSG.invalid;
      if (q.other && v === q.other.value) {
        const other = a[q.other.field];
        if (other !== undefined && typeof other !== "string") return MSG.invalid;
        if (cleanText(other).length > OTHER_TEXT_MAX) return MSG.tooLong(OTHER_TEXT_MAX);
      }
      return null;
    }
    case "multi": {
      const v = a[q.field];
      if (!Array.isArray(v) || v.length === 0) return MSG.chooseMany;
      const allowed = new Set(q.options.map((o) => o.value));
      if (!v.every((x) => isInt(x) && allowed.has(x))) return MSG.invalid;
      if (new Set(v).size !== v.length) return MSG.invalid;
      const exclusive = q.options.filter((o) => o.exclusive).map((o) => o.value);
      if (v.length > 1 && v.some((x) => exclusive.includes(x))) return MSG.exclusive;
      return null;
    }
    case "dmft": {
      const values = DMFT_ROWS.map((r) => a[r.field]);
      if (a.dmftNone !== undefined && typeof a.dmftNone !== "boolean") return MSG.invalid;
      if (a.dmftNone === true) {
        return values.every((v) => v === undefined || v === 0) ? null : MSG.invalid;
      }
      if (values.some((v) => v === undefined || v === null)) return MSG.dmftMissing;
      if (!values.every((v) => isInt(v) && v >= 0 && v <= MAX_TEETH)) {
        return MSG.range(0, MAX_TEETH);
      }
      const total = (values as number[]).reduce((s, v) => s + v, 0);
      if (total > MAX_TEETH) return MSG.dmftTotal;
      return null;
    }
  }
}

function toConsentValue(c: unknown): number | undefined {
  if (c === true) return 1;
  if (c === false) return 0;
  return undefined;
}

/** Validates every visible question of one wizard step. */
export function validateStep(step: Step, a: Answers): FieldErrors {
  const errors: FieldErrors = {};
  for (const q of step.questions) {
    if (!isVisible(q, a)) continue;
    const err = checkQuestion(q, a);
    if (err) errors[q.id] = err;
  }
  return errors;
}

export type CleanResult =
  | { ok: true; answers: Answers }
  | { ok: false; errors: FieldErrors };

/**
 * Validates a complete submission and returns a clean copy that only
 * contains known, visible fields. Used before queueing on the device and
 * again on the server before anything is written to the database.
 */
export function cleanSubmission(raw: unknown): CleanResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: { _form: MSG.invalid } };
  }
  const a = raw as Answers;
  if (typeof a.consent !== "boolean") {
    return { ok: false, errors: { consent: MSG.choose } };
  }

  const participantQ = ALL_QUESTIONS.find((q) => q.id === "participantId")!;
  const errors: FieldErrors = {};
  const pidErr = checkQuestion(participantQ, a);
  if (pidErr) errors.participantId = pidErr;

  if (!a.consent) {
    if (pidErr) return { ok: false, errors };
    return { ok: true, answers: { consent: false, participantId: cleanText(a.participantId) } };
  }

  const out: Answers = { consent: true };
  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => {
    out[k] = v;
  };

  for (const q of ALL_QUESTIONS) {
    if (!isVisible(q, a)) continue;
    const err = checkQuestion(q, a);
    if (err) {
      errors[q.id] = err;
      continue;
    }
    switch (q.kind) {
      case "text":
        set(q.field, cleanText(a[q.field]) as never);
        break;
      case "number":
        set(q.field, a[q.field] as never);
        break;
      case "single": {
        set(q.field, a[q.field] as never);
        if (q.other && a[q.field] === q.other.value) {
          const other = cleanText(a[q.other.field]);
          if (other) set(q.other.field, other as never);
        }
        break;
      }
      case "multi": {
        const order = q.options.map((o) => o.value);
        const picked = [...(a[q.field] as number[])].sort(
          (x, y) => order.indexOf(x) - order.indexOf(y),
        );
        set(q.field, picked as never);
        break;
      }
      case "dmft": {
        const none = a.dmftNone === true;
        for (const r of DMFT_ROWS) set(r.field, (none ? 0 : a[r.field]) as never);
        set("dmftNone", none);
        break;
      }
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, answers: out };
}
