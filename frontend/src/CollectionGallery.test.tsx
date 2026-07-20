import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import CollectionGallery from "./CollectionGallery";


const collection = {
  id: "00000000-0000-0000-0000-000000000100",
  domain: "Arts & Creativity",
  name: "Motion Design",
  description: "Animation, typography, and visual storytelling workflows.",
  keywords: ["animation", "typography"],
  reel_count: 4,
  updated_at: "2026-07-20T00:00:00Z",
  reels: Array.from({ length: 4 }, (_, index) => ({
    id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
    source_url: `https://example.com/reel/${index + 1}`,
    title: `Motion reel ${index + 1}`,
    thumbnail_url: `https://images.example.com/${index + 1}.jpg`,
    ingest_status: "saved",
    created_at: `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00Z`
  }))
};


describe("CollectionGallery", () => {
  it("renders domain, topic, total count, and no more than three previews", () => {
    const html = renderToStaticMarkup(
      <CollectionGallery
        collections={[collection]}
        refreshing={false}
        onRefresh={() => undefined}
        onSelect={() => undefined}
      />
    );

    expect(html).toContain("Arts &amp; Creativity");
    expect(html).toContain("Motion Design");
    expect(html).toContain("4 reels");
    expect(html).toContain('aria-label="Open Motion Design collection"');
    expect(html).toContain('class="collection-grid');
    expect((html.match(/<img/g) ?? []).length).toBe(3);
    expect((html.match(/loading="lazy"/g) ?? []).length).toBe(3);
  });

  it("renders a useful empty state", () => {
    const html = renderToStaticMarkup(
      <CollectionGallery
        collections={[]}
        refreshing={false}
        onRefresh={() => undefined}
        onSelect={() => undefined}
      />
    );

    expect(html).toContain("Your first collection will appear here");
  });
});
