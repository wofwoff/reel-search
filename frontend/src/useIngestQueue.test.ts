import { describe, expect, it, vi } from "vitest";

vi.mock("./supabaseClient", () => ({ supabase: { auth: { getSession: vi.fn() } } }));

import { restorePending, serializePending, type PendingSave } from "./useIngestQueue";

const now = Date.parse("2026-10-28T12:00:00Z");

function item(extra: Partial<PendingSave>): PendingSave {
  return { key: "k", label: "instagram.com/reel/x", status: "queued", createdAt: now - 1000, ...extra };
}

describe("pending save persistence", () => {
  it("resumes saves the server knows about and keeps failures until dismissed", () => {
    const raw = JSON.stringify([
      item({ key: "a", jobId: "j1", status: "processing" }),
      item({ key: "b", status: "failed", error: "Media download failed" }),
      item({ key: "c", status: "sending" })
    ]);
    expect(restorePending(raw, now).map((entry) => entry.key)).toEqual(["a", "b"]);
  });

  it("treats a save interrupted mid-upload that already has a job as queued", () => {
    const raw = JSON.stringify([item({ key: "a", jobId: "j1", status: "uploading" })]);
    expect(restorePending(raw, now)[0].status).toBe("queued");
  });

  it("drops entries older than a day and anything malformed", () => {
    const raw = JSON.stringify([
      item({ key: "old", jobId: "j1", createdAt: now - 2 * 24 * 60 * 60 * 1000 }),
      { key: 5 },
      "junk"
    ]);
    expect(restorePending(raw, now)).toEqual([]);
    expect(restorePending("not json", now)).toEqual([]);
    expect(restorePending(null, now)).toEqual([]);
  });

  it("does not persist saves that never reached the server", () => {
    const stored = JSON.parse(serializePending([item({ key: "a", status: "sending" }), item({ key: "b", jobId: "j1" })]));
    expect(stored.map((entry: PendingSave) => entry.key)).toEqual(["b"]);
  });
});
