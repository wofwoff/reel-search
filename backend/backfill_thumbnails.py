import json
import logging
from pathlib import Path
from tempfile import TemporaryDirectory

import psycopg
from app.config import get_settings
from app.services.storage import GcsStorage
from app.services.thumbnail import generate_thumbnail

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backfill_thumbnails")


def backfill():
    settings = get_settings()
    if not settings.database_url:
        logger.error("DATABASE_URL is not configured.")
        return
    if not settings.has_gcs:
        logger.error("GCS is not configured.")
        return

    storage = GcsStorage(settings)
    conn = psycopg.connect(settings.database_url)
    cur = conn.cursor()

    cur.execute(
        """
        SELECT id, gcs_uri, thumbnail_url
        FROM reels
        WHERE gcs_uri IS NOT NULL
          AND (thumbnail_url IS NULL OR thumbnail_url NOT LIKE '/api/thumbnails/%')
        """
    )
    reels = cur.fetchall()

    if not reels:
        logger.info("No reels found that need thumbnail backfilling.")
        return

    logger.info("Found %d reel(s) to process for thumbnail backfilling.", len(reels))
    updated_count = 0

    for reel_id, gcs_uri, current_thumb_url in reels:
        logger.info("Processing reel %s...", reel_id)
        try:
            uris = json.loads(gcs_uri) if gcs_uri.startswith("[") else [gcs_uri]
            target_uri = uris[0]
            with TemporaryDirectory() as temp_dir:
                ext = Path(target_uri).suffix or ".mp4"
                temp_video = Path(temp_dir) / f"media{ext}"
                storage.download_gcs_uri_to_file(target_uri, temp_video)
                thumb_file = generate_thumbnail(temp_video)

                if thumb_file and thumb_file.exists():
                    thumb_filename = storage.upload_thumbnail(thumb_file)
                    new_thumb_url = f"/api/thumbnails/{thumb_filename}"
                    cur.execute(
                        "UPDATE reels SET thumbnail_url = %s WHERE id = %s",
                        (new_thumb_url, reel_id),
                    )
                    conn.commit()
                    updated_count += 1
                    logger.info("  Updated reel %s thumbnail to %s", reel_id, new_thumb_url)
                    if thumb_file != temp_video and thumb_file.exists():
                        thumb_file.unlink(missing_ok=True)
                else:
                    logger.warning("  Could not generate thumbnail for reel %s", reel_id)
        except Exception as exc:
            logger.exception("  Failed to backfill thumbnail for reel %s: %s", reel_id, exc)
            conn.rollback()

    cur.close()
    conn.close()
    logger.info("Thumbnail backfill complete! Updated %d/%d reels.", updated_count, len(reels))


if __name__ == "__main__":
    backfill()
