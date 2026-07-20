# Collection-first library design

## Outcome

ReelMind keeps its current navigation, centered text-led hero, URL/file save controls, stats, semantic search, iPhone Shortcut setup, device syncing, reel details, and deletion behavior. The oversized hero logo shown in the exploratory mockup is excluded.

Below the existing landing content, the flat newest-50 reel wall is replaced with a collection gallery. The archive total reflects every reel accessible to the current library, while collection cards load only the three newest lightweight previews.

## Information model

Collections use two levels of meaning:

- `domain`: a stable broad interest area such as Arts & Creativity, Food & Cooking, Technology, Career & Education, Health & Fitness, Entertainment, Travel & Places, Business & Finance, Lifestyle, or Other.
- `name`: the specific subject or craft, such as Motion Design, Video Editing, Singing, Cooking, Developer Tools, or Job Search.

The categorizer must prioritize what the reel teaches or discusses. Source and enabling-tool terms such as GitHub, repository, Instagram, YouTube, and Claude Code are not collection names unless they are genuinely the subject.

## Data flow

Saving still performs download/upload, embedding, summary generation, persistence, and reclustering. Reclustering sends stored reel titles and summaries to Gemini in one structured batch and receives domain/topic collection groups. Invalid, missing, or duplicate IDs are normalized before database writes; deterministic grouping remains a best-effort fallback if classification is unavailable.

The initial library refresh requests the true count and collection summaries in parallel. Collection summaries contain full counts but at most three recent reel previews. Opening a collection fetches its reel list separately. Semantic search continues to query the full database, so older reels remain retrievable.

## Interface

- Centered hero heading: “Turn scrolls into insights.”
- No large hero logo artwork.
- Existing URL save input and upload fallback remain primary.
- Stats use the true archive count.
- Shortcut Setup and Sync Devices remain visible in a compact two-column utility row.
- Default library state is a responsive collection-card gallery.
- Each card contains two or three thumbnails, domain, topic, description, count, and View collection affordance.
- Search results and an opened collection may show individual reel cards; the default page never renders the newest-50 wall.

## Failure and empty states

Count or collection request failures show the existing error channel without exposing another user’s data. Empty libraries teach the user to save their first reel. Missing thumbnails use the supplied ReelMind brand asset. Gemini classification failure does not fail saving; fallback grouping keeps the library available.

## Verification

Backend tests cover count scope, classification normalization, domain output, preview limits, and collection-detail ownership. Frontend tests cover gallery markup and preview caps. Full backend tests, frontend tests, TypeScript build, responsive browser checks, keyboard focus, reduced motion, and a visual comparison against the approved mockup are required before handoff.
