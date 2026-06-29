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
```

There is no root-level build/lint/test command — each half of the app is run from its own directory.

## Architecture

Two independently deployed services, no shared code or monorepo tooling:

- `backend/app/main.py` — single FastAPI app, all routes live here (`/api/health`, `/api/reels` GET/POST/DELETE, `/api/search`). Auth is a `Depends(get_current_user_id)` that reads the Supabase JWT (see `services/auth.py`) — there is no session/cookie auth, every request must carry a Supabase access token and all queries are scoped by `user_id`.
- `backend/app/services/` — one module per external dependency, instantiated per-request via FastAPI `Depends` factories in `main.py` (not a DI container):
  - `downloader.py` — wraps `yt-dlp` to pull video + metadata from Instagram/YouTube URLs.
  - `embedder.py` — wraps `google-genai` (Vertex AI) for both the `gemini-embedding-2` video/text embeddings and a secondary Gemini call that generates a title/summary/actionable-items/resources blob for each saved reel.
  - `storage.py` — uploads media to GCS, returns a `gs://` URI that's later read by Vertex.
  - `db.py` — raw `psycopg` (no ORM) against Supabase Postgres; `ReelRepository` does hand-written SQL including the pgvector similarity query in `search`.
  - `url_utils.py` — canonicalizes Instagram/YouTube URLs for dedup.
- `backend/app/config.py` — single `Settings` (pydantic-settings) object loaded once via `get_settings()`/`lru_cache`; every required external integration (DB, Vertex, GCS) has a `has_*` property used by `/api/health` to report what's missing.
- The save flow (`POST /api/reels`) is the core pipeline: dedup by canonical URL → download or accept upload → upload to GCS → embed video → best-effort generate summary (swallows errors, summary is optional) → write a row. Multi-file uploads get GCS URIs joined as a JSON array in `gcs_uri`.
- `frontend/src/App.tsx` is the entire UI (one component tree, no router) — list, save form, and search live together. `frontend/src/api.ts` is a thin fetch wrapper that attaches the Supabase session token. `frontend/src/supabaseClient.ts` is the only place the Supabase JS client is constructed.
- `supabase/migrations/` — the schema (`reels` table + pgvector index) and a later migration that added `user_id` + RLS to separate user data; these are applied by hand against the Supabase project (no migration runner wired up).

## Deployment

`backend/Dockerfile` and `frontend/Dockerfile` (nginx serving the Vite `dist/`) are Cloud Run-shaped (`PORT`/`8080`, no other Cloud Run-specific files), but **there is no IaC or CI for deployment in this repo** — no `cloudbuild.yaml`, no GitHub Actions workflow, no deploy script. Deploys are presumably manual `gcloud run deploy` invocations; treat any deployment automation as something to set up, not something to find.

## Known issue

`backend/instagram-cookies.txt` contains real `yt-dlp`-exported Instagram session cookies and is committed to git, and the backend `Dockerfile` copies it straight into the image. Treat this as a live credential, not a fixture — don't add more secrets to tracked files, and prefer passing cookies in via env (`YT_DLP_COOKIE_FILE`/`YT_DLP_COOKIES_FROM_BROWSER` in `config.py`) or a mounted secret rather than committing them.
