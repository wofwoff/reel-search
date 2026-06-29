from app.services.downloader import _reject_long_youtube_videos
from app.services.storage import guess_mime_type
from pathlib import Path


def test_reject_long_youtube_videos():
    assert _reject_long_youtube_videos({"duration": 901}, incomplete=False)


def test_allow_short_youtube_videos():
    assert _reject_long_youtube_videos({"duration": 900}, incomplete=False) is None


def test_guess_webm_mime_type():
    assert guess_mime_type(Path("video.webm")) == "video/webm"
