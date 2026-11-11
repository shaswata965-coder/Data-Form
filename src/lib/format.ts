import {
  DMFT_ROWS,
  optionLabel,
  type Answers,
  type Bilingual,
  type ChoiceOption,
  type Question,
} from "./form-schema";

export function formatNumber(n: number): string {
  // Bangladeshi digit grouping (1,25,000)
  return n.toLocaleString("en-IN");
}

function optionText(o: ChoiceOption, scored?: boolean): Bilingual {
  const prefix = o.letter ? `${o.letter}. ` : `${o.value}. `;
  const score = scored ? ` (Score ${o.value})` : "";
  return { en: `${prefix}${o.en}${score}`, bn: o.bn };
}

/** Human readable answer for the review screen and the admin detail page. */
export function displayAnswer(q: Question, a: Answers): Bilingual | null {
  switch (q.kind) {
    case "text": {
      const v = a[q.field];
      return typeof v === "string" && v ? { en: v } : null;
    }
    case "number": {
      const v = a[q.field];
      if (typeof v !== "number") return null;
      const text = q.money ? formatNumber(v) : String(v);
      return {
        en: q.unit ? `${text} ${q.unit.en}` : text,
        bn: q.unit?.bn ? `${text} ${q.unit.bn}` : undefined,
      };
    }
    case "single": {
      const o = optionLabel(q.options, a[q.field]);
      if (!o) return null;
      const t = optionText(o, q.scored);
      if (q.other && o.value === q.other.value) {
        const other = a[q.other.field];
        if (typeof other === "string" && other) t.en += ` – ${other}`;
      }
      return t;
    }
    case "multi": {
      const v = a[q.field];
      if (!Array.isArray(v) || v.length === 0) return null;
      const opts = v
        .map((x) => optionLabel(q.options, x))
        .filter((o): o is ChoiceOption => Boolean(o));
      return {
        en: opts.map((o) => `${o.value}. ${o.en}`).join("; "),
        bn: opts.every((o) => o.bn) ? opts.map((o) => o.bn).join("; ") : undefined,
      };
    }
    case "dmft": {
      if (a.dmftNone) return { en: "d. No (0)" };
      const parts = DMFT_ROWS.map((r) => {
        const v = a[r.field];
        return typeof v === "number" ? `${r.letter}. ${r.en}: ${v}` : null;
      });
      if (parts.every((p) => p === null)) return null;
      return { en: parts.filter(Boolean).join(" · ") };
    }
  }
}

export function questionTitle(q: Question): string {
  return q.num ? `${q.num}. ${q.en}` : q.en;
}
