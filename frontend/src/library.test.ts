import { describe, expect, it } from "vitest";
import type { Collection, Reel } from "./api";
import { isFreshUnseen, parseResources, parseTakeaways, platformName, reelTitle, sortByLatestReel } from "./library";

function reel(id: string, createdAt: string, extra: Partial<Reel> = {}): Reel {
  return { id, source_url: `https://www.instagram.com/reel/${id}/`, ingest_status: "saved", created_at: createdAt, ...extra };
}

function collection(id: string, reels: Reel[]): Collection {
  return { id, name: id, keywords: [], reel_count: reels.length, updated_at: "2026-07-01T00:00:00Z", reels };
}

describe("sortByLatestReel", () => {
  it("orders collections by their most recently added reel, newest first", () => {
    const older = collection("older", [reel("a", "2026-07-04T00:00:00Z")]);
    const newer = collection("newer", [reel("b", "2026-07-20T00:00:00Z")]);
    expect(sortByLatestReel([older, newer]).map((c) => c.id)).toEqual(["newer", "older"]);
  });

  it("keeps the API order for ties and does not mutate the input", () => {
    const first = collection("first", []);
    const second = collection("second", []);
    const input = [first, second];
    expect(sortByLatestReel(input).map((c) => c.id)).toEqual(["first", "second"]);
    expect(input[0]).toBe(first);
  });
});

describe("reel display helpers", () => {
  it("falls back from title to the first caption line", () => {
    expect(reelTitle(reel("a", "", { title: "Crispy tofu" }))).toBe("Crispy tofu");
    expect(reelTitle(reel("a", "", { caption: "\nFirst line\nsecond" }))).toBe("First line");
    expect(reelTitle(reel("a", ""))).toBe("Saved reel");
  });

  it("names the platform", () => {
    expect(platformName("https://youtu.be/x")).toBe("YouTube");
    expect(platformName("https://www.instagram.com/reel/x/")).toBe("Instagram");
    expect(platformName("upload:clip.mp4")).toBe("Upload");
  });

  it("parses takeaways from JSON or plain lines", () => {
    expect(parseTakeaways('["Press it", "", 3, "Bake it"]')).toEqual(["Press it", "Bake it"]);
    expect(parseTakeaways("Press it\n\nBake it")).toEqual(["Press it", "Bake it"]);
    expect(parseTakeaways(null)).toEqual([]);
  });

  it("only keeps resources with http(s) links", () => {
    const value = JSON.stringify([
      { title: "Recipe", url: "https://example.com/recipe" },
      { title: "Bad", url: "javascript:alert(1)" },
      { title: 3, url: "https://example.com" },
      "nope"
    ]);
    expect(parseResources(value)).toEqual([{ title: "Recipe", url: "https://example.com/recipe" }]);
    expect(parseResources("not json")).toEqual([]);
  });
});

describe("isFreshUnseen", () => {
  const now = Date.parse("2026-10-28T12:00:00Z");

  it("marks reels from the last week that were not opened here", () => {
    expect(isFreshUnseen(reel("a", "2026-10-27T12:00:00Z"), new Set(), now)).toBe(true);
    expect(isFreshUnseen(reel("a", "2026-10-27T12:00:00Z"), new Set(["a"]), now)).toBe(false);
    expect(isFreshUnseen(reel("a", "2026-10-01T12:00:00Z"), new Set(), now)).toBe(false);
    expect(isFreshUnseen(reel("a", "not a date"), new Set(), now)).toBe(false);
  });
});
