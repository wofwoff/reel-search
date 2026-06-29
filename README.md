# Reel Search

A personal semantic search engine for Instagram reels. Paste a reel URL or upload a video fallback, embed the reel with Vertex AI `gemini-embedding-2`, store it in Supabase pgvector, and search your saved library with natural language.

## Stack

- Frontend: React + TypeScript + Vite PWA
- Backend: FastAPI
- Embeddings: Vertex AI `gemini-embedding-2`
- Vector DB: Supabase Postgres + pgvector
- URL ingest: `yt-dlp`
- Media staging: Google Cloud Storage

## Setup

1. Create a Supabase project and run the SQL in `supabase/migrations/202606290001_create_reels.sql`.
2. Create a GCS bucket in the same GCP project you use for Vertex AI.
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
GOOGLE_CLOUD_PROJECT=your-project
GOOGLE_CLOUD_LOCATION=us
REEL_SEARCH_GCS_BUCKET=your-bucket
```

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

## Notes

- Instagram URL ingestion can fail depending on Instagram access restrictions. The upload fallback keeps the core pipeline testable.
- The app stores metadata, original URLs, and embeddings; it does not rehost or serve saved videos.
- `gemini-embedding-2` supports configurable lower dimensions. This MVP uses 1536 dimensions to balance quality and pgvector storage.
