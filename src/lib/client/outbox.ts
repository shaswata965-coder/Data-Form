/**
 * Durable upload queue ("outbox").
 *
 * A finished form is written to IndexedDB *before* any network request is
 * made, and only removed after the server confirms it. Uploads are retried
 * automatically (on reconnect, on an interval, via Background Sync in the
 * service worker). Each submission carries a client-generated id, so the
 * server stores it exactly once no matter how many times it is retried.
 *
 * public/sw.js uses the same database / store / lock names – keep in sync.
 */
import type { Answers } from "../form-schema";
import { readJSON, writeJSON } from "./storage";

export const OUTBOX_DB = "ohsi-data-form";
export const OUTBOX_STORE = "outbox";
export const OUTBOX_LOCK = "ohsi-outbox-flush";
export const OUTBOX_SYNC_TAG = "ohsi-outbox";
export const SUBMIT_URL = "/api/submissions";

export interface SubmissionPayload {
  clientId: string;
  clientCreatedAt: string;
  startedAt?: string;
  schemaVersion: number;
  answers: Answers;
}

export interface OutboxItem {
  clientId: string;
  payload: SubmissionPayload;
  participantId: string;
  consent: boolean;
  createdAt: string;
  status: "pending" | "rejected";
  attempts: number;
  lastError?: string;
  lastAttemptAt?: string;
}

/* ---------------------------- storage --------------------------------- */

const LS_KEY = "ohsi:outbox:v1"; // fallback when IndexedDB is unavailable

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
      const req = indexedDB.open(OUTBOX_DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(OUTBOX_STORE)) {
          req.result.createObjectStore(OUTBOX_STORE, { keyPath: "clientId" });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("IndexedDB blocked"));
    }).catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest | void) {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(OUTBOX_STORE, mode);
        const req = run(tx.objectStore(OUTBOX_STORE));
        tx.oncomplete = () => resolve((req ? req.result : undefined) as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

const lsAll = () => readJSON<Record<string, OutboxItem>>(LS_KEY) ?? {};

export async function getOutbox(): Promise<OutboxItem[]> {
  const merged = new Map<string, OutboxItem>();
  try {
    const items = await idb<OutboxItem[]>("readonly", (s) => s.getAll());
    for (const i of items) merged.set(i.clientId, i);
  } catch {
    /* fall back to localStorage only */
  }
  for (const i of Object.values(lsAll())) if (!merged.has(i.clientId)) merged.set(i.clientId, i);
  return [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function putItem(item: OutboxItem): Promise<void> {
  try {
    await idb("readwrite", (s) => s.put(item));
    return;
  } catch {
    /* fall through to localStorage */
  }
  const all = lsAll();
  all[item.clientId] = item;
  if (!writeJSON(LS_KEY, all)) throw new Error("Could not save on this device");
}

async function removeItem(clientId: string): Promise<void> {
  try {
    await idb("readwrite", (s) => s.delete(clientId));
  } catch {
    /* ignore */
  }
  const all = lsAll();
  if (all[clientId]) {
    delete all[clientId];
    writeJSON(LS_KEY, all);
  }
}

/* --------------------------- device log -------------------------------- */

export interface LogEntry {
  clientId: string;
  participantId: string;
  consent: boolean;
  savedAt: string;
  uploadedAt?: string;
}

const LOG_KEY = "ohsi:log:v1";
const LOG_LIMIT = 100;

export function getLog(): LogEntry[] {
  return readJSON<LogEntry[]>(LOG_KEY) ?? [];
}

function writeLog(entries: LogEntry[]) {
  writeJSON(LOG_KEY, entries.slice(0, LOG_LIMIT));
}

function addLog(e: LogEntry) {
  writeLog([e, ...getLog().filter((x) => x.clientId !== e.clientId)]);
}

function markLogUploaded(clientIds: string[]) {
  if (!clientIds.length) return;
  const now = new Date().toISOString();
  writeLog(getLog().map((e) => (clientIds.includes(e.clientId) && !e.uploadedAt ? { ...e, uploadedAt: now } : e)));
}

/** Entries no longer in the outbox were uploaded (possibly by the service worker). */
export async function reconcileLog(): Promise<void> {
  const ids = new Set((await getOutbox()).map((i) => i.clientId));
  markLogUploaded(getLog().filter((e) => !e.uploadedAt && !ids.has(e.clientId)).map((e) => e.clientId));
}

/* ----------------------------- events ---------------------------------- */

const target = typeof window !== "undefined" ? new EventTarget() : null;
const channel =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel("ohsi-outbox")
    : null;

export function notifyChange() {
  target?.dispatchEvent(new Event("change"));
  channel?.postMessage("change");
}

export function onOutboxChange(cb: () => void): () => void {
  const onMessage = () => cb();
  const onSw = (e: MessageEvent) => {
    if (e.data?.type === "OUTBOX_CHANGED") cb();
  };
  target?.addEventListener("change", cb);
  channel?.addEventListener("message", onMessage);
  navigator.serviceWorker?.addEventListener("message", onSw);
  return () => {
    target?.removeEventListener("change", cb);
    channel?.removeEventListener("message", onMessage);
    navigator.serviceWorker?.removeEventListener("message", onSw);
  };
}

/* ------------------------------ queue ---------------------------------- */

export async function enqueue(payload: SubmissionPayload): Promise<void> {
  const item: OutboxItem = {
    clientId: payload.clientId,
    payload,
    participantId: payload.answers.participantId ?? "",
    consent: payload.answers.consent === true,
    createdAt: payload.clientCreatedAt,
    status: "pending",
    attempts: 0,
  };
  await putItem(item);
  addLog({
    clientId: item.clientId,
    participantId: item.participantId,
    consent: item.consent,
    savedAt: item.createdAt,
  });
  notifyChange();
  void registerBackgroundSync();
}

export async function retryRejected(clientId: string) {
  const item = (await getOutbox()).find((i) => i.clientId === clientId);
  if (!item) return;
  await putItem({ ...item, status: "pending", lastError: undefined });
  notifyChange();
}

export async function discardItem(clientId: string) {
  await removeItem(clientId);
  writeLog(getLog().filter((e) => e.clientId !== clientId));
  notifyChange();
}

async function registerBackgroundSync() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sync = (reg as (ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }) | undefined)?.sync;
    await sync?.register(OUTBOX_SYNC_TAG);
  } catch {
    /* Background Sync not supported – the page retries instead */
  }
}

type SendOutcome = { kind: "ok" } | { kind: "rejected"; error: string } | { kind: "retry"; error: string };

async function send(payload: SubmissionPayload): Promise<SendOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(SUBMIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.ok) return { kind: "ok" };
    let message = `Server error ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      /* not JSON */
    }
    if ([400, 413, 415, 422].includes(res.status)) return { kind: "rejected", error: message };
    return { kind: "retry", error: message };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return { kind: "retry", error: aborted ? "Connection timed out" : "No internet connection" };
  } finally {
    clearTimeout(timer);
  }
}

export interface FlushResult {
  sent: string[];
  remaining: number;
  networkError: boolean;
}

let inFlight: Promise<FlushResult> | null = null;

/** Uploads every pending item, oldest first. Safe to call often. */
export function flushOutbox(): Promise<FlushResult> {
  if (!inFlight) {
    const run = async (): Promise<FlushResult> => {
      const sent: string[] = [];
      let networkError = false;
      const pending = (await getOutbox()).filter((i) => i.status === "pending");
      for (const item of pending) {
        const outcome = await send(item.payload);
        if (outcome.kind === "ok") {
          await removeItem(item.clientId);
          sent.push(item.clientId);
          continue;
        }
        await putItem({
          ...item,
          attempts: item.attempts + 1,
          lastAttemptAt: new Date().toISOString(),
          lastError: outcome.error,
          status: outcome.kind === "rejected" ? "rejected" : "pending",
        });
        if (outcome.kind === "retry") {
          networkError = true;
          break; // the connection is down – try the rest later
        }
      }
      markLogUploaded(sent);
      const remaining = (await getOutbox()).length;
      if (sent.length || pending.length) notifyChange();
      return { sent, remaining, networkError };
    };
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    const p = locks?.request ? (locks.request(OUTBOX_LOCK, run) as unknown as Promise<FlushResult>) : run();
    inFlight = p.finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
