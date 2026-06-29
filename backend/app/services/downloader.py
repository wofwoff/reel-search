from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from yt_dlp import YoutubeDL

from app.config import get_settings
from app.services.url_utils import is_youtube_url


@dataclass
class MediaDownload:
    paths: list[Path]
    tempdir: TemporaryDirectory[str]
    title: str | None = None
    caption: str | None = None
    creator: str | None = None
    thumbnail_url: str | None = None
    webpage_url: str | None = None

    def cleanup(self) -> None:
        self.tempdir.cleanup()


class MediaDownloadError(RuntimeError):
    pass


def _reject_long_youtube_videos(info: dict[str, Any], *, incomplete: bool) -> str | None:
    duration = info.get("duration")
    if duration and duration > 15 * 60:
        return "YouTube videos longer than 15 minutes are not supported yet. Upload a clip or use a shorter video."
    return None


def _metadata(info: dict[str, Any]) -> dict[str, str | None]:
    return {
        "title": info.get("title"),
        "caption": info.get("description") or info.get("caption"),
        "creator": info.get("uploader") or info.get("channel") or info.get("creator"),
        "thumbnail_url": info.get("thumbnail"),
        "webpage_url": info.get("webpage_url") or info.get("original_url"),
    }


def download_media(url: str) -> MediaDownload:
    tempdir = TemporaryDirectory()
    # Use autonumber to ensure multiple slides/files are saved with distinct names
    output_template = str(Path(tempdir.name) / "%(id)s_%(autonumber)s.%(ext)s")
    options: dict[str, Any] = {
        "outtmpl": output_template,
        "noplaylist": False,
        "quiet": True,
        "no_warnings": True,
        "restrictfilenames": True,
        "ignore_no_formats_error": True,
        "max_filesize": 250 * 1024 * 1024,
    }

    if is_youtube_url(url):
        options.update(
            {
                "format": "/".join(
                    [
                        "best[ext=mp4][vcodec!=none][acodec!=none][height<=720]",
                        "best[ext=mp4][vcodec!=none][acodec!=none]",
                        "best[vcodec!=none][acodec!=none][height<=720]",
                        "best[vcodec!=none][acodec!=none]",
                    ]
                ),
                "match_filter": _reject_long_youtube_videos,
            }
        )

    settings = get_settings()
    if settings.yt_dlp_cookies_from_browser:
        options["cookiesfrombrowser"] = (settings.yt_dlp_cookies_from_browser,)
    elif settings.yt_dlp_cookie_file:
        options["cookiefile"] = settings.yt_dlp_cookie_file

    try:
        with YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=True)
            if not info:
                raise MediaDownloadError("yt-dlp returned no metadata")
    except Exception as exc:
        tempdir.cleanup()
        msg = str(exc)
        if "Sign in to confirm" in msg or "not a bot" in msg:
            raise MediaDownloadError(
                "YouTube blocked automated download for this video. Upload the video file instead, or try a different public Shorts/video link."
            ) from exc
        if "No video formats found" in msg:
            raise MediaDownloadError(
                "Only Instagram posts/YouTube videos containing playable video are supported via URL. "
                "For image-only posts, please download and upload the media files directly."
            ) from exc
        if "File is larger than max-filesize" in msg or "Requested format is not available" in msg:
            raise MediaDownloadError(
                "This YouTube video is too large or does not expose a compatible progressive format. "
                "Use a shorter video/Short, or upload a clipped MP4 instead."
            ) from exc
        raise MediaDownloadError(msg) from exc

    candidates = sorted(list(Path(tempdir.name).glob("*")))
    # Filter only files matching video/image extensions to ignore description sidecars
    media_paths = [
        p for p in candidates
        if p.suffix.lower() in (".mp4", ".mov", ".webm", ".jpg", ".jpeg", ".png", ".webp")
    ]

    if not media_paths:
        tempdir.cleanup()
        raise MediaDownloadError("No media files were downloaded. If this is an image-only post, please upload the files directly.")

    return MediaDownload(paths=media_paths, tempdir=tempdir, **_metadata(info))
