# Reel Search

A personal semantic search engine for Instagram reels. Paste a reel URL or upload a video fallback, embed the reel with Vertex AI `gemini-embedding-2`, store it in Supabase pgvector, and search your saved library with natural language. Saved reels are also grouped automatically into topic collections.

## Stack

- Frontend: React + TypeScript + Vite PWA, plus a Capacitor iOS wrapper (`frontend/ios`)
- Backend: FastAPI
- Embeddings: Vertex AI `gemini-embedding-2`
- Summaries and collection grouping: Gemini on Vertex AI
- Vector DB: Supabase Postgres + pgvector
- URL ingest: `yt-dlp`
- Media staging: Google Cloud Storage
- Ingestion queue: Google Cloud Tasks (optional locally)

## How saving works

`POST /api/reels` stages any uploaded files, records an `ingest_jobs` row and returns `202` with a job. A worker then downloads the media, uploads it to GCS, embeds it, generates a summary and thumbnail, saves the reel, and refreshes your collections. The frontend polls `GET /api/jobs/{id}` until the job succeeds or fails.

- In production the API enqueues a Cloud Tasks task that calls back to `POST /internal/ingest/{job_id}` on the same service. Failed attempts are retried (up to `INGEST_MAX_ATTEMPTS`, default 3).
- Locally, with no `TASKS_QUEUE` set, the job runs in-process in a background task with the same retry behavior.

## Setup

1. Create a Supabase project and apply every SQL file in `supabase/migrations/` in filename order. There is no migration runner, so apply them by hand (for example in the Supabase SQL editor). `20261028120000_create_ingest_jobs.sql` must be applied before running the queue-based save flow.
2. Create a GCS bucket in the same GCP project you use for Vertex AI and apply the 1-day auto-delete lifecycle policy:

```bash
gcloud storage buckets update gs://your-bucket --lifecycle-file=gcs-lifecycle.json
```
3. Enable the Gemini Enterprise Agent Platform / Vertex AI API and authenticate locally:

```bash
gcloud auth application-default login
```

4. Copy env examples:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

5. Fill in backend env values:

```bash
DATABASE_URL=postgresql://...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
GOOGLE_CLOUD_PROJECT=your-project
GOOGLE_CLOUD_LOCATION=us
REEL_SEARCH_GCS_BUCKET=your-bucket
```

Optional backend env values:

| Variable | Purpose |
| --- | --- |
| `SHORTCUT_TOKEN` | Secret used to sign sync tokens (`POST /api/sync-token`). `POST /api/reels/shortcut` accepts only a sync token, not this secret itself. Required for the iOS app / Shortcut sync. |
| `TASKS_QUEUE`, `TASKS_LOCATION`, `TASKS_WORKER_URL`, `TASKS_INVOKER_SERVICE_ACCOUNT` | Enable Cloud Tasks ingestion. All of `TASKS_QUEUE`, `TASKS_WORKER_URL`, `TASKS_INVOKER_SERVICE_ACCOUNT` and `GOOGLE_CLOUD_PROJECT` must be set; otherwise jobs run in-process. |
| `INGEST_MAX_ATTEMPTS` | Attempts per job before it is marked failed (default 3). |
| `YT_DLP_COOKIE_FILE`, `YT_DLP_COOKIES_FROM_BROWSER` | Cookies for restricted Instagram reels. |
| `FRONTEND_ORIGIN` | Comma-separated allowed CORS origins (default `http://localhost:5173`). |

## Run Locally

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Tests

```bash
cd backend && pip install -r requirements-dev.txt && pytest
cd frontend && npm run test
```

CI (`.github/workflows/ci.yml`) runs both on every pull request and push to `master`. The backend job runs without `DATABASE_URL`, so DB-backed tests are skipped or exercise the 503 path.

## iOS app

`frontend/ios` is a Capacitor project that wraps the web build. It authenticates with a sync token instead of a browser session.

```bash
cd frontend
npm run cap:build   # build in ios mode and sync into the Xcode project
npm run cap:open    # open in Xcode
```

## Deployment

Pushes to `master` build and deploy both services to Cloud Run through `cloudbuild.yaml`. See `CLAUDE.md` for deployment details and known pitfalls.

## Notes

- Instagram URL ingestion can fail depending on Instagram access restrictions. The upload fallback keeps the core pipeline testable, and a URL save will use files you uploaded alongside it if the download fails.
- The app stores metadata, original URLs, and embeddings; the original media is staged in GCS under `reels/` and removed by the 1-day lifecycle policy, and it is not served back. Thumbnails are kept under `thumbnails/` and served through the API.
- `gemini-embedding-2` supports configurable lower dimensions. This MVP uses 1536 dimensions to balance quality and pgvector storage.
