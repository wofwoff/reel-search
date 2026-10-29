import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function block(selectorPattern: RegExp, within = css) {
  return within.match(selectorPattern)?.[0] ?? "";
}

describe("responsive layout contracts", () => {
  it("shows the sidebar and hides the tab bar only on wide screens", () => {
    const desktop = block(/@media \(min-width: 960px\) \{[\s\S]*?\n\}/);
    expect(css).toMatch(/\.sidebar\s*\{\s*display:\s*none;/);
    expect(desktop).toMatch(/\.sidebar\s*\{[^}]*display:\s*flex/);
    expect(desktop).toMatch(/\.sidebar\s*\{[^}]*position:\s*sticky/);
    expect(desktop).toMatch(/\.bottom-nav\s*\{\s*display:\s*none;/);
  });

  it("uses an edge-to-edge three-column grid on phones and titled tiles from tablet up", () => {
    expect(css).toMatch(/\.collection__grid\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/\.collection__grid \.tile__title\s*\{\s*display:\s*none;/);
    const tablet = block(/@media \(min-width: 640px\) \{[\s\S]*?\n\}/);
    expect(tablet).toMatch(/\.collection__grid\s*\{[^}]*repeat\(auto-fill, minmax\(150px, 1fr\)\)/);
    expect(tablet).toMatch(/\.collection__grid \.tile__media\s*\{[^}]*aspect-ratio:\s*9 \/ 16/);
  });

  it("keeps the recent saves row horizontally scrollable", () => {
    expect(css).toMatch(/\.recent__row\s*\{[^}]*overflow-x:\s*auto/);
    expect(css).toMatch(/\.recent__item\s*\{[^}]*flex:\s*0 0 112px/);
  });

  it("respects iOS safe areas, input zoom and reduced motion", () => {
    expect(css).toMatch(/\.topbar\s*\{[^}]*env\(safe-area-inset-top/);
    expect(css).toMatch(/\.bottom-nav\s*\{[^}]*env\(safe-area-inset-bottom/);
    expect(css).toMatch(/@media screen and \(max-width: 768px\)[\s\S]*?font-size:\s*16px/);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("styles the app without runtime CSS or icon-font CDNs", () => {
    expect(html).not.toContain("cdn.tailwindcss.com");
    expect(html).not.toContain("Material+Symbols");
  });
});
