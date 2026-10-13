from typing import Literal

from fastapi import HTTPException

from app.core.db import to_oid
from app.models.user import Role, User
from app.services.storage import get_storage

Kind = Literal["site", "accommodation"]


async def ensure_media_indexes(db) -> None:
    await db.media.create_index([("kind", 1), ("entity_id", 1), ("position", 1)])


def public_image(doc: dict) -> dict:
    """A stored photo as the API shows it: file paths turned into URLs."""
    storage = get_storage()
    return {
        "id": str(doc["_id"]),
        "width": doc["width"],
        "height": doc["height"],
        "color": doc["color"],
        "alt": doc.get("alt"),
        "position": doc["position"],
        "files": {width: storage.url(path) for width, path in doc["files"].items()},
    }


async def assert_can_edit(db, user: User, kind: str, entity_id: str) -> None:
    """Managers may edit photos of any cultural site; property photos belong to the owner (or an admin)."""
    oid = to_oid(entity_id, "Item")
    if kind == "site":
        if not await db.cultural_sites.find_one({"_id": oid}, {"_id": 1}):
            raise HTTPException(404, "Site not found")
        return
    doc = await db.accommodations.find_one({"_id": oid}, {"owner_id": 1})
    if not doc:
        raise HTTPException(404, "Accommodation not found")
    if user.role != Role.admin and doc["owner_id"] != user.id:
        raise HTTPException(403, "Not your property")