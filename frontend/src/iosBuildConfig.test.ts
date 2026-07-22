import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("iOS production build configuration", () => {
  it("builds Capacitor with the iOS environment instead of localhost", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    ) as { scripts: Record<string, string> };
    const iosEnv = readFileSync(new URL("../.env.ios", import.meta.url), "utf8");

    expect(packageJson.scripts["cap:build"]).toContain("build:ios");
    expect(packageJson.scripts["build:ios"]).toContain("--mode ios");
    expect(iosEnv).toContain(
      "VITE_API_BASE_URL=https://reel-search-api-771696730702.us-central1.run.app"
    );
    expect(iosEnv).toContain(
      "VITE_SUPABASE_URL=https://jxerusovqqvpkibygrem.supabase.co"
    );
    expect(iosEnv).toMatch(/VITE_SUPABASE_ANON_KEY=sb_publishable_[^\s]+/);
    expect(iosEnv).not.toContain("localhost");
  });
});
