"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  flushOutbox,
  getLog,
  getOutbox,
  onOutboxChange,
  reconcileLog,
  type FlushResult,
  type LogEntry,
  type OutboxItem,
} from "@/lib/client/outbox";

const RETRY_MS = 30_000;

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export interface DeviceSync {
  online: boolean;
  items: OutboxItem[];
  pending: OutboxItem[];
  rejected: OutboxItem[];
  log: LogEntry[];
  syncing: boolean;
  /** Last upload attempt failed because of the network. */
  unstable: boolean;
  flush: () => Promise<FlushResult | null>;
  refresh: () => Promise<void>;
}

export function useDeviceSync(): DeviceSync {
  const online = useOnline();
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [unstable, setUnstable] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      await reconcileLog();
      const next = await getOutbox();
      if (mounted.current) setItems(next);
    } catch {
      /* storage unavailable */
    }
    if (mounted.current) setLog(getLog());
  }, []);

  const flush = useCallback(async () => {
    if (!mounted.current) return null;
    setSyncing(true);
    try {
      const r = await flushOutbox();
      if (mounted.current) setUnstable(r.networkError);
      return r;
    } catch {
      return null;
    } finally {
      if (mounted.current) setSyncing(false);
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    mounted.current = true;
    const initial = window.setTimeout(() => {
      void refresh();
      void flush();
    }, 0);
    const unsubscribe = onOutboxChange(() => void refresh());
    const onOnline = () => void flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") void flush();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void flush();
    }, RETRY_MS);
    return () => {
      mounted.current = false;
      unsubscribe();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
      window.clearTimeout(initial);
    };
  }, [flush, refresh]);

  return {
    online,
    items,
    pending: items.filter((i) => i.status === "pending"),
    rejected: items.filter((i) => i.status === "rejected"),
    log,
    syncing,
    unstable: unstable && items.length > 0,
    flush,
    refresh,
  };
}
