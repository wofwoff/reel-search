from app.services.collections import build_collections


def test_build_collections_groups_related_reels_without_one_off_tags():
    reels = [
        {
            "id": "00000000-0000-0000-0000-000000000001",
            "title": "Postgres index tuning",
            "summary": "Explains Postgres query plans, indexes, and database performance tuning.",
        },
        {
            "id": "00000000-0000-0000-0000-000000000002",
            "title": "SQL performance tips",
            "summary": "Shows how SQL indexes and query planning improve Postgres performance.",
        },
        {
            "id": "00000000-0000-0000-0000-000000000003",
            "title": "Agent workflow automation",
            "summary": "Covers AI agents, workflow automation, tool calling, and orchestration.",
        },
        {
            "id": "00000000-0000-0000-0000-000000000004",
            "title": "LangGraph agent patterns",
            "summary": "Shows LangGraph agent orchestration, tool use, and AI workflow design.",
        },
        {
            "id": "00000000-0000-0000-0000-000000000005",
            "title": "CSS grid layout",
            "summary": "Demonstrates CSS grid layout, responsive UI, and frontend composition.",
        },
        {
            "id": "00000000-0000-0000-0000-000000000006",
            "title": "Responsive UI systems",
            "summary": "Explains frontend layout systems, CSS grid, and responsive design.",
        },
    ]

    collections = build_collections(reels)

    grouped_ids = [set(collection.reel_ids) for collection in collections]

    assert 2 <= len(collections) <= 3
    assert any({"00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002"} <= group for group in grouped_ids)
    assert any({"00000000-0000-0000-0000-000000000003", "00000000-0000-0000-0000-000000000004"} <= group for group in grouped_ids)
    assert any({"00000000-0000-0000-0000-000000000005", "00000000-0000-0000-0000-000000000006"} <= group for group in grouped_ids)


def test_build_collections_uses_one_collection_for_tiny_libraries():
    reels = [
        {
            "id": "00000000-0000-0000-0000-000000000001",
            "title": "One saved reel",
            "summary": "A short saved reel about FastAPI auth and Supabase sessions.",
        },
        {
            "id": "00000000-0000-0000-0000-000000000002",
            "title": "Another saved reel",
            "summary": "A quick note about React UI state and Supabase auth flows.",
        },
    ]

    collections = build_collections(reels)

    assert len(collections) == 1
    assert len(collections[0].reel_ids) == 2
