from app.services.url_utils import canonicalize_url, is_instagram_url, is_youtube_url


def test_rejects_non_instagram_urls():
    assert not is_instagram_url("https://youtube.com/watch?v=abc")
    assert not is_instagram_url("not-a-url")


def test_accepts_instagram_reel_urls():
    assert is_instagram_url("https://www.instagram.com/reel/ABC123/?igsh=test")


def test_canonicalize_instagram_url_strips_query_and_fragment():
    assert (
        canonicalize_url("https://www.instagram.com/reel/ABC123/?igsh=test#x")
        == "https://www.instagram.com/reel/ABC123/"
    )


def test_is_youtube_url():
    assert is_youtube_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    assert is_youtube_url("https://youtu.be/dQw4w9WgXcQ")
    assert is_youtube_url("https://www.youtube.com/shorts/dQw4w9WgXcQ")
    assert is_youtube_url("https://youtube.com/embed/dQw4w9WgXcQ")
    assert not is_youtube_url("https://youtube.com/watch")  # Missing query 'v'
    assert not is_youtube_url("https://google.com")


def test_canonicalize_youtube_url():
    assert canonicalize_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s") == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    assert canonicalize_url("https://youtu.be/dQw4w9WgXcQ?t=10") == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    assert canonicalize_url("https://www.youtube.com/shorts/dQw4w9WgXcQ") == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    assert canonicalize_url("https://youtube.com/embed/dQw4w9WgXcQ/") == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
