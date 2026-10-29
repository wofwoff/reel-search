import type { Collection, Reel } from "./api";

export type Resource = { title: string; url: string };

const SEEN_STORAGE_KEY = "reel_search_seen_reels";
const SEEN_LIMIT = 500;
const FRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// The API returns each collection's previews newest-first, so reels[0] is the latest reel added.
// Array.prototype.sort is stable, so collections with the same timestamp keep the API order.
function latestReelTime(collection: Collection): number {
  return collection.reels.reduce((latest, reel) => Math.max(latest, Date.parse(reel.created_at) || 0), 0);
}

export function sortByLatestReel(collections: Collection[]): Collection[] {
  return [...collections].sort((a, b) => latestReelTime(b) - latestReelTime(a));
}

export function reelTitle(reel: Reel): string {
  const fromCaption = reel.caption?.split("\n").find((line) => line.trim())?.trim();
  return reel.title?.trim() || fromCaption || "Saved reel";
}

export function platformName(url: string | null | undefined): string {
  if (!url) return "Upload";
  if (url.startsWith("upload:")) return "Upload";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "YouTube";
  if (url.includes("instagram.com") || url.includes("instagr.am")) return "Instagram";
  return "Link";
}

export function canOpenOriginal(reel: Reel): boolean {
  return /^https?:\/\//i.test(reel.source_url);
}

/** Takeaways are stored as a JSON array, but older rows hold newline-separated text. */
export function parseTakeaways(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && item.trim() !== "");
    }
  } catch {
    // Fall through to plain text.
  }
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

/** Resources come from the model, so only well-formed http(s) links are rendered as links. */
export function parseResources(value: string | null | undefined): Resource[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Resource =>
      typeof item === "object" && item !== null &&
      typeof (item as Resource).title === "string" &&
      typeof (item as Resource).url === "string" &&
      /^https?:\/\//i.test((item as Resource).url)
    );
  } catch {
    return [];
  }
}

const savedDateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

export function formatSavedDate(value: string): string {
  const time = Date.parse(value);
  return Number.isNaN(time) ? "" : savedDateFormatter.format(time);
}

export function loadSeenReels(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function rememberSeenReel(seen: Set<string>, reelId: string): Set<string> {
  if (seen.has(reelId)) return seen;
  const next = [...seen, reelId].slice(-SEEN_LIMIT);
  try {
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Seen markers are a convenience; losing them only re-shows the ring.
  }
  return new Set(next);
}

/** A recent reel gets the "new" ring until it is opened on this device. */
export function isFreshUnseen(reel: Reel, seen: Set<string>, now: number = Date.now()): boolean {
  const created = Date.parse(reel.created_at);
  return !seen.has(reel.id) && !Number.isNaN(created) && now - created < FRESH_WINDOW_MS;
}
