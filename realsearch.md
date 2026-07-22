# RealSearch (ReelMind) — Complete Project Technical Write-Up

## Executive Overview
**RealSearch** (commercially branded as **ReelMind**) is a high-performance, AI-native semantic search engine and intelligent media repository designed for short-form video content (Instagram Reels, YouTube Shorts, YouTube Videos, and local media uploads). The system bridges the gap between passive social media consumption and active knowledge management. By replacing native bookmarking mechanisms—which rely on unstructured lists and easily forgotten saves—RealSearch automatically ingests, transcribes, structures, and embeds video media using multimodal artificial intelligence. Users can perform natural language semantic queries, explore dynamically clustered craft topic collections, and view concise AI-generated key takeaways without manual tagging.

---

## Domain & Problem Statement

### Domain Context
Short-form video has become a primary medium for educational content, code demonstrations, culinary recipes, design critiques, and fitness guides. However, social platforms optimize for algorithmic feed retention rather than content retrievability. Bookmarked reels quickly accumulate into unsearchable "content graveyards."

### Problem Solved
1. **Inefficient Retrieval**: Standard social media apps offer no full-text or visual search over bookmarked video clips.
2. **Ephemeral Value**: Technical breakdowns and actionable recipes shared in 30-second clips are lost unless transcribed and categorized.
3. **Manual Overhead**: Manual tagging or organizing into custom playlists is tedious and rarely maintained by users.

### Key Value Proposition
RealSearch offers a **one-step ingestion workflow** where users paste a URL or upload a file. The platform processes visual frames, audio tracks, and text captions simultaneously, storing 1536-dimensional multimodal embeddings in a vector database. It converts passive video archives into an interactive, structured digital memory.

---

## Technology Stack

### Frontend & Client Tier
- **UI Framework**: React 19 with TypeScript, built using Vite.
- **Styling System**: Tailwind CSS with custom editorial dark-mode aesthetics ("ReelMind Design System") and Material Symbols/Lucide typography.
- **Native & Cross-Platform Wrap**: Capacitor (`@capacitor/core`, `@capacitor/ios`) for native iOS deployment.
- **Authentication Client**: Supabase JS SDK (`@supabase/supabase-js`) managing JWT sessions and Row-Level Security policies.
- **Unit Testing**: Vitest test runner.

### Backend API Tier
- **Web Framework**: FastAPI (Python 3.11+) served via Uvicorn.
- **Database Driver**: `psycopg` (v3) utilizing hand-crafted, parameterized raw SQL queries for zero-ORM overhead.
- **Validation & Environment**: Pydantic v2 with `pydantic-settings` (configuration cached via `lru_cache`).
- **HTTP Client**: `httpx` for asynchronous external API requests and JWT verification.
- **Media Extraction Engine**: Custom-tuned `yt-dlp` integration supporting Instagram Reels and YouTube video extraction with automated cookie injection fallbacks.

### AI & Vector Engine
- **Multimodal Embedding Model**: Google Vertex AI `gemini-embedding-2` generating 1536-dimensional vectors (sampled at 1 frame per second with full audio track analysis).
- **LLM Synthesis & Clustering**: Google Vertex AI `gemini-3.5-flash` enforcing Pydantic JSON schema constraints for structured summaries, key takeaways, resource link extraction, and topic clustering.

### Database & Infrastructure Tier
- **Relational & Vector Store**: Supabase PostgreSQL with the `pgvector` extension utilizing an HNSW index with cosine distance operators (`vector_cosine_ops`).
- **Media Staging**: Google Cloud Storage (GCS) buckets (`gs://...`) for raw video and image slide staging.
- **DevOps & Cloud Hosting**: Google Cloud Run (`reel-search-api` and `reel-search-frontend`), Google Cloud Build (`cloudbuild.yaml`), and GCP Secret Manager.

| Component | Technology | Purpose |
|---|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind | Responsive Single-Page Application & PWA |
| Native Wrap | Capacitor iOS | Native Mobile Wrapper |
| Backend | FastAPI (Python 3.11), Uvicorn | Async REST API & Ingestion Pipeline |
| Relational DB | Supabase PostgreSQL | Primary Metadata & User Store |
| Vector Engine | `pgvector` (HNSW Index, 1536d) | Cosine Similarity Vector Search |
| Embeddings | Google Vertex AI `gemini-embedding-2` | Multimodal Video & Audio Embedding |
| Summarizer | Google Vertex AI `gemini-3.5-flash` | Structured JSON Summaries & Topic Clustering |
| Scraping | `yt-dlp` | Video/Audio Ingestion from IG & YouTube |
| Media Storage | Google Cloud Storage (GCS) | Blob Storage for Videos & Carousels |

---

## System Architecture & Data Flow

### Complete System Workflow

```
[ User Input: URL / Upload / iOS Shortcut ]
                    │
                    ▼
       FastAPI Backend (/api/reels)
                    │
      ┌─────────────┴─────────────┐
      ▼                           ▼
[ Normalization ]         [ GCS Staging ]
 (Canonical URL)         (Upload Video/Image)
      │                           │
      ├───────────────────────────┘
      ▼
[ Vertex AI: gemini-embedding-2 ] ──► Generates 1536d Multimodal Vector
      │
      ▼
[ Vertex AI: gemini-3.5-flash ]  ──► Generates Structured JSON Summary & Checklist
      │
      ▼
[ Supabase PostgreSQL + pgvector ] ──► Stores metadata, vectors, RLS policies
      │
      ▼
[ Re-clustering Engine ]          ──► Maps reel to Craft Topic & Domain Collections
```

### 1. Ingestion Pipeline (`POST /api/reels`)
1. **URL Normalization**: Cleans and canonicalizes incoming Instagram/YouTube links to eliminate duplicate submission attempts under a user's account.
2. **Media & Metadata Extraction**: `yt-dlp` extracts video/audio tracks, title, creator handle, thumbnail URL, and original caption. Downloads are format-restricted to a maximum height of 720p to optimize bandwidth and speed. Accepts direct multi-file uploads (MP4, MOV, JPG, PNG, WEBP) for carousel posts.
3. **Cloud Storage Staging**: Uploads media binaries to GCS (`gs://<bucket>/reels/...`), obtaining durable storage URIs.
4. **Concurrent Multimodal AI Processing**: Executes `gemini-embedding-2` multimodal embedding (1536-dimensional vector) and `gemini-3.5-flash` structured summary generation in parallel via `asyncio.gather()`, cutting AI processing duration in half.
5. **Persistence & Non-Blocking Re-Clustering**: Writes record into Supabase PostgreSQL and dispatches collection re-clustering as a non-blocking background task (`BackgroundTasks`), returning the save response immediately without blocking the client.

### 2. Semantic Search Lifecycle (`POST /api/search`)
1. **Query Vectorization**: Converts the user's natural language search query into a 1536-dimensional vector using `gemini-embedding-2` with search-optimized task instructions.
2. **Hybrid Search Execution**: Executes custom PL/pgSQL function `match_reels`:
   - Computes cosine similarity (`1 - (reels.embedding <=> query_embedding)`).
   - Combines vector distance with Full-Text Search ranking (`ts_rank_cd`) across title, summary, caption, creator, and actionable items.
   - Applies an exact string match boost via `ILIKE`.
3. **Scored Payload**: Returns ranked items filtered by the authenticated user's ID with match percentages (0–100%).

---

## Key Features & Functional Capabilities

### 1. Multi-Channel Ingest & Shortcuts
- Supports Instagram Reels, YouTube Shorts, standard YouTube videos, and raw file uploads.
- **Apple iOS/macOS Shortcut Integration**: `/api/reels/shortcut` enables one-tap saving directly from the native iOS Share Sheet via an authenticated signed token.

### 2. Device Sync & QR Token Exchange
- Employs HMAC-SHA256 signed `SyncToken` sessions to allow mobile devices to authenticate and sync libraries with desktop sessions without requiring manual password entry.
- Features an in-app QR code scanner for camera-based mobile pairing.

### 3. Dynamic AI Craft Topic Collections
- Automatically groups ingested media into 10 human interest domains (*Arts & Creativity*, *Technology*, *Food & Cooking*, *Career & Education*, *Health & Fitness*, *Entertainment*, *Travel & Places*, *Business & Finance*, *Lifestyle*, *Other*).
- Sub-clusters reels into specific craft topics (e.g., *Motion Design*, *Developer Tools*, *Sourdough Baking*). Uses a fallback TF-IDF + Agglomerative Cosine Clustering algorithm if LLM grouping fails.

### 4. Interactive Detail Modal & Analytics
- Full-screen modal presenting embedded video preview, AI summary block, interactive takeaway checklist, and hyperlinked external resource lists.
- Real-time library metrics bar tracking total saved items, active collection counts, search hits, and top domain distribution.

---

## Database Schema & Row-Level Security

### Relational Database Design (`schema.sql`)

#### `reels` Table
```sql
CREATE TABLE reels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  title TEXT,
  caption TEXT,
  creator TEXT,
  thumbnail_url TEXT,
  embedding vector(1536),
  embedding_model TEXT DEFAULT 'gemini-embedding-2',
  ingest_status TEXT DEFAULT 'saved',
  gcs_uri TEXT,
  summary TEXT,
  actionable_items JSONB,
  resources JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_canonical_per_user UNIQUE (canonical_url, user_id)
);

CREATE INDEX reels_embedding_cosine_idx ON reels USING hnsw (embedding vector_cosine_ops);
```

#### `reel_collections` & `reel_collection_items` Tables
- `reel_collections`: Stores domain name, craft topic name, description, and keywords array per user.
- `reel_collection_items`: Links reels to collections with a unique constraint ensuring each reel belongs to one primary craft topic.
- **Security (RLS)**: Row Level Security is active on all tables. Policies enforce `auth.uid() = user_id` for SELECT, INSERT, UPDATE, and DELETE queries, maintaining multi-tenant privacy.

---

## Operational & Performance Highlights
- **Sub-Second Vector Matching**: HNSW vector indexing in `pgvector` enables sub-100ms similarity searches across thousands of video embeddings.
- **Zero-ORM Performance**: Direct `psycopg` queries ensure minimal latency overhead during ingestion and batch retrieval.
- **High-Throughput Ingestion & Latency Optimization**:
  - **720p Quality Capping**: Restricts video download payloads to 720p, reducing file transfer sizes by ~75% and accelerating `yt-dlp` downloads and GCS uploads.
  - **Concurrent AI Inference**: Runs `gemini-embedding-2` vector embedding and `gemini-3.5-flash` summary synthesis concurrently via `asyncio.gather()`.
  - **Non-Blocking Async Collection Clustering**: Offloads craft topic re-clustering to background tasks (`BackgroundTasks`), reducing overall response latency from 50+ seconds down to sub-10 seconds and eliminating client/iOS Shortcut HTTP timeouts.
- **Resilient Media Extraction**: `yt-dlp` handles anti-bot changes with automatic fallback cookie injection from Secret Manager, ensuring reliable content fetching.
