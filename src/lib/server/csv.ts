import "server-only";
import { ALL_QUESTIONS, DMFT_ROWS, optionLabel, type Answers, type Question } from "../form-schema";
import type { SubmissionDoc } from "./mongodb";

type Cell = string | number | null | undefined;
interface Column {
  header: string;
  value: (d: SubmissionDoc) => Cell;
}

const snake = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();

function prefix(q: Question): string {
  const clinical = ["dmft", "cpi", "plaque", "functional", "otherCondition", "saliva"].includes(q.id);
  if (!q.num) return "";
  return clinical ? `c${q.num}_` : `q${q.num}_`;
}

/** Hidden / not-applicable questions export as empty cells. */
const get = (d: SubmissionDoc, k: keyof Answers) => (d.answers ? d.answers[k] : undefined);

function questionColumns(q: Question): Column[] {
  const base = `${prefix(q)}${snake(q.id)}`;
  switch (q.kind) {
    case "text":
      return q.field === "participantId" ? [] : [{ header: base, value: (d) => get(d, q.field) as Cell }];
    case "number":
      return [{ header: base, value: (d) => get(d, q.field) as Cell }];
    case "single": {
      const cols: Column[] = [
        { header: q.scored ? `${base}_score` : base, value: (d) => get(d, q.field) as Cell },
        { header: `${base}_label`, value: (d) => optionLabel(q.options, get(d, q.field))?.en },
      ];
      if (q.other) {
        const f = q.other.field;
        cols.push({ header: `${base}_other_specify`, value: (d) => get(d, f) as Cell });
      }
      return cols;
    }
    case "multi": {
      const cols: Column[] = q.options.map((o) => ({
        header: `${base}_${o.value}_${snake(o.en)}`,
        value: (d) => {
          const v = get(d, q.field);
          return Array.isArray(v) ? (v.includes(o.value) ? 1 : 0) : "";
        },
      }));
      cols.push({
        header: `${base}_labels`,
        value: (d) => {
          const v = get(d, q.field);
          return Array.isArray(v) ? v.map((x) => optionLabel(q.options, x)?.en).join("; ") : "";
        },
      });
      return cols;
    }
    case "dmft":
      return [
        ...DMFT_ROWS.map((r) => ({
          header: `${base}_${r.letter}_${snake(r.en)}`,
          value: (d: SubmissionDoc) => get(d, r.field) as Cell,
        })),
        {
          header: `${base}_d_no`,
          value: (d) => {
            const v = get(d, "dmftNone");
            return typeof v === "boolean" ? (v ? 1 : 0) : "";
          },
        },
      ];
  }
}

export function buildColumns(formatDate: (d: Date | null) => string): Column[] {
  return [
    { header: "received_at", value: (d) => formatDate(d.receivedAt) },
    { header: "participant_id", value: (d) => d.participantId },
    { header: "consent", value: (d) => (d.consent ? "Yes" : "No") },
    ...ALL_QUESTIONS.flatMap(questionColumns),
    { header: "form_started_at", value: (d) => formatDate(d.startedAt) },
    { header: "form_completed_at", value: (d) => formatDate(d.clientCreatedAt) },
    { header: "record_id", value: (d) => String(d._id ?? "") },
  ];
}

function escapeCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  let s = String(v);
  // Prevent spreadsheet formula injection from free-text fields.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvHeader(cols: Column[]): string {
  return cols.map((c) => escapeCell(c.header)).join(",") + "\r\n";
}

export function csvRow(cols: Column[], d: SubmissionDoc): string {
  return cols.map((c) => escapeCell(c.value(d))).join(",") + "\r\n";
}
