import json
from types import SimpleNamespace

from app.config import Settings
from app.main import recluster_user_collections
from app.services.embedder import VertexEmbeddingProvider


REELS = [
    {
        "id": "00000000-0000-0000-0000-000000000001",
        "title": "Claude tools for motion design",
        "summary": "Animation, kinetic type, and visual storytelling workflows.",
        "caption": None,
        "creator": "example",
        "actionable_items": None,
        "resources": None,
    },
    {
        "id": "00000000-0000-0000-0000-000000000002",
        "title": "Fast weeknight cooking",
        "summary": "A practical cooking tutorial for a one-pan dinner.",
        "caption": None,
        "creator": "example",
        "actionable_items": None,
        "resources": None,
    },
]


class FakeModels:
    def __init__(self, payload):
        self.payload = payload
        self.prompt = ""

    def generate_content(self, *, model, contents, config):
        self.prompt = str(contents)
        assert model == "gemini-3.5-flash"
        assert config.response_mime_type == "application/json"
        return SimpleNamespace(text=json.dumps(self.payload))


class FakeRepo:
    def __init__(self):
        self.replaced = None

    def list_collection_source_reels(self, user_id):
        return REELS

    def replace_collections(self, user_id, drafts):
        self.replaced = drafts


def test_classifier_returns_structured_domain_topic_groups():
    payload = {
        "collections": [
            {
                "domain": "Arts & Creativity",
                "name": "Motion Design",
                "description": "Animation and visual storytelling workflows.",
                "keywords": ["animation", "typography"],
                "reel_ids": ["00000000-0000-0000-0000-000000000001"],
            },
            {
                "domain": "Food & Cooking",
                "name": "Cooking",
                "description": "Recipes and kitchen techniques.",
                "keywords": ["cooking", "recipes"],
                "reel_ids": ["00000000-0000-0000-0000-000000000002"],
            },
        ]
    }
    models = FakeModels(payload)
    provider = VertexEmbeddingProvider(
        Settings(GOOGLE_CLOUD_PROJECT="test", GOOGLE_CLOUD_LOCATION="us")
    )
    provider._client = SimpleNamespace(models=models)

    groups = provider.classify_collections(REELS)

    assert groups == payload["collections"]
    assert "what each reel is actually about" in models.prompt
    assert "Claude Code" in models.prompt


def test_recluster_uses_semantic_groups_when_classifier_succeeds():
    repo = FakeRepo()
    classifier = SimpleNamespace(
        classify_collections=lambda reels: [
            {
                "domain": "Arts & Creativity",
                "name": "Motion Design",
                "description": "Animation and visual storytelling workflows.",
                "keywords": ["animation"],
                "reel_ids": ["00000000-0000-0000-0000-000000000001"],
            },
            {
                "domain": "Food & Cooking",
                "name": "Cooking",
                "description": "Recipes and kitchen techniques.",
                "keywords": ["cooking"],
                "reel_ids": ["00000000-0000-0000-0000-000000000002"],
            },
        ]
    )

    recluster_user_collections(repo, "user-1", classifier)

    assert [(draft.domain, draft.name) for draft in repo.replaced] == [
        ("Arts & Creativity", "Motion Design"),
        ("Food & Cooking", "Cooking"),
    ]


def test_recluster_falls_back_when_classifier_fails():
    repo = FakeRepo()

    def fail(_reels):
        raise RuntimeError("classification unavailable")

    recluster_user_collections(repo, "user-1", SimpleNamespace(classify_collections=fail))

    assert repo.replaced
    assigned_ids = {reel_id for draft in repo.replaced for reel_id in draft.reel_ids}
    assert assigned_ids == {
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
    }
