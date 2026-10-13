import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.db import from_doc, get_db, to_doc, to_oid
from app.core.rbac import require_role
from app.models.accommodation import Accommodation
from app.models.booking import Booking, BookingIn, BookingStatus, StatusEvent
from app.models.user import Role, User
from app.services.audit import log_action
from app.services.booking_policy import can_transition, refund_for
from app.services.inventory import release, reserve
from app.services.pricing import nights_between, quote, rooms_needed, validated_nights

router = APIRouter(prefix="/bookings", tags=["bookings"])

registered = require_role(Role.user)
staff_role = require_role(Role.manager)


class ActionIn(BaseModel):
    note: str | None = None


class CancelPreview(BaseModel):
    refund_pct: int
    refund_jpy: int
    days_until_check_in: int


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def is_staff_for(user: User, booking: Booking) -> bool:
    """Admin, or the manager who owns the booked property."""
    return user.role == Role.admin or (user.role == Role.manager and booking.owner_id == user.id)


def _access(user: User, booking: Booking) -> bool:
    """Returns True if the caller acts as staff. Raises 403 if they have no relation to it."""
    staff = is_staff_for(user, booking)
    if not staff and booking.user_id != user.id:
        raise HTTPException(403, "Not your booking")
    return staff


def _require_staff(user: User, booking: Booking) -> None:
    if not is_staff_for(user, booking):
        raise HTTPException(403, "Only the property manager or an admin can do this")


async def _load(db, booking_id: str) -> Booking:
    doc = await db.bookings.find_one({"_id": to_oid(booking_id, "Booking")})
    if not doc:
        raise HTTPException(404, "Booking not found")
    return from_doc(Booking, doc)


async def _transition(
    db,
    booking: Booking,
    new_status: BookingStatus,
    actor: User,
    note: str | None = None,
    extra: dict | None = None,
) -> Booking:
    if not can_transition(booking.status, new_status):
        raise HTTPException(
            409, f"Cannot move a booking from {booking.status.value} to {new_status.value}"
        )
    now = _now()
    event = StatusEvent(status=new_status, at=now, by=actor.id, note=note)
    update = {
        "$set": {"status": new_status.value, "updated_at": now.isoformat(), **(extra or {})},
        "$push": {"history": event.model_dump(mode="json")},
    }
    # Matching on the old status makes the transition atomic: a concurrent change loses.
    res = await db.bookings.update_one(
        {"_id": to_oid(booking.id or ""), "status": booking.status.value}, update
    )
    if res.modified_count == 0:
        raise HTTPException(409, "The booking was changed by someone else; reload and retry")
    return await _load(db, booking.id or "")


@router.post("", response_model=Booking, status_code=201)
async def create_booking(body: BookingIn, user: User = Depends(registered), db=Depends(get_db)):
    doc = await db.accommodations.find_one({"_id": to_oid(body.accommodation_id, "Accommodation")})
    if not doc:
        raise HTTPException(404, "Accommodation not found")
    acc = from_doc(Accommodation, doc)
    if acc.status != "active":
        raise HTTPException(404, "Accommodation not found")

    room = next((r for r in acc.rooms if r.id == body.room_type_id), None)
    if room is None:
        raise HTTPException(404, "Room type not found")

    try:
        nights = validated_nights(body.check_in, body.check_out, dt.date.today())
    except ValueError as exc:
        raise HTTPException(422, str(exc))

    n_rooms = body.rooms or rooms_needed(body.guests, room)
    if n_rooms * room.capacity < body.guests:
        raise HTTPException(422, "Not enough room capacity for this many guests")
    if n_rooms > room.count:
        raise HTTPException(409, "The property does not have that many rooms of this type")

    if body.itinerary_id:
        found = await db.itineraries.find_one(
            {"_id": to_oid(body.itinerary_id, "Itinerary"), "owner_id": user.id}
        )
        if not found:
            raise HTTPException(404, "Itinerary not found")

    prices = quote(acc, room, body.check_in, body.check_out, n_rooms)

    if not await reserve(db, acc.id, room.id, nights, n_rooms, room.count):
        raise HTTPException(409, "No availability for the selected dates")

    now = _now()
    booking = Booking(
        user_id=user.id,
        owner_id=acc.owner_id,
        accommodation_id=acc.id,
        accommodation_name=acc.name.en,
        room_type_id=room.id,
        room_name=room.name.en,
        check_in=body.check_in,
        check_out=body.check_out,
        guests=body.guests,
        rooms=n_rooms,
        nightly_prices_jpy=prices,
        total_jpy=sum(prices),
        policy=acc.cancellation_policy,
        itinerary_id=body.itinerary_id,
        note=body.note,
        history=[StatusEvent(status=BookingStatus.pending, at=now, by=user.id)],
        created_at=now,
        updated_at=now,
    )
    try:
        res = await db.bookings.insert_one(to_doc(booking))
    except Exception:
        await release(db, acc.id, room.id, nights, n_rooms)
        raise
    booking.id = str(res.inserted_id)
    return booking


@router.get("/mine", response_model=list[Booking])
async def my_bookings(user: User = Depends(registered), db=Depends(get_db)):
    cursor = db.bookings.find({"user_id": user.id}).sort("created_at", -1).limit(100)
    return [from_doc(Booking, d) async for d in cursor]


@router.get("/managed", response_model=list[Booking])
async def managed_bookings(
    status: BookingStatus | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    user: User = Depends(staff_role),
    db=Depends(get_db),
):
    """Manager: bookings of own properties. Admin: all bookings."""
    q: dict = {} if user.role == Role.admin else {"owner_id": user.id}
    if status:
        q["status"] = status.value
    cursor = db.bookings.find(q).sort("check_in", 1).skip(skip).limit(limit)
    return [from_doc(Booking, d) async for d in cursor]


@router.get("/{booking_id}", response_model=Booking)
async def get_booking(booking_id: str, user: User = Depends(registered), db=Depends(get_db)):
    booking = await _load(db, booking_id)
    _access(user, booking)
    return booking


@router.get("/{booking_id}/cancellation-preview", response_model=CancelPreview)
async def cancellation_preview(
    booking_id: str, user: User = Depends(registered), db=Depends(get_db)
):
    booking = await _load(db, booking_id)
    staff = _access(user, booking)
    if not can_transition(booking.status, BookingStatus.cancelled):
        raise HTTPException(409, f"A {booking.status.value} booking cannot be cancelled")
    today = dt.date.today()
    pct, refund = refund_for(
        booking.policy,
        booking.check_in,
        today,
        booking.total_jpy,
        full=staff or booking.status == BookingStatus.pending,
    )
    return CancelPreview(
        refund_pct=pct, refund_jpy=refund, days_until_check_in=(booking.check_in - today).days
    )


@router.post("/{booking_id}/cancel", response_model=Booking)
async def cancel_booking(
    booking_id: str,
    body: ActionIn | None = None,
    user: User = Depends(registered),
    db=Depends(get_db),
):
    booking = await _load(db, booking_id)
    staff = _access(user, booking)
    today = dt.date.today()
    if not staff and today > booking.check_in:
        raise HTTPException(409, "The check-in date has passed; please contact the property")

    # Never-confirmed bookings and property-side cancellations are refunded in full.
    pct, refund = refund_for(
        booking.policy,
        booking.check_in,
        today,
        booking.total_jpy,
        full=staff or booking.status == BookingStatus.pending,
    )
    updated = await _transition(
        db,
        booking,
        BookingStatus.cancelled,
        user,
        note=body.note if body else None,
        extra={"refund_jpy": refund},
    )
    await release(
        db,
        booking.accommodation_id,
        booking.room_type_id,
        nights_between(booking.check_in, booking.check_out),
        booking.rooms,
    )
    if staff:
        await log_action(
            db, user, "booking.cancel", "booking", booking.id or "",
            {"refund_jpy": refund, "refund_pct": pct},
        )
    return updated


@router.post("/{booking_id}/confirm", response_model=Booking)
async def confirm_booking(
    booking_id: str,
    body: ActionIn | None = None,
    user: User = Depends(staff_role),
    db=Depends(get_db),
):
    booking = await _load(db, booking_id)
    _require_staff(user, booking)
    updated = await _transition(
        db, booking, BookingStatus.confirmed, user, note=body.note if body else None
    )
    await log_action(db, user, "booking.confirm", "booking", booking.id or "")
    return updated


@router.post("/{booking_id}/complete", response_model=Booking)
async def complete_booking(
    booking_id: str,
    body: ActionIn | None = None,
    user: User = Depends(staff_role),
    db=Depends(get_db),
):
    booking = await _load(db, booking_id)
    _require_staff(user, booking)
    if dt.date.today() < booking.check_out:
        raise HTTPException(409, "A stay can only be completed on or after the check-out date")
    updated = await _transition(
        db, booking, BookingStatus.completed, user, note=body.note if body else None
    )
    await log_action(db, user, "booking.complete", "booking", booking.id or "")
    return updated