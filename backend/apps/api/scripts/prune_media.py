"""Remove photos whose site or property no longer exists.

    python -m scripts.prune_media --dry-run    # show what would be removed
    python -m scripts.prune_media              # remove it
"""

import argparse
import asyncio

from bson import ObjectId

from app.core.db import get_db
from app.services.storage import get_storage

COLLECTIONS = {"site": "cultural_sites", "accommodation": "accommodations"}


async def main(dry_run: bool) -> None:
    db = get_db()
    storage = get_storage()
    removed = 0
    for kind, collection in COLLECTIONS.items():
        entity_ids = set(await db.media.distinct("entity_id", {"kind": kind}))
        oids = [ObjectId(i) for i in entity_ids if ObjectId.is_valid(i)]
        alive = {str(d["_id"]) async for d in db[collection].find({"_id": {"$in": oids}}, {"_id": 1})}
        for entity_id in entity_ids - alive:
            async for doc in db.media.find({"kind": kind, "entity_id": entity_id}):
                removed += 1
                print(f"{'would remove' if dry_run else 'removing'} {kind}/{entity_id}: {doc['_id']}")
                if not dry_run:
                    for path in doc["files"].values():
                        await storage.delete(path)
                    await db.media.delete_one({"_id": doc["_id"]})
    print(f"{removed} orphaned photo(s) {'found' if dry_run else 'removed'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    asyncio.run(main(parser.parse_args().dry_run))