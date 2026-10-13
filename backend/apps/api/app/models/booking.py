import datetime as dt
from enum import Enum

from pydantic import BaseModel, Field

from app.models.accommodation import CancellationTier


class BookingStatus(str, Enum):
    pending = "pending"
    confirmed = "confirmed"
    cancelled = "cancelled"
    completed = "completed"


class StatusEvent(BaseModel):
    status: BookingStatus
    at: dt.datetime
    by: str
    note: str | None = None


class BookingIn(BaseModel):
    accommodation_id: str
    room_type_id: str
    check_in: dt.date
    check_out: dt.date
    guests: int = Field(ge=1, le=20)
    rooms: int | None = Field(None, ge=1, le=10)  # default: the minimum that fits all guests
    itinerary_id: str | None = None
    note: str | None = Field(None, max_length=500)


class Booking(BaseModel):
    id: str | None = None
    user_id: str
    owner_id: str  # property manager, denormalised for fast "managed bookings" queries
    accommodation_id: str
    accommodation_name: str  # snapshot (en)
    room_type_id: str
    room_name: str  # snapshot (en)
    check_in: dt.date
    check_out: dt.date
    guests: int
    rooms: int
    nightly_prices_jpy: list[int]  # price snapshot, total for all rooms per night
    total_jpy: int
    policy: list[CancellationTier]  # policy snapshot at booking time
    status: BookingStatus = BookingStatus.pending
    itinerary_id: str | None = None
    note: str | None = None
    refund_jpy: int | None = None
    history: list[StatusEvent] = Field(default_factory=list)
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    updated_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))