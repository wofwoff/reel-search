# ReelMind Responsive Full-Width Layout

## Goal

Use substantially more of the available desktop viewport while keeping ReelMind calm, readable, and fully usable on phones, tablets, MacBooks, large monitors, and touch devices.

## Current Constraint

The page shell is capped at 1200px. On MacBook and larger desktop viewports this produces excessive empty space on both sides and prevents the collection gallery, stats, tools, and save flow from using the available width.

## Approved Direction

Adopt an adaptive full-width shell and a three-column desktop collection gallery.

- The primary shell uses approximately 94% of the viewport with responsive gutters.
- The shell caps at 1680px so content does not become excessively stretched on ultrawide displays.
- Reading-focused content such as hero copy remains independently width-constrained.
- Operational surfaces such as the save form, stats, utility panels, search header, and collection gallery expand with the shell.

## Responsive Structure

### Mobile: 320–639px

- One content column.
- Header keeps the ReelMind identity and primary Ingest action without overlap.
- Hero copy remains centered and compact.
- The URL input and Analyze action stack when the inline layout would truncate the input.
- Stats use a balanced two-by-two grid.
- Shortcut Setup and Sync Devices stack vertically.
- Library title, total, and semantic search stack vertically.
- Collection cards use one column and preserve two or three thumbnails.
- All interactive targets are at least 44px high.
- Safe-area padding is respected and horizontal overflow is prohibited.

### Tablet: 640–1023px

- The shell expands with moderate gutters.
- Save controls may remain inline when they fit.
- Stats remain two-by-two until all four metrics fit cleanly.
- Utility panels use two columns where space permits.
- Collection gallery uses two columns.

### Desktop and MacBook: 1024–1679px

- The shell uses roughly 94% of the viewport.
- Stats and utility tools span the expanded shell.
- The collection gallery uses two columns at compact desktop widths and three columns once cards can remain at least approximately 360px wide.
- The hero remains centered with a readable text measure; it does not stretch merely because the viewport is wider.

### Large Desktop and Ultrawide: 1680px+

- The shell caps at 1680px.
- The collection gallery remains three columns so cards preserve useful thumbnail and text proportions.
- Side space beyond the cap is intentional protection against unreadably wide UI rather than the former narrow-page constraint.

## Component Changes

### Shared Shell

Replace repeated `max-w-container-max` usage with one reusable responsive shell class/token. The shell owns width and horizontal safe-area gutters so navigation, hero-adjacent operational content, stats, tools, library, and footer align consistently.

### Hero and Save Flow

- Keep only the centered “Turn scrolls into insights.” heading and supporting copy.
- Increase the save form’s desktop maximum width.
- On narrow phones, separate the URL field and Analyze button into stacked controls to prevent placeholder truncation and cramped tap targets.
- Preserve the local upload fallback immediately below.

### Stats and Utilities

- Use an explicit responsive grid rather than relying on wrapping behavior.
- Metrics render as two columns on mobile and four columns on sufficiently wide screens.
- Dividers only appear when metrics share a row.
- Shortcut and Sync panels remain two columns on tablet/desktop and stack on mobile.

### Collection Gallery

- Use a responsive CSS grid based on a minimum usable card width.
- One column on phones, two on tablets/compact desktop, and three on MacBook/large desktop.
- Preserve the two-to-three-thumbnail preview cap.
- Keep card height content-driven to avoid stretched empty panels.
- Hover elevation is enabled only for hover-capable pointers; touch receives an active-state response instead.

### Collection Detail and Search Results

- Reel cards use one column on phones, two on tablets, and up to four on large desktop displays when their minimum width is maintained.
- Search controls remain full-width on mobile and right-aligned on desktop.
- Loading and empty states occupy the full available grid width without causing layout shift.

## Performance and Reliability

- Continue loading only collection previews on the overview.
- Continue loading eight reels only after a collection is opened.
- Preserve lazy and asynchronous thumbnail decoding.
- Keep `content-visibility` for off-screen collection cards with a realistic intrinsic size.
- Avoid duplicate desktop/mobile component trees.
- Respect `prefers-reduced-motion` and pointer/hover media features.

## Verification

Browser QA will cover:

- 320 × 568 small phone
- 390 × 844 modern phone
- 768 × 1024 tablet portrait
- 1024 × 768 compact desktop/tablet landscape
- 1280 × 800 laptop
- 1512 × 982 MacBook
- 1728 × 1117 large MacBook
- 2560 × 1440 large desktop

For every relevant viewport, verify:

- No horizontal overflow.
- No clipped or overlapping text and controls.
- Correct gallery column count.
- Minimum 44px touch targets on coarse/narrow contexts.
- Save, upload fallback, semantic search, Shortcut setup, Sync Devices, collection opening, back navigation, and modal behavior remain available.
- Console contains no new application errors.

## Acceptance Criteria

- A 1512px or 1728px MacBook viewport no longer looks constrained to a narrow central column.
- The main shell occupies approximately 94% of the screen until the 1680px cap.
- Collection cards render in three columns at appropriate MacBook widths.
- The page remains readable rather than simply stretching all text.
- The app works without horizontal overflow or interaction regressions down to 320px.
- Existing ReelMind design tokens, hero content, save flow, syncing, Shortcut setup, semantic search, and collection behavior are preserved.
