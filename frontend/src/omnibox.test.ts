import { describe, expect, it } from "vitest";
import { classifyOmnibox, shortLinkLabel, toSaveUrl } from "./omnibox";

describe("classifyOmnibox", () => {
  it("treats links as saves", () => {
    expect(classifyOmnibox("https://www.instagram.com/reel/C9xYz/")).toBe("save");
    expect(classifyOmnibox("http://example.com/anything")).toBe("save");
    expect(classifyOmnibox("instagram.com/reel/C9xYz")).toBe("save");
    expect(classifyOmnibox("www.youtube.com/shorts/abc123")).toBe("save");
    expect(classifyOmnibox("youtu.be/abc123")).toBe("save");
    expect(classifyOmnibox("  m.instagram.com/p/xyz  ")).toBe("save");
  });

  it("treats everything else as a search", () => {
    expect(classifyOmnibox("crispy tofu with cornstarch")).toBe("search");
    expect(classifyOmnibox("instagram")).toBe("search");
    expect(classifyOmnibox("instagram.com tricks for editing")).toBe("search");
    expect(classifyOmnibox("notinstagram.com/reel/x")).toBe("search");
  });

  it("is empty for blank input", () => {
    expect(classifyOmnibox("")).toBe("empty");
    expect(classifyOmnibox("   ")).toBe("empty");
  });
});

describe("toSaveUrl", () => {
  it("adds the https scheme the backend requires", () => {
    expect(toSaveUrl(" instagram.com/reel/C9xYz ")).toBe("https://instagram.com/reel/C9xYz");
    expect(toSaveUrl("http://youtu.be/abc")).toBe("http://youtu.be/abc");
  });
});

describe("shortLinkLabel", () => {
  it("strips the scheme and www and shortens long links", () => {
    expect(shortLinkLabel("https://www.instagram.com/reel/C9x/")).toBe("instagram.com/reel/C9x");
    expect(shortLinkLabel("https://www.youtube.com/watch?v=abcdefghijklmnopqrstuvwxyz")).toHaveLength(34);
  });
});
