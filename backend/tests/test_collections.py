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


def test_build_collections_excludes_common_stopwords():
    reels = [
        {
            "id": "00000000-0000-0000-0000-000000000001",
            "title": "How to make a website",
            "summary": "This is a simple guide on how to build a website and use CSS grid.",
        },
        {
            "id": "00000000-0000-0000-0000-000000000002",
            "title": "A tutorial for CSS grid layout",
            "summary": "Explains how the layout works with CSS grid and flexbox for styling.",
        },
    ]

    collections = build_collections(reels)
    assert len(collections) == 1
    collection = collections[0]

    forbidden = {"how", "to", "a", "the", "for", "and", "this", "is", "on", "with"}
    for word in forbidden:
        assert word.capitalize() not in collection.keywords
        assert word.lower() not in collection.name.lower()


def test_build_collections_uses_semantic_domain_and_topic_groups():
    reels = [
        {
            "id": "00000000-0000-0000-0000-000000000001",
            "title": "Animate product launches with Claude Code",
            "summary": "A workflow for motion design, kinetic typography, and launch videos.",
        },
        {
            "id": "00000000-0000-0000-0000-000000000002",
            "title": "GitHub tools for better motion graphics",
            "summary": "Animation tooling for motion designers and visual storytellers.",
        },
        {
            "id": "00000000-0000-0000-0000-000000000003",
            "title": "Knife skills for home cooks",
            "summary": "Cooking techniques for safer and faster vegetable preparation.",
        },
    ]
    semantic_groups = [
        {
            "domain": "Arts & Creativity",
            "name": "Motion Design",
            "description": "Animation, typography, and visual storytelling workflows.",
            "keywords": ["animation", "typography", "motion"],
            "reel_ids": [
                "00000000-0000-0000-0000-000000000001",
                "00000000-0000-0000-0000-000000000002",
            ],
        },
        {
            "domain": "Food & Cooking",
            "name": "Cooking",
            "description": "Recipes and practical kitchen techniques.",
            "keywords": ["cooking", "knife skills"],
            "reel_ids": ["00000000-0000-0000-0000-000000000003"],
        },
    ]

    collections = build_collections(reels, semantic_groups=semantic_groups)

    assert [(collection.domain, collection.name) for collection in collections] == [
        ("Arts & Creativity", "Motion Design"),
        ("Food & Cooking", "Cooking"),
    ]
    assert collections[0].reel_ids == [
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
    ]


def test_build_collections_assigns_each_reel_at_most_once_and_recovers_missing_reels():
    reels = [
        {
            "id": "00000000-0000-0000-0000-000000000001",
            "title": "Singing warmups",
            "summary": "Breath support and vocal warmup exercises.",
        },
        {
            "id": "00000000-0000-0000-0000-000000000002",
            "title": "Healthy breakfast",
            "summary": "A quick cooking tutorial for a balanced breakfast.",
        },
    ]
    semantic_groups = [
        {
            "domain": "Arts & Creativity",
            "name": "Singing",
            "description": "Vocal technique and performance practice.",
            "keywords": ["singing"],
            "reel_ids": [
                "00000000-0000-0000-0000-000000000001",
                "00000000-0000-0000-0000-000000000001",
                "00000000-0000-0000-0000-999999999999",
            ],
        }
    ]

    collections = build_collections(reels, semantic_groups=semantic_groups)

    assigned_ids = [reel_id for collection in collections for reel_id in collection.reel_ids]
    assert assigned_ids.count("00000000-0000-0000-0000-000000000001") == 1
    assert "00000000-0000-0000-0000-000000000002" in assigned_ids
    assert "00000000-0000-0000-0000-999999999999" not in assigned_ids


def test_build_collections_replaces_source_only_collection_names():
    reels = [
        {
            "id": "00000000-0000-0000-0000-000000000001",
            "title": "A Claude Code repository for visual workflows",
            "summary": "A design workflow for animation and visual storytelling.",
        }
    ]

    collections = build_collections(
        reels,
        semantic_groups=[
            {
                "domain": "Arts & Creativity",
                "name": "Claude Code",
                "description": "Creative workflows.",
                "keywords": ["animation", "design"],
                "reel_ids": ["00000000-0000-0000-0000-000000000001"],
            }
        ],
    )

    assert collections[0].name == "Creative Tools"
