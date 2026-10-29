# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal semantic search engine for Instagram reels (also supports YouTube and direct upload). A reel URL or video file is downloaded/staged, embedded with Vertex AI `gemini-embedding-2`, stored as a pgvector row in Supabase Postgres, and later retrieved via natural-language search. See [README.md](README.md) for the full setup story.

## Commands

Backend (FastAPI, `backend/`):
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000   # run dev server
pytest                                       # run all tests
pytest tests/test_url_utils.py -k test_name  # run a single test
```

Frontend (React + TypeScript + Vite, `frontend/`):
```bash
npm install
npm run dev       # dev server on :5173
npm run build     # tsc -b && vite build
npm run test      # vitest run
npm run build:ios # iOS-mode build; `npm run cap:build` also runs `cap sync`
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs backend `pytest` on Python 3.11 (without `DATABASE_URL`, so DB-backed tests skip or hit the 503 path) and frontend `npm run test`, `npm run build`, and `npm audit --omit=dev --audit-level=high` on Node 22 (the Supabase client needs native WebSocket).

There is no root-level build/lint/test command — each half of the app is run from its own directory.

## Architecture

Two independently deployed services, no shared code or monorepo tooling:

- `backend/app/main.py` — single FastAPI app, all routes live here. Public API: `/api/health`, `/api/reels` (GET list, POST save, DELETE `/{id}`), `/api/reels/count`, `/api/reels/{id}/thumbnail`, `/api/reels/shortcut`, `/api/jobs/{id}`, `/api/collections` (+ `/{id}/reels?limit&offset`, `POST /recluster`), `/api/sync-token`, `/api/search`, `/api/thumbnails/{filename}`. The only non-`/api` route is `POST /internal/ingest/{job_id}`, the Cloud Tasks worker target. Everything is scoped by `user_id`.
- **Auth** (`services/auth.py`): `Depends(get_current_user_id)` accepts either a Supabase access token (`Authorization: Bearer`, validated by calling Supabase `/auth/v1/user`) or a sync-token pair (`X-Reel-User-Id` + `X-Reel-Sync-Token`). Sync tokens are HMAC-SHA256 over `user_id.expires_at` keyed with `SHORTCUT_TOKEN`, issued by `POST /api/sync-token` (1 year) and used by the iOS app/Shortcut. `/api/reels/shortcut` takes `url`/`token`/`user_id` form fields and accepts either the global `SHORTCUT_TOKEN` or a valid sync token. The worker endpoint is separate: it verifies a Cloud Tasks OIDC token (`task_queue.verify_worker_request`) and returns 404 when Cloud Tasks isn't configured.
- `backend/app/services/` — one module per concern. `main.py` instantiates module-level singletons (`repository`, `embedder`, `storage_client`, `task_queue`), not per-request `Depends` factories:
  - `downloader.py` — wraps `yt-dlp` to pull video + metadata from Instagram/YouTube URLs.
  - `embedder.py` — wraps `google-genai` (Vertex AI): `gemini-embedding-2` video/text embeddings, a secondary Gemini call for title/summary/actionable-items/resources (`generate_summary`), and `classify_collections` (Gemini structured output that groups reels into topic collections under a fixed set of domains).
  - `storage.py` — GCS uploads/downloads/deletes; returns `gs://` URIs read by Vertex. Also stores thumbnails under `thumbnails/`.
  - `db.py` — raw `psycopg` + `psycopg_pool` (no ORM) against Supabase Postgres; `ReelRepository` does hand-written SQL: reels, ingest jobs, collections, and the pgvector search (`match_reels` SQL function).
  - `ingest.py` — the ingestion pipeline and job lifecycle (see below).
  - `task_queue.py` — `CloudTasksQueue.enqueue` and `verify_worker_request`.
  - `collections.py` — heuristic collection builder (`build_collections`); uses the Gemini grouping when available and falls back to TF-IDF clustering.
  - `thumbnail.py` — ffmpeg-based thumbnail extraction. `url_utils.py` — canonicalizes Instagram/YouTube URLs for dedup.
- `backend/app/config.py` — single `Settings` (pydantic-settings) object loaded once via `get_settings()`/`lru_cache`; `has_*` properties drive `/api/health`'s missing-config report, and `uses_cloud_tasks` decides queue vs. in-process ingestion.
- **Save flow is asynchronous.** `POST /api/reels` only: dedups by canonical URL (existing reel → `200` with `duplicate: true`), stages any uploaded files in GCS, inserts an `ingest_jobs` row (a unique partial index allows one queued/processing job per user+canonical URL; a repeat save returns the in-flight job), enqueues it, and returns `202` with a `JobOut`. The heavy work happens in `ingest.run_ingest_job`:
  - `claim_job` moves the job to `processing` with a 1800s lease (must outlast the 1500s Cloud Tasks dispatch deadline). → download via yt-dlp (falls back to the staged upload if download fails) → upload to GCS → embed video and generate the summary in parallel (the summary is optional and swallows errors) → thumbnail (best effort) → `create_reel` → `complete_job` → `after_save` hook re-clusters the user's collections (best effort).
  - Failure: attempts < `INGEST_MAX_ATTEMPTS` (default 3) → `requeue_job` and re-raise so Cloud Tasks retries with backoff; otherwise `fail_job`. Job errors are user-visible, so only `MediaDownloadError` text is exposed; everything else becomes a generic message (details stay in logs). Blobs uploaded by a failed attempt are deleted.
  - With Cloud Tasks configured (`TASKS_QUEUE`, `TASKS_WORKER_URL`, `TASKS_INVOKER_SERVICE_ACCOUNT`, `GOOGLE_CLOUD_PROJECT`) the API enqueues a task that POSTs back to `/internal/ingest/{job_id}` on the same service. Otherwise (local dev) it runs `run_ingest_job_with_retries` via FastAPI `BackgroundTasks`.
  - Multi-file uploads get GCS URIs joined as a JSON array in `gcs_uri`.
- **Collections**: reels are grouped into `reel_collections` (with a `domain` from a fixed list, name, description, keywords) via `reel_collection_items`. `recluster_user_collections` rebuilds all of a user's collections from scratch; it runs after each successful ingest and each delete, from `POST /api/collections/recluster`, and lazily from `GET /api/collections` when there are none or any lacks a domain.
- **Frontend** (`frontend/src/`, no router; look described in [DESIGN.md](DESIGN.md)):
  - `App.tsx` composes the page and owns top-level state. The home screen is `RecentSaves` (newest reels from `GET /api/reels`, with in-flight saves first), then one `CollectionSection` per collection. Each section shows its 3 preview reels and lazily pages in the rest (`/api/collections/{id}/reels?limit=24&offset=…`) when it nears the viewport.
  - `TopBar` holds the omnibox (`omnibox.ts` classifies input: a link saves, anything else searches). The other surfaces are `Sidebar` (≥960px), `BottomNav` (<960px) and the `ReelDetail`, `SaveSheet` and `DevicesSheet` overlays (all built on `Sheet`).
  - `useSession.ts` resolves the identity: sync-token headers first, else the Supabase session, signing in anonymously when there is none. Bump `sessionKey` to reload the library.
  - `useIngestQueue.ts` owns saving. It shows a pending tile immediately, polls `GET /api/jobs/{id}` every 2.5s, persists in-flight jobs in localStorage (`reel_search_pending_jobs`) and offers retry-with-file on failure.
  - `api.ts` is the thin fetch wrapper that attaches auth headers. `sync.ts` holds sync-link parsing and building, and `PUBLIC_APP_URL`, which must match `_FRONTEND_URL` in `cloudbuild.yaml`. `library.ts` has display helpers. `supabaseClient.ts` is the only place the Supabase JS client is constructed.
  - Styling is plain CSS in `styles.css` with inline SVG icons (`Icon.tsx`); there is no Tailwind and no runtime CDN.
  - Collection IDs change on every recluster, so sections are keyed by ID and a section that finds its ID gone asks for one library refresh.
- **iOS app**: `frontend/ios/` is a Capacitor project wrapping the same web build. `npm run build:ios` builds in `ios` mode (`frontend/.env.ios`); `npm run cap:build` builds and syncs; `npm run cap:open` opens Xcode. The backend CORS list includes `capacitor://localhost` for it.
- `supabase/migrations/` — schema history: `reels` + pgvector, `user_id` + RLS, tags (later replaced by collections), `reel_collections.domain`, a `(user_id, created_at)` index on `reels`, and `ingest_jobs`. Applied by hand against the Supabase project (no migration runner wired up) — a new migration must be applied before the code that needs it is deployed (e.g. `ingest_jobs` for the queue).
- Other: `backend/backfill_thumbnails.py` and `backend/migrate_reels.py` are one-off maintenance scripts. `docs/superpowers/` holds design specs and plans for the collection-first library and responsive layout; `PRODUCT.md`/`DESIGN.md` hold product and design direction.

## Deployment

Both services run on Cloud Run in project `reel-search-28734`, region `us-central1` (chosen to match the GCS bucket and Vertex AI location, both `us`):
- `reel-search-api` — backend, secrets (`DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, the Instagram cookie file) injected from Secret Manager, runs as the dedicated `reel-search-run` service account (scoped to the one GCS bucket + `aiplatform.user`, not the broad default compute SA). It also acts as its own ingest worker: deployed with `--timeout=1500`, and `cloudbuild.yaml` sets `TASKS_QUEUE` (`reel-ingest`), `TASKS_LOCATION`, `TASKS_WORKER_URL` (the API's own URL) and `TASKS_INVOKER_SERVICE_ACCOUNT` on every deploy. The queue itself and the service account's permissions (enqueue tasks on `reel-ingest`, mint OIDC tokens for itself, invoke the Cloud Run service) are infrastructure outside this repo — if saves return 503 "Could not queue", check those first. `cloudbuild.yaml` does not set `SHORTCUT_TOKEN` (required for sync tokens and the iOS Shortcut); without it `/api/sync-token` returns 503.
- `reel-search-frontend` — nginx serving the Vite build; `VITE_API_BASE_URL`/`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are baked in at build time (see `cloudbuild.yaml` substitutions), not runtime-configurable.

CI/CD: [cloudbuild.yaml](cloudbuild.yaml) builds and deploys both services on every push to `master`, via a Cloud Build trigger (`reel-search-deploy`) connected to `github.com/wofwoff/reel-search` through a Cloud Build GitHub connection (`reel-search-github`, us-central1, GitHub App-based/2nd-gen). The trigger runs as a dedicated `reel-search-builder` service account, not the default Cloud Build SA. If you change `frontend`'s required build-time env vars, update the `_API_URL`/`_SUPABASE_URL`/`_SUPABASE_ANON_KEY` substitutions in `cloudbuild.yaml` — a build that silently omits one will deploy a frontend pointing at `localhost`, and Cloud Run won't flag it as unhealthy since it's a client-side break.

The connection/trigger were found deleted (or never actually created) on 2026-07-01 despite being documented here — `git push origin master` was silently a no-op for deploys for an unknown period. If deploys stop happening on push, check `gcloud builds triggers list --region=us-central1` first before assuming the app is just broken.

`FRONTEND_ORIGIN` (set on `reel-search-api`) must exactly match the origin the browser actually loads the frontend from — Cloud Run services have two equivalent URLs (the human-readable `https://reel-search-frontend-403410843888.us-central1.run.app` and a hash-based `https://reel-search-frontend-<hash>-uc.a.run.app`), and they are different CORS origins even though they route to the same service. `_FRONTEND_URL` in `cloudbuild.yaml` is correct (project-number form); if this ever drifts (e.g. from a manual `gcloud run deploy`/`services update` using the wrong URL), every browser fetch from the real site fails with a CORS error while `curl`/health checks still look fine — this is exactly what caused a multi-hour "why can't I see my reels" debugging session on 2026-07-01.

Both Cloud Run services are set to track `LATEST` traffic (`gcloud run services update-traffic <service> --to-latest`), so every new revision auto-promotes to 100% traffic. If you ever run `gcloud run services update-traffic --to-revisions=<name>=100` to pin traffic to a specific revision (e.g. for a manual rollback), the service **stops auto-promoting** — every subsequent deploy (including CI ones) creates a new revision at 0% traffic until you explicitly run `--to-latest` again. This bit multiple deploys in a row on 2026-07-01 before being caught.

## Known issue

`backend/instagram-cookies.txt` contains a real Instagram session and must never be committed — it's gitignored/dockerignored and loaded from the `reel-search-ig-cookies` Secret Manager secret as a mounted volume in production (`YT_DLP_COOKIE_FILE=/secrets/instagram-cookies.txt`). Locally, keep your own copy on disk at that path (see `backend/instagram-cookies.txt.example`).
