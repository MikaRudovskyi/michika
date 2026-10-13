import datetime as dt

from pymongo.errors import DuplicateKeyError

# Inventory = one document per (property, room type, night) with a `booked` counter.
# Reservation is a single conditional upsert per night:
#   - doc exists and has room  -> $inc succeeds
#   - doc missing              -> upsert creates it with booked = rooms
#   - doc exists but is full   -> the filter misses, the upsert tries to insert and the
#                                 unique index raises DuplicateKeyError -> "no availability"
# So two simultaneous bookings can never oversell a room, without needing transactions.


def _key(acc_id: str, room_id: str, night: dt.date) -> dict:
    return {"accommodation_id": acc_id, "room_type_id": room_id, "date": night.isoformat()}


async def _reserve_night(db, acc_id: str, room_id: str, night: dt.date, rooms: int, capacity: int) -> bool:
    if rooms > capacity:
        return False
    flt = {**_key(acc_id, room_id, night), "booked": {"$lte": capacity - rooms}}
    try:
        await db.inventory.update_one(flt, {"$inc": {"booked": rooms}}, upsert=True)
    except DuplicateKeyError:
        return False
    return True


async def release(db, acc_id: str, room_id: str, nights: list[dt.date], rooms: int) -> None:
    for night in nights:
        await db.inventory.update_one(_key(acc_id, room_id, night), {"$inc": {"booked": -rooms}})


async def reserve(
    db, acc_id: str, room_id: str, nights: list[dt.date], rooms: int, capacity: int
) -> bool:
    """All-or-nothing: if any night is full, nights reserved so far are rolled back."""
    done: list[dt.date] = []
    for night in nights:
        if await _reserve_night(db, acc_id, room_id, night, rooms, capacity):
            done.append(night)
        else:
            await release(db, acc_id, room_id, done, rooms)
            return False
    return True


async def availability(db, acc_id: str, room_id: str, nights: list[dt.date], capacity: int) -> int:
    """Rooms that are free on every one of the given nights."""
    cursor = db.inventory.find(
        {
            "accommodation_id": acc_id,
            "room_type_id": room_id,
            "date": {"$in": [n.isoformat() for n in nights]},
        }
    )
    booked = {d["date"]: d["booked"] async for d in cursor}
    return min(capacity - booked.get(n.isoformat(), 0) for n in nights)