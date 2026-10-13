import asyncio

from app.core.db import ensure_indexes, get_db
from app.models.place import CityIn, RegionIn

REGIONS = [
    {"key": "kansai", "name": {"en": "Kansai", "uk": "Кансай", "ja": "関西"}},
]

CITIES = [
    {"key": "kyoto", "region_key": "kansai", "name": {"en": "Kyoto", "uk": "Кіото", "ja": "京都"}},
    {"key": "nara", "region_key": "kansai", "name": {"en": "Nara", "uk": "Нара", "ja": "奈良"}},
    {"key": "osaka", "region_key": "kansai", "name": {"en": "Osaka", "uk": "Осака", "ja": "大阪"}},
]


async def main() -> None:
    db = get_db()
    await ensure_indexes(db)
    for raw in REGIONS:
        doc = RegionIn.model_validate(raw).model_dump(mode="json")
        await db.regions.update_one({"key": doc["key"]}, {"$set": doc}, upsert=True)
    for raw in CITIES:
        doc = CityIn.model_validate(raw).model_dump(mode="json")
        await db.cities.update_one({"key": doc["key"]}, {"$set": doc}, upsert=True)
    print(f"Seeded {len(REGIONS)} region(s) and {len(CITIES)} cities")


if __name__ == "__main__":
    asyncio.run(main())