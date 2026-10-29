export type OmniboxMode = "empty" | "save" | "search";

// Hosts the backend can ingest (see backend/app/services/url_utils.py).
const SAVEABLE_HOST = /^(?:www\.|m\.)?(?:instagram\.com|instagr\.am|youtube\.com|youtu\.be|youtube-nocookie\.com)(?:[/?#]|$)/i;

/** One box does both jobs: a link saves, anything else searches by meaning. */
export function classifyOmnibox(text: string): OmniboxMode {
  const value = text.trim();
  if (!value) return "empty";
  if (/^https?:\/\//i.test(value)) return "save";
  if (!/\s/.test(value) && SAVEABLE_HOST.test(value)) return "save";
  return "search";
}

/** The backend only accepts absolute http(s) URLs, so give bare "instagram.com/reel/…" a scheme. */
export function toSaveUrl(text: string): string {
  const value = text.trim();
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/** Short, human label for a link while it is still being processed. */
export function shortLinkLabel(url: string): string {
  const stripped = url.trim().replace(/^https?:\/\//i, "").replace(/^(www\.|m\.)/i, "").replace(/\/+$/, "");
  return stripped.length > 34 ? `${stripped.slice(0, 33)}…` : stripped;
}
