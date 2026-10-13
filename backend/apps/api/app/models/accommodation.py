import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.models.common import GeoPoint, I18n

AccommodationType = Literal["hotel", "ryokan", "machiya", "hostel"]


class RoomType(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    name: I18n
    capacity: int = Field(2, ge=1, le=10)  # guests per room
    base_price_jpy: int = Field(gt=0)  # per room per night
    count: int = Field(1, ge=1, le=500)  # rooms of this type in the property


class SeasonRule(BaseModel):
    """Price multiplier for a date range (both ends inclusive)."""

    label: str
    date_from: dt.date
    date_to: dt.date
    multiplier: float = Field(gt=0, le=5)

    @model_validator(mode="after")
    def _ordered(self):
        if self.date_to < self.date_from:
            raise ValueError("date_to must not be earlier than date_from")
        return self


class CancellationTier(BaseModel):
    """If check-in is at least `days_before` days away, `refund_pct` % is refunded."""

    days_before: int = Field(ge=0)
    refund_pct: int = Field(ge=0, le=100)


def default_policy() -> list[CancellationTier]:
    return [
        CancellationTier(days_before=7, refund_pct=100),
        CancellationTier(days_before=3, refund_pct=50),
        CancellationTier(days_before=0, refund_pct=0),
    ]


class AccommodationIn(BaseModel):
    name: I18n
    description: I18n | None = None
    type: AccommodationType
    region_id: str
    city_id: str
    location: GeoPoint
    rooms: list[RoomType] = Field(min_length=1)
    weekend_multiplier: float = Field(1.0, ge=0.5, le=3)  # Friday and Saturday nights
    seasons: list[SeasonRule] = Field(default_factory=list)
    amenities: list[str] = Field(default_factory=list)
    cancellation_policy: list[CancellationTier] = Field(default_factory=default_policy)
    rating: float = Field(4.0, ge=0, le=5)
    status: Literal["active", "hidden"] = "active"

    @model_validator(mode="after")
    def _unique_room_ids(self):
        ids = [r.id for r in self.rooms]
        if len(ids) != len(set(ids)):
            raise ValueError("Room type ids must be unique within a property")
        return self


class Accommodation(AccommodationIn):
    id: str
    owner_id: str
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))


class AccommodationPatch(BaseModel):
    """Any subset of fields; the merged result is re-validated as a whole."""

    name: I18n | None = None
    description: I18n | None = None
    type: AccommodationType | None = None
    region_id: str | None = None
    city_id: str | None = None
    location: GeoPoint | None = None
    rooms: list[RoomType] | None = Field(None, min_length=1)
    weekend_multiplier: float | None = Field(None, ge=0.5, le=3)
    seasons: list[SeasonRule] | None = None
    amenities: list[str] | None = None
    cancellation_policy: list[CancellationTier] | None = None
    rating: float | None = Field(None, ge=0, le=5)
    status: Literal["active", "hidden"] | None = None