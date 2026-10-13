from collections.abc import Iterable

from bson import ObjectId

from app.core.db import from_doc
from app.models.site import CulturalSite


async def load_sites(db, ids: Iterable[str]) -> dict[str, CulturalSite]:
    """Sites by id; unknown or deleted ids are simply absent."""
    oids = [ObjectId(i) for i in set(ids) if ObjectId.is_valid(i)]
    if not oids:
        return {}
    cursor = db.cultural_sites.find({"_id": {"$in": oids}})
    return {str(d["_id"]): from_doc(CulturalSite, d) async for d in cursor}