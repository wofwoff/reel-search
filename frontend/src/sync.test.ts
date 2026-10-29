import { describe, expect, it } from "vitest";
import { buildSyncLink, parseSyncInput, PUBLIC_APP_URL, shortcutEndpoint } from "./sync";

describe("parseSyncInput", () => {
  it("reads a full sync link", () => {
    expect(parseSyncInput("https://app.example.com/?user_id=u1&sync_token=v1.123.sig")).toEqual({
      kind: "sync", userId: "u1", syncToken: "v1.123.sig"
    });
  });

  it("accepts a sync link pasted without its scheme", () => {
    expect(parseSyncInput("app.example.com/?user_id=u1&sync_token=v1.1.s")).toEqual({
      kind: "sync", userId: "u1", syncToken: "v1.1.s"
    });
  });

  it("rejects a bare sync token, which is useless without its user id", () => {
    expect(() => parseSyncInput("v1.123.sig")).toThrow("full Sync Link");
  });

  it("reads legacy session links and bare refresh tokens", () => {
    expect(parseSyncInput("https://app.example.com/?access_token=a&refresh_token=r")).toEqual({
      kind: "supabase", accessToken: "a", refreshToken: "r"
    });
    expect(parseSyncInput("  raw-refresh-token ")).toEqual({
      kind: "supabase", accessToken: "", refreshToken: "raw-refresh-token"
    });
  });
});

describe("buildSyncLink", () => {
  it("links to the current page when it is publicly reachable", () => {
    expect(buildSyncLink("https://reels.example.com", "/app", "u 1", "t&k")).toBe(
      "https://reels.example.com/app?user_id=u%201&sync_token=t%26k"
    );
  });

  it("points the iOS app and localhost at the public web app", () => {
    expect(buildSyncLink("capacitor://localhost", "/index.html", "u", "t")).toBe(`${PUBLIC_APP_URL}/?user_id=u&sync_token=t`);
    expect(buildSyncLink("http://localhost:5173", "/", "u", "t")).toBe(`${PUBLIC_APP_URL}/?user_id=u&sync_token=t`);
  });

  it("is empty without an identity", () => {
    expect(buildSyncLink("https://reels.example.com", "/", "", "t")).toBe("");
  });
});

describe("shortcutEndpoint", () => {
  it("uses the API base when the frontend is built with one", () => {
    expect(shortcutEndpoint("https://api.example.com/", "https://app.example.com")).toBe("https://api.example.com/api/reels/shortcut");
  });

  it("falls back to the page origin when the API is same-origin", () => {
    expect(shortcutEndpoint("", "https://app.example.com")).toBe("https://app.example.com/api/reels/shortcut");
  });
});
