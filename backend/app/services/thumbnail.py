import logging
import subprocess
from pathlib import Path
from tempfile import NamedTemporaryFile

logger = logging.getLogger(__name__)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".mkv", ".avi"}


def generate_thumbnail(media_path: Path) -> Path | None:
    """
    Generates a low-quality JPEG thumbnail for an image or video file.
    Returns the Path to a temporary JPEG file, or None if extraction failed.
    """
    if not media_path.exists():
        return None

    suffix = media_path.suffix.lower()

    if suffix in IMAGE_EXTENSIONS:
        return media_path

    if suffix in VIDEO_EXTENSIONS:
        thumb_file = NamedTemporaryFile(suffix=".jpg", delete=False)
        thumb_path = Path(thumb_file.name)
        thumb_file.close()

        # Try timestamp 1.0s first, fallback to 0.0s
        for ss in ["00:00:01", "00:00:00"]:
            cmd = [
                "ffmpeg",
                "-y",
                "-ss",
                ss,
                "-i",
                str(media_path),
                "-vframes",
                "1",
                "-vf",
                "scale=480:-1",
                "-q:v",
                "6",
                str(thumb_path),
            ]
            try:
                res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
                if res.returncode == 0 and thumb_path.exists() and thumb_path.stat().st_size > 0:
                    return thumb_path
            except Exception as exc:
                logger.warning("ffmpeg thumbnail extraction failed at %s: %s", ss, exc)

        if thumb_path.exists():
            thumb_path.unlink(missing_ok=True)

    return None
