from typing import TypeVar

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pydantic import BaseModel

from app.core.config import settings

_client: AsyncIOMotorClient | None = None

M = TypeVar("M", bound=BaseModel)


def get_db() -> AsyncIOMotorDatabase:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(settings.mongo_url)
    return _client[settings.mongo_db]


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    await db.users.create_index("email", unique=True)

    await db.regions.create_index("key", unique=True)
    await db.cities.create_index("key", unique=True)
    await db.cities.create_index("region_key")

    await db.cultural_sites.create_index("slug", unique=True)
    await db.cultural_sites.create_index([("location", "2dsphere")])
    await db.cultural_sites.create_index([("type", 1), ("region_id", 1), ("fee_jpy", 1)])

    await db.itineraries.create_index([("owner_id", 1), ("updated_at", -1)])

    await db.accommodations.create_index([("location", "2dsphere")])
    await db.accommodations.create_index([("city_id", 1), ("status", 1)])
    await db.accommodations.create_index("owner_id")

    await db.bookings.create_index([("user_id", 1), ("created_at", -1)])
    await db.bookings.create_index([("owner_id", 1), ("status", 1), ("check_in", 1)])
    await db.bookings.create_index("accommodation_id")

    # One document per (property, room type, night): the unique index is what makes
    # atomic reservation possible (see services/inventory.py).
    await db.inventory.create_index(
        [("accommodation_id", 1), ("room_type_id", 1), ("date", 1)], unique=True
    )

    await db.system_logs.create_index([("at", -1)])
    await db.system_logs.create_index([("action", 1), ("at", -1)])


def from_doc(model: type[M], doc: dict) -> M:
    data = dict(doc)
    data["id"] = str(data.pop("_id"))
    return model.model_validate(data)


def to_doc(model: BaseModel) -> dict:
    return model.model_dump(mode="json", exclude={"id"})


def to_oid(value: str, what: str = "Resource") -> ObjectId:
    try:
        return ObjectId(value)
    except InvalidId:
        raise HTTPException(404, f"{what} not found")