# ReelMind Design System

## Theme

"Meta feed": the familiar light look of Meta's apps (Instagram and Facebook), applied to a personal reel library. A grey ground with white cards, one blue accent, pill-shaped controls and tall reel tiles. The ReelMind name and play-dot mark stay; never use Meta logos or assets.

## Color

All tokens live at the top of `frontend/src/styles.css`.

- Ground: `#f0f2f5`
- Surface (cards, top bar, sheets): `#ffffff`
- Ink: `#1c1e21`
- Muted text: `#65676b` (5.7:1 on white)
- Hairline: `#dadde1`
- Chip / secondary button: `#e4e6eb` (hover `#d8dadf`)
- Accent (primary buttons, brand, active tab): `#0866ff`, white text on it (4.6:1)
- Link / active text: `#0064e0`
- Accent tint (selected rows, chips, pending tiles): `#e7f0ff`
- Danger: `#c42b1c` on `#fdecea`

The accent marks actions, the active state and "new" only, never decoration. Text meets WCAG AA.

## Typography

The system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial`), so the app looks native on iPhone and loads no web font. Body text is 15px; inputs are 16px on phones so iOS doesn't zoom. Headings are bold: 18px for card titles, 22px for "Library", 24px for the reel title.

## Shape and elevation

- Cards: 12px radius, `0 1px 2px rgb(0 0 0 / .1)`, no border.
- Search and the in-box action button are full pills; buttons are 8px-radius rectangles.
- Reel tiles are 9:16 with a 10px radius. On phones, collection grids switch to edge-to-edge 3:4 tiles with 2px gaps, like an Instagram profile.
- Sheets and dialogs use the raised shadow; nothing else does.

## Layout

- **Top bar** (sticky): wordmark, the omnibox (a link saves it, anything else searches) and Save reel. On desktop it also has the Upload and Devices buttons.
- **Below 640px:** cards run edge to edge with an 8px grey gap between them. The omnibox wraps under the wordmark, and a fixed bottom tab bar holds Home, Search, Save and Devices.
- **640–959px:** cards float on the grey ground; still no sidebar.
- **960px and up:** a sticky 280px sidebar (Recent saves, every collection with its cover and count, Regroup, Devices) next to the feed; no tab bar. Content caps at 1480px.
- **Home order:** Recent saves (a horizontal row; saves in progress first), then the whole library, one card per collection holding every reel.
- iOS safe-area insets pad the top bar, tab bar and sheets.

## Components

- **Reel tile:** thumbnail, then a two-line title (hidden in the phone grid, where the title is only in the `aria-label`). A blue dot means the reel was saved in the last 7 days and not yet opened on this device. Search results add a match percentage.
- **Pending tile:** tinted blue with a spinner and its status (Sending, Uploading, Queued, Analyzing). A failed save turns red, shows the error (3 lines max) and offers Add file / dismiss.
- **Sheets:** bottom sheets on phones and centered dialogs from 640px. Each has a title and a close button, closes on Escape or a backdrop click, traps focus and returns focus to where it came from.
- **Toasts:** dark, bottom-center, short; at most one action ("View").

## Motion

150–250ms with an ease-out curve; only for hover, press, sheets appearing and loading. `prefers-reduced-motion` removes it all.

## Content model

Each collection shows its broad domain, its specific topic, its reel count and a short description (from tablet width up). Then come all of its reels, loaded 24 at a time as the section nears the viewport.
