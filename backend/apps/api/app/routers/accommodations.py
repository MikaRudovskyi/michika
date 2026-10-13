import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ValidationError

from app.core.db import from_doc, get_db, to_doc, to_oid
from app.core.rbac import require_role
from app.models.accommodation import (
    Accommodation,
    AccommodationIn,
    AccommodationPatch,
    AccommodationType,
)
from app.models.common import Lang
from app.models.user import Role, User
from app.services.audit import log_action
from app.services.inventory import availability
from app.services.places import validate_place
from app.services.pricing import quote, rooms_needed, validated_nights
from app.services.staff_views import removed_room_ids
from app.services.users import users_by_id

router = APIRouter(prefix="/accommodations", tags=["accommodations"])

registered = require_role(Role.user)
manager = require_role(Role.manager)
admin = require_role(Role.admin)


class ManagedAccommodation(Accommodation):
    owner_email: str | None = None
    owner_name: str | None = None


class OwnerIn(BaseModel):
    owner_id: str


def can_manage(user: User, acc: Accommodation) -> bool:
    return user.role == Role.admin or acc.owner_id == user.id


async def _get(db, acc_id: str) -> Accommodation:
    doc = await db.accommodations.find_one({"_id": to_oid(acc_id, "Accommodation")})
    if not doc:
        raise HTTPException(404, "Accommodation not found")
    return from_doc(Accommodation, doc)


async def _enrich(db, accs: list[Accommodation]) -> list[ManagedAccommodation]:
    owners = await users_by_id(db, {a.owner_id for a in accs})
    return [
        ManagedAccommodation(
            **a.model_dump(),
            owner_email=owners.get(a.owner_id, {}).get("email"),
            owner_name=owners.get(a.owner_id, {}).get("name"),
        )
        for a in accs
    ]


async def _valid_owner(db, owner_id: str) -> str:
    doc = await db.users.find_one({"_id": to_oid(owner_id, "Owner")}, {"role": 1, "status": 1})
    if not doc or doc["role"] not in ("manager", "admin") or doc["status"] != "active":
        raise HTTPException(422, "The owner must be an active manager or administrator")
    return str(doc["_id"])


def _public(acc: Accommodation, lang: str) -> dict:
    return {
        "id": acc.id,
        "name": acc.name.get(lang),
        "description": acc.description.get(lang) if acc.description else None,
        "type": acc.type,
        "region_id": acc.region_id,
        "city_id": acc.city_id,
        "location": acc.location,
        "amenities": acc.amenities,
        "rating": acc.rating,
        "from_price_jpy": min(r.base_price_jpy for r in acc.rooms),
        "rooms": [
            {
                "id": r.id,
                "name": r.name.get(lang),
                "capacity": r.capacity,
                "base_price_jpy": r.base_price_jpy,
            }
            for r in acc.rooms
        ],
        "cancellation_policy": acc.cancellation_policy,
    }


@router.get("")
async def list_accommodations(
    lang: Lang = "en",
    acc_type: AccommodationType | None = Query(None, alias="type"),
    region_id: str | None = None,
    city_id: str | None = None,
    max_price: int | None = Query(None, gt=0, description="Cheapest room per night"),
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
    radius_km: float = Query(5, gt=0, le=50),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db=Depends(get_db),
):
    """Public: guests can browse properties."""
    if (lat is None) != (lon is None):
        raise HTTPException(422, "lat and lon must be provided together")

    q: dict = {"status": "active"}
    if acc_type:
        q["type"] = acc_type
    if region_id:
        q["region_id"] = region_id
    if city_id:
        q["city_id"] = city_id
    if max_price is not None:
        q["rooms.base_price_jpy"] = {"$lte": max_price}
    if lat is not None and lon is not None:
        q["location"] = {"$geoWithin": {"$centerSphere": [[lon, lat], radius_km / 6378.1]}}

    cursor = db.accommodations.find(q).sort("rating", -1).skip(skip).limit(limit)
    items = [_public(from_doc(Accommodation, d), lang) async for d in cursor]
    total = await db.accommodations.count_documents(q)
    return {"total": total, "items": items}


@router.get("/managed", response_model=list[ManagedAccommodation])
async def managed(user: User = Depends(manager), db=Depends(get_db)):
    """Manager: own properties (including hidden). Admin: everything. Includes the owner."""
    q = {} if user.role == Role.admin else {"owner_id": user.id}
    cursor = db.accommodations.find(q).sort("name.en", 1).limit(200)
    return await _enrich(db, [from_doc(Accommodation, d) async for d in cursor])


@router.get("/{acc_id}")
async def get_accommodation(acc_id: str, lang: Lang = "en", db=Depends(get_db)):
    acc = await _get(db, acc_id)
    if acc.status != "active":
        raise HTTPException(404, "Accommodation not found")
    return _public(acc, lang)


@router.get("/{acc_id}/quote")
async def get_quote(
    acc_id: str,
    room_type_id: str,
    check_in: dt.date,
    check_out: dt.date,
    guests: int = Query(2, ge=1, le=20),
    rooms: int | None = Query(None, ge=1, le=10),
    user: User = Depends(registered),
    db=Depends(get_db),
):
    """Registered users: price and availability for the given dates."""
    acc = await _get(db, acc_id)
    if acc.status != "active":
        raise HTTPException(404, "Accommodation not found")
    room = next((r for r in acc.rooms if r.id == room_type_id), None)
    if room is None:
        raise HTTPException(404, "Room type not found")
    try:
        nights = validated_nights(check_in, check_out, dt.date.today())
    except ValueError as exc:
        raise HTTPException(422, str(exc))

    n_rooms = rooms or rooms_needed(guests, room)
    if n_rooms * room.capacity < guests:
        raise HTTPException(422, "Not enough room capacity for this many guests")

    totals = quote(acc, room, check_in, check_out, n_rooms)
    free = await availability(db, acc.id, room.id, nights, room.count)
    return {
        "nights": len(nights),
        "rooms": n_rooms,
        "nightly_total_jpy": totals,
        "total_jpy": sum(totals),
        "free_rooms": free,
        "available": free >= n_rooms,
    }


@router.post("", response_model=Accommodation, status_code=201)
async def create_accommodation(
    body: AccommodationIn,
    owner_id: str | None = Query(None, description="Admin only: create the property for a manager"),
    user: User = Depends(manager),
    db=Depends(get_db),
):
    error = await validate_place(db, body.region_id, body.city_id)
    if error:
        raise HTTPException(422, error)

    owner = user.id
    if owner_id and owner_id != user.id:
        if user.role != Role.admin:
            raise HTTPException(403, "Only an administrator can create a property for someone else")
        owner = await _valid_owner(db, owner_id)

    acc = Accommodation(**body.model_dump(), id="", owner_id=owner)
    res = await db.accommodations.insert_one(to_doc(acc))
    acc.id = str(res.inserted_id)
    await log_action(db, user, "accommodation.create", "accommodation", acc.id, {"owner_id": owner})
    return acc


@router.patch("/{acc_id}", response_model=Accommodation)
async def update_accommodation(
    acc_id: str, body: AccommodationPatch, user: User = Depends(manager), db=Depends(get_db)
):
    """Manager (own properties) / Admin: pricing, services, rooms, policy, visibility."""
    acc = await _get(db, acc_id)
    if not can_manage(user, acc):
        raise HTTPException(403, "Not your property")

    changes = body.model_dump(exclude_unset=True, mode="json")
    if not changes:
        raise HTTPException(400, "No changes provided")

    merged = {**acc.model_dump(mode="json"), **changes}
    try:
        updated = Accommodation.model_validate(merged)
    except ValidationError as exc:
        raise HTTPException(
            422, exc.errors(include_url=False, include_context=False, include_input=False)
        )

    if "region_id" in changes or "city_id" in changes:
        error = await validate_place(db, updated.region_id, updated.city_id)
        if error:
            raise HTTPException(422, error)

    # A room type that active bookings point at cannot disappear.
    removed = removed_room_ids((r.id for r in acc.rooms), (r.id for r in updated.rooms))
    if removed:
        active = await db.bookings.count_documents(
            {
                "accommodation_id": acc.id,
                "room_type_id": {"$in": removed},
                "status": {"$in": ["pending", "confirmed"]},
            }
        )
        if active:
            raise HTTPException(
                409, f"{active} active booking(s) use the room type(s) you are removing: {', '.join(removed)}"
            )

    await db.accommodations.update_one({"_id": to_oid(acc_id)}, {"$set": to_doc(updated)})
    await log_action(
        db, user, "accommodation.update", "accommodation", acc_id, {"fields": sorted(changes)}
    )
    return updated


@router.post("/{acc_id}/owner", response_model=ManagedAccommodation)
async def reassign_owner(
    acc_id: str, body: OwnerIn, user: User = Depends(admin), db=Depends(get_db)
):
    """Admin: hand a property, and all of its bookings, to another manager."""
    acc = await _get(db, acc_id)
    new_owner = await _valid_owner(db, body.owner_id)
    if new_owner == acc.owner_id:
        raise HTTPException(409, "This user already owns the property")

    await db.accommodations.update_one({"_id": to_oid(acc_id)}, {"$set": {"owner_id": new_owner}})
    moved = await db.bookings.update_many(
        {"accommodation_id": acc.id}, {"$set": {"owner_id": new_owner}}
    )
    await log_action(
        db, user, "accommodation.owner", "accommodation", acc.id,
        {"from": acc.owner_id, "to": new_owner, "bookings_moved": moved.modified_count},
    )
    acc.owner_id = new_owner
    return (await _enrich(db, [acc]))[0]


@router.delete("/{acc_id}", status_code=204)
async def delete_accommodation(acc_id: str, user: User = Depends(admin), db=Depends(get_db)):
    acc = await _get(db, acc_id)
    active = await db.bookings.count_documents(
        {"accommodation_id": acc.id, "status": {"$in": ["pending", "confirmed"]}}
    )
    if active:
        raise HTTPException(409, f"{active} active booking(s) exist; cancel them first or hide the property")
    await db.accommodations.delete_one({"_id": to_oid(acc_id)})
    await db.inventory.delete_many({"accommodation_id": acc.id})
    await log_action(db, user, "accommodation.delete", "accommodation", acc.id)
    return Response(status_code=204)