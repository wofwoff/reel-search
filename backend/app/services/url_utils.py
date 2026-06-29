from urllib.parse import urlparse, urlunparse, parse_qs

INSTAGRAM_HOSTS = {"instagram.com", "www.instagram.com", "m.instagram.com"}
INSTAGRAM_PATH_PREFIXES = ("/reel/", "/reels/", "/p/", "/tv/")

YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
}


def is_instagram_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    return (
        parsed.scheme in {"http", "https"}
        and parsed.netloc.lower() in INSTAGRAM_HOSTS
        and parsed.path.startswith(INSTAGRAM_PATH_PREFIXES)
    )


def is_youtube_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    netloc = parsed.netloc.lower()
    if parsed.scheme not in {"http", "https"} or netloc not in YOUTUBE_HOSTS:
        return False
    if netloc == "youtu.be":
        return len(parsed.path.strip("/")) > 0
    path = parsed.path
    if path.startswith(("/shorts/", "/embed/", "/v/", "/live/")):
        return True
    if path == "/watch":
        return "v" in parse_qs(parsed.query)
    return False


def canonicalize_url(value: str | None) -> str | None:
    if not value:
        return None
    try:
        parsed = urlparse(value)
    except ValueError:
        return None
    if not parsed.scheme or not parsed.netloc:
        return None
        
    netloc = parsed.netloc.lower()
    if netloc in YOUTUBE_HOSTS:
        # Handle youtu.be
        if netloc == "youtu.be":
            video_id = parsed.path.strip("/")
            if not video_id:
                return None
            return f"https://www.youtube.com/watch?v={video_id}"
        
        path = parsed.path
        if path.startswith("/shorts/"):
            parts = path.split("/")
            if len(parts) >= 3:
                video_id = parts[2]
                return f"https://www.youtube.com/watch?v={video_id}"
        elif path == "/watch":
            qs = parse_qs(parsed.query)
            v_list = qs.get("v")
            if v_list:
                return f"https://www.youtube.com/watch?v={v_list[0]}"
        elif path.startswith(("/embed/", "/v/", "/live/")):
            parts = path.rstrip("/").split("/")
            if len(parts) >= 3:
                video_id = parts[2]
                return f"https://www.youtube.com/watch?v={video_id}"

    # Default fallback for Instagram and other URLs
    path = parsed.path.rstrip("/") + "/"
    return urlunparse(("https", netloc, path, "", "", ""))
