"use client";

import { forwardRef } from "react";
import { discardItem, retryRejected } from "@/lib/client/outbox";
import {
  AlertIcon,
  CloseIcon,
  CloudCheck,
  CloudOff,
  ClockIcon,
  RefreshIcon,
  TrashIcon,
  UploadIcon,
} from "../icons";
import { Bn } from "./fields";
import type { DeviceSync } from "./useDeviceSync";

const fmt = (iso?: string) => {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
};

interface Props {
  sync: DeviceSync;
  onDiscardCurrent: () => void;
  canDiscard: boolean;
}

export const DevicePanel = forwardRef<HTMLDialogElement, Props>(function DevicePanel(
  { sync, onDiscardCurrent, canDiscard },
  ref,
) {
  const close = () => (ref as React.RefObject<HTMLDialogElement | null>)?.current?.close();
  const pendingIds = new Set(sync.items.map((i) => i.clientId));
  const uploaded = sync.log.filter((e) => !pendingIds.has(e.clientId)).slice(0, 20);

  return (
    <dialog
      ref={ref}
      aria-labelledby="device-panel-title"
      className="sheet"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="flex max-h-[85dvh] flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 id="device-panel-title" className="text-lg font-bold text-slate-900">
            This device · <Bn>এই ডিভাইস</Bn>
          </h2>
          <button
            type="button"
            onClick={close}
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
            aria-label="Close"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-4 py-4">
          <div
            className={`flex items-center gap-3 rounded-xl p-3 ${
              sync.online ? "bg-emerald-50 text-emerald-900" : "bg-slate-100 text-slate-800"
            }`}
          >
            {sync.online ? <CloudCheck className="h-6 w-6" /> : <CloudOff className="h-6 w-6" />}
            <div className="min-w-0 flex-1 text-[15px]">
              <p className="font-semibold">
                {sync.online ? (sync.unstable ? "Weak connection" : "Online") : "Offline"}
              </p>
              <p className="text-sm opacity-80">
                {sync.items.length === 0
                  ? "Everything saved on this device has been uploaded."
                  : "Saved forms upload automatically when the internet is available."}
              </p>
            </div>
          </div>

          {sync.pending.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900">
                  Waiting to upload ({sync.pending.length})
                </h3>
                <button
                  type="button"
                  onClick={() => void sync.flush()}
                  disabled={sync.syncing}
                  className="btn-secondary h-10 px-3 text-sm"
                >
                  <UploadIcon className={`h-4 w-4 ${sync.syncing ? "animate-pulse" : ""}`} />
                  {sync.syncing ? "Uploading…" : "Upload now"}
                </button>
              </div>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {sync.pending.map((i) => (
                  <li key={i.clientId} className="flex items-start gap-3 px-3 py-2.5">
                    <ClockIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <div className="min-w-0 flex-1 text-[15px]">
                      <p className="font-medium text-slate-900">
                        {i.participantId || "—"} {!i.consent && <span className="text-slate-500">(no consent)</span>}
                      </p>
                      <p className="text-sm text-slate-500">
                        Saved {fmt(i.createdAt)}
                        {i.lastError && ` · ${i.lastError}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {sync.rejected.length > 0 && (
            <section>
              <h3 className="mb-2 font-semibold text-red-800">
                Needs attention ({sync.rejected.length})
              </h3>
              <ul className="divide-y divide-red-100 rounded-xl border border-red-200 bg-red-50">
                {sync.rejected.map((i) => (
                  <li key={i.clientId} className="px-3 py-2.5">
                    <div className="flex items-start gap-3">
                      <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                      <div className="min-w-0 flex-1 text-[15px]">
                        <p className="font-medium text-slate-900">{i.participantId || "—"}</p>
                        <p className="text-sm text-red-800">The server did not accept this form: {i.lastError}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2 pl-8">
                      <button
                        type="button"
                        className="btn-secondary h-10 px-3 text-sm"
                        onClick={async () => {
                          await retryRejected(i.clientId);
                          void sync.flush();
                        }}
                      >
                        <RefreshIcon className="h-4 w-4" /> Try again
                      </button>
                      <button
                        type="button"
                        className="btn-secondary h-10 px-3 text-sm text-red-700"
                        onClick={() => {
                          if (confirm(`Delete the saved form for ${i.participantId || "this participant"}? This cannot be undone.`)) {
                            void discardItem(i.clientId);
                          }
                        }}
                      >
                        <TrashIcon className="h-4 w-4" /> Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 font-semibold text-slate-900">Recently uploaded</h3>
            {uploaded.length === 0 ? (
              <p className="text-[15px] text-slate-500">Nothing uploaded from this device yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {uploaded.map((e) => (
                  <li key={e.clientId} className="flex items-start gap-3 px-3 py-2.5">
                    <CloudCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div className="min-w-0 flex-1 text-[15px]">
                      <p className="font-medium text-slate-900">
                        {e.participantId || "—"} {!e.consent && <span className="text-slate-500">(no consent)</span>}
                      </p>
                      <p className="text-sm text-slate-500">Saved {fmt(e.savedAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3 border-t border-slate-200 pt-4">
            {canDiscard && (
              <button
                type="button"
                className="btn-secondary w-full text-red-700"
                onClick={() => {
                  if (confirm("Clear the form you are filling now and start a new one?")) {
                    onDiscardCurrent();
                    close();
                  }
                }}
              >
                <TrashIcon className="h-5 w-5" /> Clear current form
              </button>
            )}
            <a href="/admin" className="block text-center text-sm font-medium text-teal-800 underline">
              Admin login
            </a>
          </section>
        </div>
      </div>
    </dialog>
  );
});
