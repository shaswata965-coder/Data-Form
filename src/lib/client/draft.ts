import type { Answers } from "../form-schema";
import { readJSON, removeKey, writeJSON } from "./storage";

/** The form being filled right now, autosaved on every change. */
export interface Draft {
  v: 2;
  clientId: string;
  answers: Answers;
  /** Screen currently shown: "consent", a question id, or "review". */
  screenId: string;
  /** The collector has reached the review screen at least once. */
  reviewed: boolean;
  startedAt: string;
  updatedAt: string;
}

const KEY = "ohsi:draft:v1";

export function loadDraft(): Draft | null {
  const d = readJSON<Record<string, unknown>>(KEY);
  if (!d || typeof d.clientId !== "string" || !d.answers || typeof d.answers !== "object") return null;
  if (d.v === 2 && typeof d.screenId === "string") return d as unknown as Draft;
  if (d.v === 1) {
    // Drafts saved by the earlier multi-question layout: keep the answers, restart at the first screen.
    return {
      v: 2,
      clientId: d.clientId,
      answers: d.answers as Answers,
      screenId: "consent",
      reviewed: false,
      startedAt: typeof d.startedAt === "string" ? d.startedAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  return null;
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
