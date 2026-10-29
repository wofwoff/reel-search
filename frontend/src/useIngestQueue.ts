import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJob, saveReel, type Reel } from "./api";
import { shortLinkLabel } from "./omnibox";

export type PendingStatus = "sending" | "uploading" | "queued" | "processing" | "failed";

export type PendingSave = {
  key: string;
  jobId?: string;
  url?: string;
  label: string;
  status: PendingStatus;
  error?: string;
  createdAt: number;
  misses?: number;
};

type QueueCallbacks = {
  onSaved: (reel: Reel | null) => void;
  onDuplicate: (reel: Reel) => void;
  onError: (message: string) => void;
};

export const PENDING_STORAGE_KEY = "reel_search_pending_jobs";
const POLL_MS = 2500;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
// A job that keeps failing to load (deleted, other account) would otherwise be polled forever.
const MAX_MISSES = 6;

function isPendingSave(value: unknown): value is PendingSave {
  const item = value as PendingSave;
  return typeof item === "object" && item !== null &&
    typeof item.key === "string" && typeof item.label === "string" &&
    typeof item.status === "string" && typeof item.createdAt === "number";
}

/** Restore saves from an earlier visit; only ones the server knows about (a job id) can be resumed. */
export function restorePending(raw: string | null, now: number = Date.now()): PendingSave[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isPendingSave)
      .filter((item) => now - item.createdAt < MAX_AGE_MS)
      .filter((item) => item.status === "failed" || Boolean(item.jobId))
      .map((item) => (item.status === "sending" || item.status === "uploading" ? { ...item, status: "queued" } : item));
  } catch {
    return [];
  }
}

export function serializePending(items: PendingSave[]): string {
  return JSON.stringify(items.filter((item) => item.status === "failed" || Boolean(item.jobId)));
}

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readStored(): PendingSave[] {
  try {
    return restorePending(localStorage.getItem(PENDING_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function useIngestQueue(callbacks: QueueCallbacks) {
  const [pending, setPending] = useState<PendingSave[]>(readStored);
  const [tick, setTick] = useState(0);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  useEffect(() => {
    try {
      localStorage.setItem(PENDING_STORAGE_KEY, serializePending(pending));
    } catch {
      // Without storage, in-flight saves just aren't resumed after a reload.
    }
  }, [pending]);

  const update = useCallback((key: string, patch: Partial<PendingSave>) => {
    setPending((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }, []);

  const remove = useCallback((key: string) => {
    setPending((items) => items.filter((item) => item.key !== key));
  }, []);

  const hasActiveJobs = pending.some((item) => item.jobId && (item.status === "queued" || item.status === "processing"));

  useEffect(() => {
    if (!hasActiveJobs) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const active = pendingRef.current.filter((item) => item.jobId && (item.status === "queued" || item.status === "processing"));
      const results = await Promise.allSettled(active.map((item) => fetchJob(item.jobId as string)));
      if (cancelled) return;
      results.forEach((result, index) => {
        const item = active[index];
        if (result.status === "rejected") {
          const misses = (item.misses ?? 0) + 1;
          update(item.key, misses >= MAX_MISSES
            ? { status: "failed", error: "Lost track of this save. Check your library or try again.", misses }
            : { misses });
          return;
        }
        const job = result.value;
        if (job.status === "succeeded") {
          remove(item.key);
          callbacksRef.current.onSaved(job.reel ?? null);
        } else if (job.status === "failed") {
          update(item.key, { status: "failed", error: job.error || "Processing failed", misses: 0 });
        } else {
          update(item.key, { status: job.status, misses: 0 });
        }
      });
      setTick((value) => value + 1);
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // `tick` re-arms the timer even when a poll changed nothing.
  }, [hasActiveJobs, tick, update, remove]);

  const save = useCallback(async (url: string, files: File[] = []) => {
    const key = newKey();
    const label = url ? shortLinkLabel(url) : files[0]?.name ?? "Upload";
    setPending((items) => [
      { key, url: url || undefined, label, status: files.length > 0 ? "uploading" : "sending", createdAt: Date.now() },
      ...items
    ]);

    try {
      const response = await saveReel(url, files);
      if (response.duplicate || !response.job) {
        remove(key);
        if (response.reel) callbacksRef.current.onDuplicate(response.reel);
        return;
      }
      const job = response.job;
      if (job.status === "succeeded") {
        remove(key);
        callbacksRef.current.onSaved(job.reel ?? null);
        return;
      }
      const status: PendingStatus = job.status === "failed" ? "failed" : job.status === "processing" ? "processing" : "queued";
      setPending((items) => {
        // Saving a link that is already in flight returns the same job; keep one tile for it.
        if (items.some((item) => item.key !== key && item.jobId === job.id)) {
          return items.filter((item) => item.key !== key);
        }
        return items.map((item) => item.key === key
          ? { ...item, jobId: job.id, status, error: job.error ?? undefined }
          : item);
      });
    } catch (err) {
      remove(key);
      callbacksRef.current.onError(err instanceof Error ? err.message : "Save failed");
    }
  }, [remove]);

  /** A failed link can be retried with the video file; the backend falls back to it if the download fails again. */
  const retryWithFiles = useCallback((key: string, files: File[]) => {
    const item = pending.find((entry) => entry.key === key);
    remove(key);
    void save(item?.url ?? "", files);
  }, [pending, remove, save]);

  return { pending, save, retryWithFiles, dismiss: remove };
}
