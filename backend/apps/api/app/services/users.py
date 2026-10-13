from collections.abc import Iterable

from bson import ObjectId
from bson.errors import InvalidId


async def users_by_id(db, ids: Iterable[str]) -> dict[str, dict]:
    """Maps user id -> {email, name} for the given ids (unknown ids are skipped)."""
    oids = []
    for value in ids:
        try:
            oids.append(ObjectId(value))
        except (InvalidId, TypeError):
            continue
    if not oids:
        return {}
    cursor = db.users.find({"_id": {"$in": oids}}, {"email": 1, "name": 1})
    return {str(d["_id"]): d async for d in cursor}