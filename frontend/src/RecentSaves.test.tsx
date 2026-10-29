import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./supabaseClient", () => ({ supabase: { auth: { getSession: vi.fn() } } }));

import RecentSaves from "./RecentSaves";
import type { PendingSave } from "./useIngestQueue";

const reel = {
  id: "r1",
  source_url: "https://www.instagram.com/reel/r1/",
  title: "Crispy tofu without a fryer",
  ingest_status: "saved",
  created_at: new Date().toISOString()
};

const pending: PendingSave[] = [
  { key: "p1", jobId: "j1", label: "instagram.com/reel/abc", status: "processing", createdAt: Date.now() },
  { key: "p2", jobId: "j2", label: "instagram.com/reel/def", status: "failed", error: "Media download failed", createdAt: Date.now() }
];

function render(seen = new Set<string>(), reels = [reel]) {
  return renderToStaticMarkup(
    <RecentSaves
      reels={reels}
      pending={pending}
      seen={seen}
      onOpen={() => undefined}
      onRetryWithFile={() => undefined}
      onDismiss={() => undefined}
    />
  );
}

describe("RecentSaves", () => {
  it("puts saves in progress ahead of saved reels", () => {
    const html = render();
    expect(html.indexOf("Analyzing…")).toBeGreaterThan(-1);
    expect(html.indexOf("Analyzing…")).toBeLessThan(html.indexOf("Crispy tofu without a fryer"));
    expect(html).toContain("1 processing");
  });

  it("lets a failed save be retried with a file or dismissed", () => {
    const html = render();
    expect(html).toContain("Media download failed");
    expect(html).toContain(">Add file</button>");
    expect(html).toContain('aria-label="Dismiss instagram.com/reel/def"');
  });

  it("rings new reels until they are opened", () => {
    expect(render()).toContain("tile__ring");
    expect(render(new Set(["r1"]))).not.toContain("tile__ring");
  });

  it("shows placeholders while the newest reels load", () => {
    expect((render(new Set(), null as never).match(/tile--skeleton/g) ?? []).length).toBe(6);
  });
});
