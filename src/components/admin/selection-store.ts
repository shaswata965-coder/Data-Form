"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Selected admin rows, kept in sessionStorage so the selection survives
 * moving between pages. A selection belongs to one filter (search + consent):
 * changing the filter starts a fresh selection, so hidden records can never
 * be deleted by accident.
 */
interface State {
  filterKey: string;
  ids: string[];
}

const KEY = "ohsi:admin-selection";
const EMPTY: State = { filterKey: "", ids: [] };
const listeners = new Set<() => void>();
let state: State | null = null;

function read(): State {
  if (state) return state;
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as State) : null;
    state = parsed && Array.isArray(parsed.ids) && typeof parsed.filterKey === "string" ? parsed : EMPTY;
  } catch {
    state = EMPTY;
  }
  return state;
}

function write(next: State) {
  state = next;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable – selection still works for this page */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Remove ids from the selection (e.g. after they were deleted). */
export function forgetSelected(ids: string[]) {
  const s = read();
  const drop = new Set(ids);
  if (s.ids.some((id) => drop.has(id))) write({ ...s, ids: s.ids.filter((id) => !drop.has(id)) });
}

export function useSelection(filterKey: string) {
  const s = useSyncExternalStore(subscribe, read, () => EMPTY);
  const ids = useMemo(() => (s.filterKey === filterKey ? s.ids : []), [s, filterKey]);
  const selected = useMemo(() => new Set(ids), [ids]);

  const replace = useCallback((next: string[]) => write({ filterKey, ids: [...new Set(next)] }), [filterKey]);
  const add = useCallback(
    (more: string[]) => write({ filterKey, ids: [...new Set([...(read().filterKey === filterKey ? read().ids : []), ...more])] }),
    [filterKey],
  );
  const remove = useCallback(
    (less: string[]) => {
      const drop = new Set(less);
      const current = read().filterKey === filterKey ? read().ids : [];
      write({ filterKey, ids: current.filter((id) => !drop.has(id)) });
    },
    [filterKey],
  );
  const toggle = useCallback(
    (id: string) => (selected.has(id) ? remove([id]) : add([id])),
    [selected, add, remove],
  );
  const clear = useCallback(() => write({ filterKey, ids: [] }), [filterKey]);

  return { ids, selected, replace, add, remove, toggle, clear };
}
