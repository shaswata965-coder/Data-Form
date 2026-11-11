import type { Answers } from "../form-schema";
import { readJSON, removeKey, writeJSON } from "./storage";

/** The form being filled right now, autosaved on every change. */
export interface Draft {
  v: 1;
  clientId: string;
  answers: Answers;
  stepIndex: number;
  startedAt: string;
  updatedAt: string;
  /** Steps the collector has already moved past (for the progress bar). */
  maxStep: number;
}

const KEY = "ohsi:draft:v1";

export function loadDraft(): Draft | null {
  const d = readJSON<Draft>(KEY);
  if (!d || d.v !== 1 || typeof d.clientId !== "string" || typeof d.answers !== "object") {
    return null;
  }
  return d;
}

export function saveDraft(d: Draft): boolean {
  return writeJSON(KEY, d);
}

export function clearDraft() {
  removeKey(KEY);
}

export function hasContent(a: Answers): boolean {
  return Object.values(a).some(
    (v) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0),
  );
}
