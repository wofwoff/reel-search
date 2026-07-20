import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("responsive layout contracts", () => {
  it("defines the adaptive desktop shell and content-driven grids", () => {
    expect(css).toContain(".app-shell");
    expect(css).toContain("105rem");
    expect(css).toContain(".collection-grid");
    expect(css).toContain("min(100%, 340px)");
    expect(css).toContain("@media (min-width: 80rem)");
    expect(css).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(css).toContain(".reel-grid");
    expect(css).toContain("@media (min-width: 64rem)");
  });

  it("adapts save controls and touch interactions on narrow screens", () => {
    expect(css).toContain("@media (max-width: 479px)");
    expect(css).toContain(".save-control-shell");
    expect(css).toContain("@media (hover: hover) and (pointer: fine)");
    expect(css).toContain("@media (pointer: coarse)");
  });
});
