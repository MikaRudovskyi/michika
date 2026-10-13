import asyncio
import io

import pytest
from PIL import Image

from app.services.images import ImageRejected, process_image
from app.services.storage import LocalStorage


def make(size=(1200, 800), fmt="JPEG", mode="RGB", color=(200, 150, 50), orientation=None) -> bytes:
    buffer = io.BytesIO()
    kwargs = {}
    if orientation:
        exif = Image.Exif()
        exif[0x0112] = orientation
        kwargs["exif"] = exif
    Image.new(mode, size, color).save(buffer, fmt, **kwargs)
    return buffer.getvalue()


def decode(blob: bytes) -> Image.Image:
    return Image.open(io.BytesIO(blob))


def test_sizes_never_exceed_the_original_and_keep_the_aspect_ratio():
    result = process_image(make((1200, 800)))
    assert (result.width, result.height) == (1200, 800)
    assert sorted(result.variants) == [480, 960, 1200]
    for width, blob in result.variants.items():
        img = decode(blob)
        assert img.format == "WEBP"
        assert img.width == width
        assert abs(img.height - round(800 * width / 1200)) <= 1


def test_large_photos_stop_at_1600_pixels():
    assert sorted(process_image(make((3000, 2000))).variants) == [480, 960, 1600]


def test_exif_orientation_is_applied_and_metadata_is_dropped():
    result = process_image(make((1200, 800), orientation=6))  # camera held upright
    assert (result.width, result.height) == (800, 1200)
    for blob in result.variants.values():
        assert len(decode(blob).getexif()) == 0


def test_average_colour_is_reported_as_hex():
    assert process_image(make(fmt="PNG", color=(200, 150, 50))).color == "#c89632"


def test_transparent_areas_are_flattened_onto_the_site_background():
    transparent = make(size=(800, 600), fmt="PNG", mode="RGBA", color=(255, 255, 255, 0))
    assert process_image(transparent).color == "#0b0b0c"


@pytest.mark.parametrize(
    "data",
    [b"definitely not an image", b"", make((300, 300)), make((800, 600), fmt="GIF")],
    ids=["text", "empty", "too-small", "gif"],
)
def test_unusable_files_are_rejected(data):
    with pytest.raises(ImageRejected):
        process_image(data)


def test_images_with_too_many_pixels_are_rejected_before_decoding():
    buffer = io.BytesIO()
    Image.new("1", (8000, 6000)).save(buffer, "PNG")  # 48 megapixels, tiny file
    with pytest.raises(ImageRejected, match="pixels"):
        process_image(buffer.getvalue())


def test_storage_saves_serves_urls_and_blocks_path_traversal(tmp_path):
    storage = LocalStorage(str(tmp_path / "media"), "http://localhost:8000/files/")

    asyncio.run(storage.save("site/abc/photo-480.webp", b"data"))
    assert (tmp_path / "media" / "site" / "abc" / "photo-480.webp").read_bytes() == b"data"
    assert storage.url("site/abc/photo-480.webp") == "http://localhost:8000/files/site/abc/photo-480.webp"

    asyncio.run(storage.delete("site/abc/photo-480.webp"))
    assert not (tmp_path / "media" / "site" / "abc" / "photo-480.webp").exists()
    asyncio.run(storage.delete("site/abc/photo-480.webp"))  # deleting twice is fine

    with pytest.raises(ValueError):
        asyncio.run(storage.save("../escape.txt", b"x"))
    with pytest.raises(ValueError):
        asyncio.run(storage.save("/etc/passwd", b"x"))