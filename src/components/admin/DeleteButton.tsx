"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TrashIcon } from "../icons";

export function DeleteButton({ id, participantId }: { id: string; participantId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onDelete() {
    if (!confirm(`Delete the record for participant "${participantId}"? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/submissions/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) {
        router.replace("/admin");
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => null);
      setError(body?.message ?? `Could not delete (${res.status})`);
    } catch {
      setError("No internet connection");
    }
    setBusy(false);
  }

  return (
    <div>
      <button type="button" onClick={onDelete} disabled={busy} className="btn-secondary text-red-700">
        <TrashIcon className="h-5 w-5" />
        {busy ? "Deleting…" : "Delete record"}
      </button>
      {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}
