import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./supabaseClient", () => ({ supabase: { auth: { getSession: vi.fn() } } }));

import CollectionSection, { COLLECTION_PAGE_SIZE, collectionAnchor } from "./CollectionSection";

const collection = {
  id: "00000000-0000-0000-0000-000000000100",
  domain: "Arts & Creativity",
  name: "Motion Design",
  description: "Animation, typography, and visual storytelling workflows.",
  keywords: ["animation", "typography"],
  reel_count: 5,
  updated_at: "2026-07-20T00:00:00Z",
  reels: Array.from({ length: 3 }, (_, index) => ({
    id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
    source_url: `https://www.instagram.com/reel/${index + 1}/`,
    title: `Motion reel ${index + 1}`,
    creator: "@studio",
    thumbnail_url: `https://images.example.com/${index + 1}.jpg`,
    ingest_status: "saved",
    created_at: `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00Z`
  }))
};

function render(hidden: string[] = []) {
  return renderToStaticMarkup(
    <CollectionSection collection={collection} hiddenIds={new Set(hidden)} onOpen={() => undefined} onStale={() => undefined} />
  );
}

describe("CollectionSection", () => {
  it("heads the section with the topic, domain and full reel count", () => {
    const html = render();
    expect(html).toContain(`id="${collectionAnchor(collection.id)}"`);
    expect(html).toContain(">Motion Design</h2>");
    expect(html).toContain("Arts &amp; Creativity · 5 reels");
  });

  it("shows the preview reels right away as labelled, lazy-loaded tiles", () => {
    const html = render();
    expect(html).toContain('aria-label="Motion reel 1, @studio"');
    // three tiles plus the cover image, all lazy
    expect((html.match(/loading="lazy"/g) ?? []).length).toBe(4);
  });

  it("reserves space for the rest of the first page while it loads", () => {
    const html = render();
    const placeholders = (html.match(/tile--skeleton/g) ?? []).length;
    expect(placeholders).toBe(Math.min(collection.reel_count, COLLECTION_PAGE_SIZE) - collection.reels.length);
    expect(html).not.toContain("Show more");
  });

  it("leaves out reels deleted during this visit", () => {
    const html = render([collection.reels[0].id]);
    expect(html).not.toContain("Motion reel 1");
    expect(html).toContain("Motion reel 2");
  });
});
