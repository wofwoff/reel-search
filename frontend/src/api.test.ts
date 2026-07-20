import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } })
    }
  }
}));

import { fetchCollectionReels, fetchLibraryCount, fetchLibraryOverview } from "./api";

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
