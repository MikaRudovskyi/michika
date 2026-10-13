import asyncio
from pathlib import Path

from app.core.config import settings


class LocalStorage:
    """Files on the local disk, served by the API under /files.

    This is the one place that knows where photos live: to use S3 or Cloudflare R2 in
    production, write a class with the same three methods and return it from get_storage().
    """

    def __init__(self, root: str, base_url: str):
        self.root = Path(root).resolve()
        self.base_url = base_url.rstrip("/")
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if self.root not in path.parents:
            raise ValueError("Invalid storage key")
        return path

    async def save(self, key: str, data: bytes) -> None:
        path = self._path(key)

        def write() -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)

        await asyncio.to_thread(write)

    async def delete(self, key: str) -> None:
        path = self._path(key)
        await asyncio.to_thread(lambda: path.unlink(missing_ok=True))

    def url(self, key: str) -> str:
        return f"{self.base_url}/{key}"


_storage: LocalStorage | None = None


def get_storage() -> LocalStorage:
    global _storage
    if _storage is None:
        _storage = LocalStorage(settings.media_dir, settings.media_base_url)
    return _storage