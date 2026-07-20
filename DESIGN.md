# ReelMind Design System

## Theme

Warm, restrained product UI. A true content surface with terracotta actions and muted green semantic accents. The interface uses generous whitespace and editorial hierarchy without turning the product into a marketing page.

## Color

- Background: `#fff8f6`
- Primary ink: `#221a16`
- Primary action: `#94492e`
- Primary container: `#ff9e7d`
- Secondary surface: `#fff1ec`
- Elevated surface: `#ffffff`
- Border: `#dac1ba`
- Muted text: `#54433d`
- Positive/domain accent: `#3a6758`
- Error: `#ba1a1a`

Text contrast must meet WCAG AA. The primary color is reserved for actions, active states, and meaningful emphasis.

## Typography

Use Outfit across headings, body copy, labels, and controls. Keep product headings fixed and responsive by breakpoint rather than fluid. Body copy is 16px with approximately 1.6 line height and a maximum readable line length of 65–75 characters.

## Shape and Elevation

- Collection and utility cards: 16px maximum radius.
- Buttons and compact filters: full pill when the control benefits from it.
- Prefer a subtle border or a compact shadow, never both as decoration.
- Avoid nested cards.

## Layout

- Adaptive application shell: approximately 94% viewport width with responsive 16–48px gutters and a 1680px cap.
- Reading copy remains independently capped at 65–75 characters.
- Hero: centered text and save form; no oversized logo artwork.
- Utility tools: two-column row on desktop, single column on mobile.
- Collection gallery: one column on phones, two on tablets/compact desktop, and three on MacBook/large desktop where cards remain at least 340px wide.
- Reel results/detail grid: auto-fit from 280px card width, up to four columns on large displays.
- Each collection card previews at most three reel thumbnails.

## Interaction and Motion

- Most transitions run 150–250ms with a smooth ease-out curve.
- Motion communicates hover, focus, loading, expansion, or selection only.
- Every animation has a reduced-motion alternative.
- Collection cards, search, save, sync, Shortcut setup, and delete actions remain keyboard accessible.

## Content Model

Every collection displays a broad domain, a specific topic name, a short description of what the reels discuss, its full reel count, and two or three lightweight thumbnail previews.
