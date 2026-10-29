# Meta Feed Redesign — Implementation Plan

**Goal:** Replace the warm "dashboard" UI with direction D from the design canvas: a Meta-style (Instagram/Facebook family) light interface whose home is a **Recent saves** row followed by the **entire library, collection by collection**.

**Source of truth for the look:** the "D · Meta feed" artboards (desktop home + phone home) on the ReelMind Redesign canvas.

**Starting point:** `master` at `bae70fc` (queued ingestion merged). Saving returns a job (`202`) that the client polls; collections come from `/api/collections` with 3 preview reels each; `/api/collections/{id}/reels` returns up to 50 reels.

---

## 1. What changes for the user

| Today | After |
| --- | --- |
| Hero copy, stats bar ("Recall Hits", "Top Collection"), utility cards, footer | Gone. The page opens straight onto the library. |
| Separate save box (hero) and search box (library header) | One **omnibox** in the top bar: a link → **Save**, anything else → **Search**. Upload button beside it. |
| Save button shows fake stages ("Downloading stream…") while blocking the form until the job finishes | Save returns immediately; the reel appears as a **pending tile** at the front of Recent saves (Queued → Analyzing → done / failed). You can keep saving and browsing. Pending jobs survive a reload. |
| Collection cards → click → reel grid for one collection | **Recent saves** row (newest reels, horizontally scrollable), then **every collection as a section showing all of its reels**. Desktop sidebar jumps to a collection. |
| Reel modal with GCS paths and ingest status | Reel detail dialog (desktop) / full-screen sheet (phone): summary, takeaways, resources, caption, Watch original, Delete. No storage internals. |
| Shortcut setup card + Sync Devices modal | One **Devices** sheet: open on another device (QR + link), import a sync link, iPhone Shortcut setup. |
| Tailwind + Material Symbols from CDNs at runtime | Plain CSS (`styles.css`) and inline SVG icons. No runtime CDN dependency, so the iOS app also styles correctly offline. |

## 2. Constraints

- **Keep every capability:** save URL, upload fallback (also retrying a failed URL with a file), semantic search, regroup collections, reel detail, delete, sync link/QR, import sync link, Supabase-session import, iPhone Shortcut info, health warning.
- **Auth unchanged:** sync-token headers first, else the Supabase session (anonymous sign-in when none). Same localStorage keys and URL params, so existing synced devices keep working.
- **API contract unchanged** except one additive param (`offset`, §4).
- **Accessibility (PRODUCT.md):** WCAG AA contrast, real buttons/links, labelled inputs, visible focus, `role="dialog"` + Escape + focus restore, `aria-live` for save status, works from 320px, reduced motion respected.
- **iOS:** safe-area insets top/bottom, 16px inputs on phones (no auto-zoom), 44px touch targets.

## 3. Visual system (D)

- Ground `#f0f2f5`, surfaces `#ffffff`, ink `#1c1e21`, muted `#65676b` (5.7:1 on white), hairline `#dadde1`, chip `#e4e6eb`, accent `#0866ff` (white text 4.6:1), link/active `#0064e0`, accent tint `#e7f0ff`, danger `#c42b1c`.
- System font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial`), so it renders natively on iPhone and loads no web font.
- Cards: white, 12px radius, `0 1px 2px rgb(0 0 0 / .1)`; pills for search/buttons; reel tiles 9:16 (desktop, title under tile) and 3:4 in a tight 3-column grid (phone, Instagram-profile style, title in `aria-label` only).
- **Layout:** sticky top bar. ≥ 960px: left sidebar (Recent saves, collection jump list, Regroup) + main column. < 960px: no sidebar; a fixed bottom tab bar (Home, Search, Save, Devices). The phone top bar keeps brand + Save button, and the omnibox sits as the first row of the page.
- Blue ring on a recent tile = saved in the last 7 days and not yet opened on this device (opened IDs kept in localStorage, capped at 500).
- Branding stays ReelMind ("reelmind" wordmark + play-dot mark). No Meta logos or assets.

## 4. Data flow

**On load** (after auth resolves), in parallel:
1. `GET /api/reels/count` and `GET /api/collections` (existing `fetchLibraryOverview`).
2. `GET /api/reels` → the newest 50 reels → the Recent saves row.
3. `GET /api/health` → banner only when `ok` is false.

**Full collection contents.** Each collection section renders immediately with the 3 preview reels it already has. When the section comes within ~800px of the viewport (IntersectionObserver; immediate if unavailable), it fetches `GET /api/collections/{id}/reels?limit=24&offset=0`, then **Show more** pages with `offset`. This keeps the whole library one scroll away without loading every reel up front.

- **Backend change:** add `offset: int = Query(0, ge=0)` to `/api/collections/{collection_id}/reels`, pass it to `ReelRepository.list_collection_reels(..., offset)`, add `r.id` as an order tiebreak so pages are stable. Update `test_library_queries.py`.
- **Collection IDs change on every recluster** (`replace_collections` deletes and reinserts). Sections are keyed by ID, so a refreshed overview remounts them. If a section's fetch returns 0 reels while `reel_count > 0`, the ID went stale: ask for one overview refresh (at most once per ID).
- Collection order: newest reel first (kept from `CollectionGallery.sortByLatestReel`, moved to `library.ts`).
- If there are reels but no collections, show an "All reels" grid from the recent list as a fallback.

**Saving** (`useIngestQueue` hook):
1. Classify the omnibox text (`omnibox.ts`): an `http(s)://` link or a bare instagram.com / instagr.am / youtube.com / youtu.be link → save. Empty → disabled. Anything else → search.
2. Add an optimistic pending item ("Sending…" or "Uploading…") and call `saveReel(url, files)`.
   - Duplicate → drop the pending item, toast "Already in your library" with a **View** action that opens the reel.
   - Job → the pending item tracks `job.id`.
   - HTTP error → drop the item, error toast.
3. One polling loop every 2.5s calls `fetchJob` for each queued/processing job.
   - Succeeded → remove the item, refresh recent + overview now and again after 10s (the worker reclusters *after* marking the job done), toast "Saved".
   - Failed → keep a failed tile with the error, plus **Add file** (picker → `saveReel(url, files)`, which uses the backend's staged-upload fallback) and **Dismiss**.
4. Pending items persist in localStorage (`reel_search_pending_jobs`). They're pruned after 24h and resumed on load.

**Search:** `POST /api/search` (limit 30). Results replace the library view with "Results for "…"", a Clear button and tiles showing match %. Clearing returns to the library.

**Delete:** confirm, `DELETE /api/reels/{id}`, hide the ID locally everywhere at once, then refresh recent + overview now and after 10s.

**Hard-coded URLs:** the Shortcut endpoint becomes `${VITE_API_BASE_URL}/api/reels/shortcut` (same-origin in dev) instead of a hard-coded host. The out-of-app sync-link base (used from Capacitor/localhost) becomes one `PUBLIC_APP_URL` constant matching `_FRONTEND_URL` in `cloudbuild.yaml`.

## 5. Files

Flat in `frontend/src/`, matching the current structure.

| File | Role |
| --- | --- |
| `App.tsx` (rewrite) | Composition and top-level state: overview, recent, search, selected reel, sheets, toasts, hidden IDs |
| `useSession.ts` (new) | Auth init moved verbatim from App: URL-param import, sync identity, Supabase session, anonymous sign-in, `onAuthStateChange` |
| `useIngestQueue.ts` (new) | Pending jobs, polling, persistence, retry with file |
| `omnibox.ts` (new) | `classifyOmnibox(text)` |
| `library.ts` (new) | `sortByLatestReel`, `isFreshUnseen`, seen-ID store, reel display helpers (`reelTitle`, `platformName`, parse summary JSON fields) |
| `sync.ts` (new) | `parseSyncInput`, `buildSyncLink`, `shortcutEndpoint`, `PUBLIC_APP_URL` |
| `Icon.tsx` (new) | Inline stroke SVG icon set (replaces Material Symbols) |
| `TopBar.tsx` (includes the omnibox), `Sidebar.tsx`, `BottomNav.tsx` (new) | Chrome |
| `RecentSaves.tsx`, `ReelTile.tsx`, `CollectionSection.tsx`, `SearchResults.tsx` (new) | Feed |
| `ReelDetail.tsx`, `SaveSheet.tsx`, `DevicesSheet.tsx`, `Sheet.tsx`, `Toasts.tsx` (new) | Overlays; `SaveSheet` is the phone-friendly save flow (link + paste + upload) behind the Save buttons |
| `ThumbnailImage.tsx` (update) | Fallback becomes an SVG placeholder |
| `CollectionGallery.tsx` + test (delete) | Replaced by `CollectionSection` |
| `api.ts` (update) | `fetchRecentReels()`; `fetchCollectionReels(id, {limit, offset})`; `searchReels` limit param already exists |
| `styles.css` (rewrite) | Tokens + all component CSS |
| `index.html` (update) | Drop Tailwind CDN, its config, the fonts and inline styles; title "ReelMind"; `theme-color` `#ffffff` |
| `public/manifest.webmanifest` (update) | Name ReelMind, colours |
| Backend `main.py`, `services/db.py`, `tests/test_library_queries.py` | `offset` param |
| `DESIGN.md`, `PRODUCT.md`, `CLAUDE.md` | Describe the new design; PRODUCT principle 5 changes from "collections first, reels after selection" to "recent first, then the whole library by collection, loaded as you scroll" |

## 6. Tests

All `vitest` in node with `renderToStaticMarkup`, matching the existing style.

- `omnibox.test.ts`: links (with and without scheme, Shorts, youtu.be), plain text, whitespace.
- `library.test.ts`: newest-first collection ordering (moved test), fresh/unseen ring logic, JSON field parsing fallbacks.
- `sync.test.ts`: sync-link parsing (user_id+sync_token, bare host, raw `v1.` token error, refresh-token links), shortcut endpoint from API base.
- `useIngestQueue` pure helpers: prune and serialize persisted jobs.
- `CollectionSection.test.tsx`: header (name, domain, count), one tile per preview reel with `aria-label` and lazy images, Show more only when more remain.
- `RecentSaves.test.tsx`: pending/failed tiles render before saved reels, failed tile exposes Add file / Dismiss.
- `api.test.ts`: `fetchCollectionReels` with `limit`/`offset` query.
- `responsiveLayout.test.ts`: rewritten as contracts for the new CSS (sidebar ≥ 960px, bottom nav below, 3-col phone grid, safe-area insets, reduced motion, 16px phone inputs).
- Backend: `offset` reaches the SQL with stable ordering; endpoint validates `offset >= 0`.

**Verification before push:**
- `npm run test` and `npm run build` (tsc + vite) in `frontend/`, and `pytest` in `backend/`.
- Run the dev server with `/api/*` mocked in Playwright (sync identity seeded in localStorage so Supabase isn't contacted). Screenshot desktop 1440px and phone 390px, plus the detail sheet, the Devices sheet and search results.

## 7. Out of scope / follow-ups

- Dark mode.
- A server-side list of in-flight jobs (pending tiles are per device; a save from the iPhone Shortcut shows up when it lands).
- QR code generation still goes through `api.qrserver.com`, which sends the sync link (a 1-year credential) to a third party. Generating the QR locally needs a small dependency; flag to the owner.
- `origin/new-project-refs` edits the same hard-coded URLs in `App.tsx`; after this lands, that branch only needs its `.env.ios`/docs changes.
