from pathlib import Path
from tempfile import NamedTemporaryFile
from app.services.thumbnail import generate_thumbnail


def test_generate_thumbnail_from_image():
    with NamedTemporaryFile(suffix=".jpg", delete=False) as temp_img:
        temp_img.write(b"fake image data")
        temp_path = Path(temp_img.name)

    try:
        thumb = generate_thumbnail(temp_path)
        assert thumb == temp_path
    finally:
        if temp_path.exists():
            temp_path.unlink()


def test_generate_thumbnail_non_existent():
    assert generate_thumbnail(Path("/non/existent/file.mp4")) is None
