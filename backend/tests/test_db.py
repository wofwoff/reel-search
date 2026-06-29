from app.services.db import vector_literal, ReelRepository
from app.config import get_settings


def test_vector_literal_formats_pgvector_input():
    assert vector_literal([1, 0.5, -0.25]) == "[1.000000000,0.500000000,-0.250000000]"


def test_repository_search_query_execution():
    settings = get_settings()
    if not settings.database_url:
        return
    repo = ReelRepository(settings)
    # A dummy embedding with 1536 elements
    dummy_embedding = [0.0] * 1536
    results = repo.search("VibeVoice", dummy_embedding, limit=5, user_id="00000000-0000-0000-0000-000000000000")
    # Assert it runs successfully and returns a list
    assert isinstance(results, list)
    if results:
        # Check that score exists and is a float
        assert isinstance(results[0].score, float)
