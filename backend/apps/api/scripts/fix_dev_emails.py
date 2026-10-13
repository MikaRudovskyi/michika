import asyncio

from app.core.db import get_db

RENAMES = {
    "manager@michika.local": "manager@michika.dev",
    "admin@michika.local": "admin@michika.dev",
}


async def main() -> None:
    db = get_db()
    for old, new in RENAMES.items():
        if await db.users.find_one({"email": new}, {"_id": 1}):
            print(f"{new} already exists, skipping {old}")
            continue
        res = await db.users.update_one({"email": old}, {"$set": {"email": new}})
        print(f"{old} -> {new}" if res.modified_count else f"{old} not found")


if __name__ == "__main__":
    asyncio.run(main())