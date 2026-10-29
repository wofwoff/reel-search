import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } })
    }
  }
}));

import { fetchCollectionReels, fetchLibraryCount, fetchLibraryOverview, fetchRecentReels, waitForJob } from "./api";

const fetchMock = vi.fn();
const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

beforeEach(() => {
  vi.stubGlobal("window", { location: { search: "" } });
  vi.stubGlobal("localStorage", {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn()
  });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

describe("library overview API", () => {
  it("loads the unpaginated library total without fetching the reel wall", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ count: 79 }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(fetchLibraryCount()).resolves.toEqual({ count: 79 });
    expect(fetchMock).toHaveBeenCalledWith(`${apiBase}/api/reels/count`, { headers: {} });
  });

  it("loads reels only for the collection the user opens", async () => {
    fetchMock.mockResolvedValueOnce(new Response("[]", {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(fetchCollectionReels("design/tools")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(`${apiBase}/api/collections/design%2Ftools/reels`, { headers: {} });
  });

  it("pages through a collection's reels", async () => {
    fetchMock.mockResolvedValueOnce(new Response("[]", {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await fetchCollectionReels("c1", { limit: 24, offset: 48 });
    expect(fetchMock).toHaveBeenCalledWith(`${apiBase}/api/collections/c1/reels?limit=24&offset=48`, { headers: {} });
  });

  it("loads the newest reels for the recent saves row", async () => {
    fetchMock.mockResolvedValueOnce(new Response("[]", {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(fetchRecentReels()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(`${apiBase}/api/reels`, { headers: {} });
  });

  it("keeps the real saved-reel count when collections fail to load", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 79 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Collections unavailable" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }));

    await expect(fetchLibraryOverview()).resolves.toMatchObject({
      count: 79,
      collections: null
    });
  });
});

describe("ingest job polling", () => {
  const jobResponse = (body: object) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

  it("polls until the job succeeds and returns the saved reel", async () => {
    const reel = { id: "r1", source_url: "u", ingest_status: "saved", created_at: "now" };
    fetchMock
      .mockResolvedValueOnce(jobResponse({ id: "j1", status: "queued" }))
      .mockResolvedValueOnce(jobResponse({ id: "j1", status: "processing" }))
      .mockResolvedValueOnce(jobResponse({ id: "j1", status: "succeeded", reel }));

    await expect(waitForJob("j1", { intervalMs: 1 })).resolves.toEqual(reel);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(`${apiBase}/api/jobs/j1`, { headers: {} });
  });

  it("rejects with the worker's error when the job fails", async () => {
    fetchMock.mockResolvedValueOnce(jobResponse({ id: "j1", status: "failed", error: "Media download failed" }));

    await expect(waitForJob("j1", { intervalMs: 1 })).rejects.toThrow("Media download failed");
  });

  it("stops polling after the timeout", async () => {
    fetchMock.mockImplementation(async () => jobResponse({ id: "j1", status: "processing" }));

    await expect(waitForJob("j1", { intervalMs: 1, timeoutMs: 20 })).rejects.toThrow("Still processing");
  });
});
