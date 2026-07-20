# Collection-first Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the default 50-reel wall with an efficient domain/topic collection gallery while preserving saving, search, sync, Shortcut setup, and full-library retrieval.

**Architecture:** FastAPI exposes an owned-and-shared archive count, collection summaries with capped previews, and an owned collection-detail endpoint. Gemini performs structured batch classification during reclustering, with validation and deterministic fallback before the existing replace transaction. React loads count and collections in parallel, then fetches individual reels only for search or an opened collection.

**Tech Stack:** Python 3, FastAPI, psycopg/Postgres, Supabase RLS, Google Gen AI SDK on Vertex AI, React 19, TypeScript, Vite, Vitest.

## Global Constraints

- Preserve the current auth and `user_id` ownership boundaries.
- The true archive count includes rows visible to the current library: owned reels plus shared sample reels.
- Default library rendering must not fetch or render the newest 50 reels.
- Collection summaries return at most three previews while retaining the full count.
- Keep the existing hero, save input, upload fallback, semantic search, Shortcut setup, device syncing, reel modal, and delete behavior.
- The hero is centered and text-led with no oversized logo artwork.
- Collection names describe subject/purpose, not incidental platform or tool names.

---

### Task 1: Semantic collection model

**Files:**
- Modify: `backend/app/services/collections.py`
- Modify: `backend/tests/test_collections.py`

**Interfaces:**
- Produces: `CollectionDraft(domain, name, description, keywords, reel_ids)` and `build_collections(reels, semantic_groups=None)`.

- [ ] Write failing tests proving semantic groups retain a broad domain, every valid reel is assigned once, duplicates are ignored, and missing IDs fall back safely.
- [ ] Run `pytest tests/test_collections.py -v` from `backend/` and confirm failures are caused by the missing semantic-group interface.
- [ ] Implement semantic-plan validation while retaining deterministic grouping as fallback.
- [ ] Re-run the focused tests and confirm they pass.

### Task 2: Gemini batch classifier

**Files:**
- Modify: `backend/app/services/embedder.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_collection_classifier.py`

**Interfaces:**
- Produces: `VertexEmbeddingProvider.classify_collections(reels) -> list[dict]`.
- Consumes: `build_collections(reels, semantic_groups)`.

- [ ] Write a failing fake-client test for structured domain/topic output and a failing recluster test for classifier fallback.
- [ ] Run the focused tests and verify the expected missing-method failures.
- [ ] Add a structured Gemini response schema with a stable domain taxonomy and prompt rules that prioritize purpose over GitHub/Claude/source terminology.
- [ ] Wire reclustering to semantic groups, falling back without failing save.
- [ ] Re-run focused tests.

### Task 3: Database domain, total count, and capped previews

**Files:**
- Create: `supabase/migrations/20260720155418_add_collection_domains.sql`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/services/db.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_library_queries.py`

**Interfaces:**
- Produces: `GET /api/reels/count -> {count: int}`.
- Produces: collection summaries with `domain` and no more than three `reels`.
- Produces: `GET /api/collections/{collection_id}/reels` scoped to the current owner.

- [ ] Create the migration through `supabase migration new add_collection_domains`.
- [ ] Write failing repository/API tests for count scope, preview caps, domain serialization, and collection ownership.
- [ ] Run focused tests and confirm expected failures.
- [ ] Add the nullable `domain` column, repository queries, response models, and routes.
- [ ] Re-run focused backend tests.

### Task 4: Collection gallery component

**Files:**
- Create: `frontend/src/CollectionGallery.tsx`
- Create: `frontend/src/CollectionGallery.test.tsx`
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Produces: `CollectionGallery({collections, onSelect, onRefresh, refreshing})`.
- Produces: `fetchLibraryCount()` and `fetchCollectionReels(id)`.

- [ ] Write a failing server-rendered Vitest test proving each collection renders no more than three thumbnail images and exposes domain, topic, count, and an accessible selection control.
- [ ] Run the focused frontend test and confirm it fails because the component is missing.
- [ ] Build responsive collection cards with lazy images, ReelMind-logo fallback, meaningful focus/hover states, and reduced-motion-safe CSS.
- [ ] Re-run the focused frontend test.

### Task 5: Integrate the approved page composition

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: count, collection summaries, collection-detail reels, and `CollectionGallery`.

- [ ] Add failing helper/state tests where practical for parallel count/collection loading and true-total updates after delete.
- [ ] Replace initial `fetchReels()` with parallel count and collection requests.
- [ ] Center the existing text-led hero without adding the mockup’s large logo.
- [ ] Move Shortcut Setup and Sync Devices into the preserved utility row.
- [ ] Replace the default reel grid/sidebar with the collection gallery; keep search results and opened-collection reel grids functional.
- [ ] Update save, delete, sync validation, and recluster refresh paths to keep the true total current.
- [ ] Run frontend tests and `npm run build`.

### Task 6: Full verification and visual QA

**Files:**
- Create: `design-qa.md`
- Modify only files implicated by verified P0/P1/P2 findings.

- [ ] Run the complete backend test suite.
- [ ] Run the complete frontend test suite and production build.
- [ ] Start the local backend/frontend and capture the approved desktop state plus a mobile state.
- [ ] Compare the implementation against the selected mockup and written refinement, record findings in `design-qa.md`, and fix all P0/P1/P2 issues.
- [ ] Repeat capture and comparison until `design-qa.md` says `final result: passed`.
