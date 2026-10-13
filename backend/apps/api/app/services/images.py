import io
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_PIXELS = 40_000_000
WIDTHS = (480, 960, 1600)
MIN_WIDTH = 400
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
BACKGROUND = (11, 11, 12)  # the site's dark colour, put under transparent areas


class ImageRejected(ValueError):
    """The upload cannot be used. The message is safe to show to the user."""


@dataclass(frozen=True)
class ProcessedImage:
    width: int
    height: int
    color: str  # average colour as #rrggbb, shown while the photo loads
    variants: dict[int, bytes]  # width in pixels -> WebP bytes


def process_image(data: bytes) -> ProcessedImage:
    """Validate an uploaded photo and turn it into a set of WebP sizes.

    The file is decoded and re-encoded, so nothing the user sent reaches the disk as it was:
    EXIF data (including GPS position) is dropped, the orientation is applied and
    anything that is not a real JPEG, PNG or WebP picture is refused.
    """
    try:
        probe = Image.open(io.BytesIO(data))
        fmt, pixels = probe.format, probe.width * probe.height
        if fmt not in ALLOWED_FORMATS:
            raise ImageRejected("Only JPEG, PNG and WebP images are accepted.")
        if pixels > MAX_PIXELS:
            raise ImageRejected("The image has too many pixels (the limit is 40 megapixels).")
        source = Image.open(io.BytesIO(data))
        source.load()
        img = ImageOps.exif_transpose(source)
    except ImageRejected:
        raise
    except Image.DecompressionBombError:
        raise ImageRejected("The image has too many pixels (the limit is 40 megapixels).")
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        raise ImageRejected("This file is not a readable image.")

    if img.width < MIN_WIDTH:
        raise ImageRejected(f"The image is too small: it must be at least {MIN_WIDTH}px wide.")

    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        flat = Image.new("RGB", rgba.size, BACKGROUND)
        flat.paste(rgba, mask=rgba.getchannel("A"))
        img = flat
    else:
        img = img.convert("RGB")

    r, g, b = img.resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))
    color = f"#{r:02x}{g:02x}{b:02x}"

    # Standard widths below the original, plus the largest one allowed (never upscaled).
    widths = sorted({*(w for w in WIDTHS if w < img.width), min(img.width, WIDTHS[-1])})
    variants: dict[int, bytes] = {}
    for width in widths:
        resized = img if width == img.width else img.resize(
            (width, round(img.height * width / img.width)), Image.Resampling.LANCZOS
        )
        buffer = io.BytesIO()
        resized.save(buffer, "WEBP", quality=82, method=4)
        variants[width] = buffer.getvalue()

    return ProcessedImage(width=img.width, height=img.height, color=color, variants=variants)