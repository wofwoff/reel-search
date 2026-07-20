# Responsive Full-Width Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand ReelMind to an adaptive 94%-width desktop shell with a three-column MacBook collection gallery while preserving a glitch-free, touch-friendly mobile experience down to 320px.

**Architecture:** Add a shared CSS shell and content-driven grid utilities, then apply them to the existing single-page React layout. Keep one component tree across breakpoints, restructure only the save control where mobile needs a different flow, and verify responsive contracts through stylesheet/component tests plus browser measurements.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CDN utilities, project CSS, Vitest, Codex in-app browser.

## Global Constraints

- Main shell uses approximately 94% of the viewport and caps at 1680px.
- Gallery is one column on phones, two on tablets/compact desktop, and three on MacBook/large desktop when cards remain at least approximately 340–360px wide.
- Existing ReelMind design tokens, hero, save/upload, search, Shortcut, sync, collection, modal, and footer behavior remain intact.
- Touch targets are at least 44px on mobile/coarse-pointer contexts.
- No horizontal overflow at 320px or any agreed verification viewport.
- Reading content remains constrained even when operational surfaces expand.

---

### Task 1: Lock Responsive Contracts with Failing Tests

**Files:**
- Create: `frontend/src/responsiveLayout.test.ts`
- Modify: `frontend/src/CollectionGallery.test.tsx`

**Interfaces:**
- Consumes: `frontend/src/styles.css` and the rendered `CollectionGallery` markup.
- Produces: regression coverage for `.app-shell`, `.collection-grid`, `.reel-grid`, narrow save controls, pointer-aware interaction, and gallery class usage.

- [ ] **Step 1: Write the failing stylesheet contract test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("responsive layout contracts", () => {
  it("defines the adaptive desktop shell and content-driven grids", () => {
    expect(css).toContain(".app-shell");
    expect(css).toContain("105rem");
    expect(css).toContain(".collection-grid");
    expect(css).toContain("min(100%, 340px)");
    expect(css).toContain(".reel-grid");
  });

  it("adapts save controls and touch interactions on narrow screens", () => {
    expect(css).toContain("@media (max-width: 479px)");
    expect(css).toContain(".save-control-shell");
    expect(css).toContain("@media (hover: hover) and (pointer: fine)");
    expect(css).toContain("@media (pointer: coarse)");
  });
});
```

- [ ] **Step 2: Extend the gallery test**

Add:

```ts
expect(html).toContain('class="collection-grid');
```

- [ ] **Step 3: Run the tests and verify RED**

Run: `cd frontend && npm test -- src/responsiveLayout.test.ts src/CollectionGallery.test.tsx`

Expected: FAIL because the responsive CSS classes and gallery hook do not yet exist.

---

### Task 2: Implement the Shared Shell and Responsive Grids

**Files:**
- Modify: `frontend/src/styles.css`
- Modify: `frontend/index.html`
- Modify: `frontend/src/CollectionGallery.tsx`

**Interfaces:**
- Consumes: existing ReelMind colors, spacing, and 16px card radius.
- Produces: `.app-shell`, `.collection-grid`, `.reel-grid`, `.stats-grid`, `.utility-grid`, and responsive pointer behavior.

- [ ] **Step 1: Add the shared responsive CSS**

Add the following structural rules to `styles.css`:

```css
:root {
  --page-gutter: clamp(1rem, 3vw, 3rem);
}

.app-shell {
  width: min(calc(100% - (2 * var(--page-gutter))), 105rem);
  margin-inline: auto;
}

.collection-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
  gap: clamp(1rem, 1.8vw, 1.5rem);
}

.reel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: clamp(1rem, 2vw, 2rem);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.utility-grid {
  display: grid;
  grid-template-columns: 1fr;
}

@media (min-width: 48rem) {
  .stats-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .utility-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
```

- [ ] **Step 2: Make card pointer behavior input-aware**

Move the lift effect from unconditional Tailwind hover classes into:

```css
@media (hover: hover) and (pointer: fine) {
  .collection-card:hover {
    transform: translateY(-2px);
    border-color: rgb(148 73 46 / 0.45);
  }
}

@media (pointer: coarse) {
  .collection-card,
  button,
  a {
    min-height: 44px;
  }

  .collection-card:active { transform: scale(0.995); }
}
```

- [ ] **Step 3: Wire the collection grid class**

Replace the gallery grid classes with:

```tsx
<div className="collection-grid">
```

- [ ] **Step 4: Update the Tailwind container token**

Change `container-max` in `frontend/index.html` from `1200px` to `1680px` so legacy uses cannot reintroduce the narrow cap.

- [ ] **Step 5: Run responsive tests**

Run: `cd frontend && npm test -- src/responsiveLayout.test.ts src/CollectionGallery.test.tsx`

Expected: PASS.

---

### Task 3: Adapt the Application Layout and Mobile Save Flow

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: shared CSS classes from Task 2.
- Produces: full-width navigation/stats/library/footer, constrained hero copy, widened save/upload controls, responsive stats and utilities, and adaptive reel grids.

- [ ] **Step 1: Replace narrow page wrappers**

For navigation, hero section, stats, library, and footer alignment, replace `max-w-container-max mx-auto px-gutter` with `app-shell`. Keep hero text in its existing `max-w-3xl` reading container.

- [ ] **Step 2: Restructure the save control**

Use one input cluster plus a sibling Analyze button:

```tsx
<div className="save-control-shell">
  <div className="save-input-cluster">
    <span className="material-symbols-outlined text-primary">link</span>
    <input id="ingest-input" className="save-url-input" {...inputProps} />
  </div>
  <button type="submit" className="save-analyze-button" {...buttonProps}>
    {icon}
    <span>{saveLabel}</span>
  </button>
</div>
```

Add CSS that keeps this inline by default and stacks it below 480px:

```css
.save-form-width { width: min(100%, 56rem); margin-inline: auto; }
.save-control-shell { display: flex; align-items: center; gap: 0.5rem; }
.save-input-cluster { display: flex; min-width: 0; flex: 1; align-items: center; }

@media (max-width: 479px) {
  .save-control-shell { flex-direction: column; align-items: stretch; border-radius: 16px; }
  .save-analyze-button { width: 100%; min-height: 44px; justify-content: center; }
}
```

- [ ] **Step 3: Apply explicit stats and utility grids**

Replace the wrapping stats row with `stats-grid`; remove decorative separator elements. Apply `utility-grid gap-4` to Shortcut and Sync panels.

- [ ] **Step 4: Apply adaptive reel grids**

Replace fixed `sm:grid-cols-2 lg:grid-cols-3` result/detail/loading grids with `reel-grid`.

- [ ] **Step 5: Harden mobile header and search controls**

Use responsive padding and compact button copy sizing in the header. Ensure the library header remains `flex-col` until the search field and heading fit without collision, and give the search form a 44px minimum height.

- [ ] **Step 6: Run frontend tests and build**

Run: `cd frontend && npm test && npm run build`

Expected: all tests pass and Vite produces a production bundle.

---

### Task 4: Update the Design System Contract

**Files:**
- Modify: `DESIGN.md`

**Interfaces:**
- Consumes: approved responsive spec and implemented CSS values.
- Produces: durable documentation preventing regression to the old 1200px shell.

- [ ] **Step 1: Update layout documentation**

Replace the old maximum-width guidance with:

```markdown
- Adaptive application shell: approximately 94% viewport width with responsive 16–48px gutters and a 1680px cap.
- Reading copy remains independently capped at 65–75 characters.
- Collection gallery: one column on phones, two on tablets/compact desktop, and three on MacBook/large desktop where cards remain at least 340px wide.
- Reel results/detail grid: auto-fit from 280px card width, up to four columns on large displays.
```

- [ ] **Step 2: Check documentation consistency**

Run: `rg -n "1200px|1680px|three columns|340px" DESIGN.md docs/superpowers/specs/2026-07-20-responsive-full-width-design.md`

Expected: no active 1200px shell requirement remains.

---

### Task 5: Responsive Browser QA and Final Verification

**Files:**
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: local frontend at `http://127.0.0.1:5173/` and populated collection fixture state used only for QA.
- Produces: browser measurements, screenshots, interaction results, and final pass/block status.

- [ ] **Step 1: Start or reuse the local frontend and backend**

Run the documented development commands on ports 5173 and 8000.

- [ ] **Step 2: Measure every agreed viewport**

At 320, 390, 768, 1024, 1280, 1512, 1728, and 2560 widths, record shell width, document scroll width, gallery column count, and visible control overlap.

Expected: shell is approximately 94% until 1680px, no horizontal overflow, and gallery columns progress 1 → 2 → 3.

- [ ] **Step 3: Test core interactions**

Verify Shortcut expansion, URL input focus, upload fallback expansion, semantic search focus, collection selection callback/route, back navigation, and modal close behavior.

- [ ] **Step 4: Inspect console errors**

Separate expected local authentication/environment messages from new application errors; block completion for any new layout or interaction error.

- [ ] **Step 5: Update `design-qa.md`**

Record source/implementation screenshots, viewport measurements, interactions, findings, fixes, and exactly one final line: `final result: passed` or `final result: blocked`.

- [ ] **Step 6: Run final verification**

Run:

```bash
cd frontend && npm test && npm run build
cd .. && git diff --check
```

Expected: all frontend tests pass, production build succeeds, and no whitespace errors are reported.
